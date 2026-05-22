import { Queue, type ConnectionOptions } from 'bullmq';

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error('REDIS_URL is not set');
}

// Parse the Redis URL into BullMQ-compatible connection options.
const parsed = new URL(url);
export const connection: ConnectionOptions = {
  host: parsed.hostname,
  port: Number.parseInt(parsed.port || '6379', 10),
  username: parsed.username || undefined,
  password: parsed.password || undefined,
  // BullMQ workers need this — blocking commands fail otherwise.
  maxRetriesPerRequest: null,
};

// Single queue for Stripe events at v1. Split into multiple queues later if
// per-event-type concurrency / priority isolation becomes useful.
export const stripeEventsQueueName = 'stripe-events';

export const stripeEventsQueue = new Queue(stripeEventsQueueName, {
  connection,
  defaultJobOptions: {
    // BullMQ default retry: 3 attempts with exponential backoff.
    // Bump this if Stripe events become flakier or our worker hits transient errors.
    attempts: 5,
    backoff: { type: 'exponential', delay: 1_000 },
    // Trim history so the queue doesn't grow unbounded.
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 5_000 },
    removeOnFail: { age: 30 * 24 * 60 * 60 },
  },
});

export type StripeEventJob = {
  /** FK into stripe_webhook_event.id — where the raw payload lives. */
  webhookEventId: string;
  /** Stripe's `evt_...` id for log correlation. */
  stripeEventId: string;
  /** e.g. `checkout.session.completed`. */
  eventType: string;
};
