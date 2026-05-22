import { pgEnum } from 'drizzle-orm/pg-core';

// Catalog lifecycle states.
export const productStatusEnum = pgEnum('product_status', ['draft', 'published', 'archived']);
export const variantStatusEnum = pgEnum('variant_status', ['draft', 'published', 'archived']);

// Drops.
export const dropStatusEnum = pgEnum('drop_status', ['draft', 'scheduled', 'live', 'ended']);

// Orders.
export const orderStatusEnum = pgEnum('order_status', [
  'pending',
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
  'partially_refunded',
]);

// Reservation lifecycle (drop concurrency control).
export const reservationStatusEnum = pgEnum('reservation_status', ['held', 'consumed', 'released']);

// Partner payout accruals (Blake's cut per order).
export const payoutAccrualStatusEnum = pgEnum('payout_accrual_status', [
  'accrued',
  'paid',
  'voided',
]);

// Invoice ingestion pipeline.
export const invoiceUploadStatusEnum = pgEnum('invoice_upload_status', [
  'uploaded',
  'extracting',
  'extracted',
  'applied',
  'rejected',
  'failed',
]);

export const invoiceUploadSourceEnum = pgEnum('invoice_upload_source', [
  'manual_upload',
  'email_inbound',
  'api',
]);

// Where an email_subscriber row was captured from.
export const emailSubscriberSourceEnum = pgEnum('email_subscriber_source', [
  'popup',
  'footer',
  'checkout',
  'drop_signup',
  'manual_admin',
]);
