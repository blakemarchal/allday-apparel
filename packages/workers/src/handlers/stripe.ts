import type { Job } from 'bullmq';
import { db } from '@allday/db';
import { stripeWebhookEvent } from '@allday/db/schema';
import { eq } from 'drizzle-orm';
import type { StripeEventJob } from '../queue';

/**
 * Top-level Stripe event handler. Dispatches by event type to the right
 * domain logic, then marks the webhook event row as processed.
 *
 * Stubs for the v1 scaffold:
 *   - checkout.session.completed: real logic (consume reservation → create
 *     order + line items with cost snapshots → insert payout_accrual →
 *     enqueue confirmation email) lands in a follow-up commit.
 *   - checkout.session.expired: real logic (release reservation, decrement
 *     qty_reserved) lands with the same follow-up.
 */
export async function handleStripeEvent(job: Job<StripeEventJob>): Promise<void> {
  const { webhookEventId, stripeEventId, eventType } = job.data;

  console.log(`[stripe] processing ${stripeEventId} (${eventType})`);

  try {
    switch (eventType) {
      case 'checkout.session.completed':
        // TODO(task #7 follow-up): consume reservation, create order + line
        // items with cost snapshots, insert payout_accrual, enqueue email.
        console.log(`[stripe] (stub) consume session for ${stripeEventId}`);
        break;

      case 'checkout.session.expired':
        // TODO(task #7 follow-up): release reservation (decrement qty_reserved,
        // set reservation.status = 'released').
        console.log(`[stripe] (stub) release reservation for ${stripeEventId}`);
        break;

      default:
        console.log(`[stripe] no handler for ${eventType}; marking processed`);
        break;
    }

    await db
      .update(stripeWebhookEvent)
      .set({ processedAt: new Date() })
      .where(eq(stripeWebhookEvent.id, webhookEventId));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // Persist for visibility. BullMQ will retry per defaultJobOptions.
    await db
      .update(stripeWebhookEvent)
      .set({ error: message })
      .where(eq(stripeWebhookEvent.id, webhookEventId));
    throw err;
  }
}
