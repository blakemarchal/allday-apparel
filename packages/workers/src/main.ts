import 'dotenv/config';
import { Worker } from 'bullmq';
import { connection, stripeEventsQueueName, type StripeEventJob } from './queue';
import { handleStripeEvent } from './handlers/stripe';

console.log('[workers] starting...');
console.log(`[workers] redis: ${process.env.REDIS_URL}`);
console.log(`[workers] queue: ${stripeEventsQueueName}`);

const stripeWorker = new Worker<StripeEventJob>(stripeEventsQueueName, handleStripeEvent, {
  connection,
  // 5 concurrent jobs is sane for v1. Most work is DB I/O bound.
  concurrency: 5,
});

stripeWorker.on('ready', () => {
  console.log('[workers] ready');
});

stripeWorker.on('completed', (job) => {
  console.log(`[workers] ✓ ${job.id} ${job.data.stripeEventId}`);
});

stripeWorker.on('failed', (job, err) => {
  console.error(
    `[workers] ✗ ${job?.id} ${job?.data?.stripeEventId ?? '?'} — ${err.message}`,
  );
});

stripeWorker.on('error', (err) => {
  console.error(`[workers] worker error: ${err.message}`);
});

// Graceful shutdown so in-flight jobs aren't yanked.
const shutdown = async (signal: string): Promise<void> => {
  console.log(`[workers] received ${signal}, draining...`);
  await stripeWorker.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
