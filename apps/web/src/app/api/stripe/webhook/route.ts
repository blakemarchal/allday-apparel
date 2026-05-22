import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { db } from '@allday/db';
import { stripeWebhookEvent } from '@allday/db/schema';
import { stripeEventsQueue } from '@allday/workers/queue';

// Webhooks must hit the Node runtime (Stripe SDK + postgres-js need it).
export const runtime = 'nodejs';
// Never cache; never pre-render.
export const dynamic = 'force-dynamic';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_API_VERSION = (process.env.STRIPE_API_VERSION ??
  '2024-12-18.acacia') as Stripe.LatestApiVersion;

const stripe = new Stripe(STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: STRIPE_API_VERSION,
});

/**
 * Stripe webhook entry point.
 *
 * The handler does the MINIMUM inline (per CLAUDE.md standing rules):
 *   1. Verify signature.
 *   2. Idempotent persist into stripe_webhook_event (UNIQUE on stripe_event_id).
 *   3. Enqueue a BullMQ job for the heavy work.
 *   4. Return 200.
 *
 * All inventory / order / payout logic runs in the worker process. This keeps
 * the webhook response well under Stripe's 30-second timeout even during DB
 * hiccups, and lets retries land cleanly because the event has already been
 * persisted by step 2.
 *
 * Local testing:
 *   stripe listen --forward-to localhost:3001/api/stripe/webhook
 *   stripe trigger checkout.session.completed
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json(
      { error: 'webhook secret not configured' },
      { status: 500 },
    );
  }

  // Stripe requires the raw body string for signature verification.
  // req.json() / req.formData() consume the stream — must use req.text() here.
  const rawBody = await req.text();
  const hdrs = await headers();
  const signature = hdrs.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'missing stripe-signature header' },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error(`[webhook] signature verification failed: ${message}`);
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  // Idempotent persist. ON CONFLICT DO NOTHING makes Stripe retries a no-op.
  const inserted = await db
    .insert(stripeWebhookEvent)
    .values({
      stripeEventId: event.id,
      eventType: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: stripeWebhookEvent.stripeEventId })
    .returning({ id: stripeWebhookEvent.id });

  if (inserted.length === 0) {
    // Already received — nothing to enqueue. 200 so Stripe stops retrying.
    return NextResponse.json({ status: 'duplicate', eventId: event.id });
  }

  const webhookEventId = inserted[0]!.id;

  await stripeEventsQueue.add(event.type, {
    webhookEventId,
    stripeEventId: event.id,
    eventType: event.type,
  });

  return NextResponse.json({ status: 'queued', eventId: event.id });
}
