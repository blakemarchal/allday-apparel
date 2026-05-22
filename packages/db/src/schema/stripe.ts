import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Idempotency log for Stripe webhooks. Every received event lands here exactly once.
// Handler does INSERT ON CONFLICT DO NOTHING on stripe_event_id; skip if row exists.
export const stripeWebhookEvent = pgTable(
  'stripe_webhook_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeEventId: text('stripe_event_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => [uniqueIndex('stripe_webhook_event_stripe_event_id_unique').on(t.stripeEventId)],
);
