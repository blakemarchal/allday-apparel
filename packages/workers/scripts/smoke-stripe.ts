/**
 * Smoke test for the Stripe webhook event pipeline.
 *
 * Mimics what apps/web's webhook route does AFTER signature verification:
 *   1. Insert a row into stripe_webhook_event
 *   2. Enqueue a BullMQ job pointing to it
 *   3. Wait briefly
 *   4. Verify the worker marked the row processed
 *
 * Run with the worker process running in another terminal:
 *   pnpm --filter @allday/workers start    # (terminal 1)
 *   pnpm --filter @allday/workers tsx scripts/smoke-stripe.ts   # (terminal 2)
 */
import 'dotenv/config';
import { db } from '@allday/db';
import { stripeWebhookEvent } from '@allday/db/schema';
import { eq } from 'drizzle-orm';
import { stripeEventsQueue } from '../src/queue';

const stripeEventId = `evt_smoke_${Date.now()}`;
const eventType = 'checkout.session.completed';

const inserted = await db
  .insert(stripeWebhookEvent)
  .values({
    stripeEventId,
    eventType,
    payload: { smoke: true, note: 'inserted by smoke-stripe.ts' },
  })
  .returning({ id: stripeWebhookEvent.id });

const row = inserted[0];
if (!row) throw new Error('insert returned no row');

console.log(`[smoke] inserted stripe_webhook_event ${row.id} (${stripeEventId})`);

await stripeEventsQueue.add(eventType, {
  webhookEventId: row.id,
  stripeEventId,
  eventType,
});

console.log('[smoke] enqueued job; polling for processed_at...');

let processed = false;
for (let i = 0; i < 30; i++) {
  const [check] = await db
    .select({ processedAt: stripeWebhookEvent.processedAt, error: stripeWebhookEvent.error })
    .from(stripeWebhookEvent)
    .where(eq(stripeWebhookEvent.id, row.id))
    .limit(1);
  if (check?.processedAt) {
    console.log(`[smoke] ✓ processed at ${check.processedAt.toISOString()}`);
    processed = true;
    break;
  }
  if (check?.error) {
    console.error(`[smoke] ✗ error: ${check.error}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 200));
}

if (!processed) {
  console.error('[smoke] ✗ timed out waiting for worker (is `pnpm --filter @allday/workers start` running?)');
  process.exit(1);
}

await stripeEventsQueue.close();
process.exit(0);
