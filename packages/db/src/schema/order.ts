import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { orderStatusEnum, reservationStatusEnum } from './enums';
import { storefront } from './storefront';
import { variant } from './product';

// Optional. Created opportunistically when an order is placed.
// Guest checkout = no separate customer row before order creation.
export const customer = pgTable(
  'customer',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('customer_email_idx').on(t.email)],
);

export const order = pgTable(
  'order',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storefrontId: uuid('storefront_id')
      .notNull()
      .references(() => storefront.id, { onDelete: 'restrict' }),
    customerId: uuid('customer_id').references(() => customer.id, { onDelete: 'set null' }),

    stripeCheckoutSessionId: text('stripe_checkout_session_id').notNull(),
    stripePaymentIntentId: text('stripe_payment_intent_id'),

    status: orderStatusEnum('status').notNull().default('pending'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    shippingCents: integer('shipping_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    currency: text('currency').notNull().default('USD'),

    shippingAddress: jsonb('shipping_address'),
    billingAddress: jsonb('billing_address'),
    emailSnapshot: text('email_snapshot'),

    refundedAmountCents: integer('refunded_amount_cents').notNull().default(0),
    refundReason: text('refund_reason'),

    // Populated post-charge from Stripe BalanceTransaction.
    stripeFeeCents: integer('stripe_fee_cents'),
    // Actual carrier cost (distinct from shippingCents which is what customer paid).
    shippingLabelCostCents: integer('shipping_label_cost_cents'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('order_stripe_checkout_session_unique').on(t.stripeCheckoutSessionId),
    index('order_storefront_created_at_idx').on(t.storefrontId, t.createdAt),
    index('order_status_idx').on(t.status),
  ],
);

// Immutable snapshot of what was ordered. Catalog edits never mutate this row.
export const orderLineItem = pgTable(
  'order_line_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variant.id, { onDelete: 'restrict' }),
    skuSnapshot: text('sku_snapshot').notNull(),
    titleSnapshot: text('title_snapshot').notNull(),
    // Array of {name, value} pairs.
    optionsSnapshot: jsonb('options_snapshot').notNull().default([]),
    qty: integer('qty').notNull(),
    unitPriceCents: integer('unit_price_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    // Cost basis at sale time. Nullable for orders placed before cost data was set.
    unitCostCentsSnapshot: integer('unit_cost_cents_snapshot'),
  },
  (t) => [index('order_line_item_order_idx').on(t.orderId)],
);

// Reservation system — the load-bearing piece for drop concurrency.
// One row per Stripe Checkout Session × variant line.
// Lifecycle: held → consumed (on session.completed) | released (on session.expired or sweeper).
export const reservation = pgTable(
  'reservation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variant.id, { onDelete: 'restrict' }),
    qty: integer('qty').notNull(),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    status: reservationStatusEnum('status').notNull().default('held'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('reservation_session_idx').on(t.stripeCheckoutSessionId),
    // Partial index — sweeper job scans only held + expired rows.
    index('reservation_held_expires_idx').on(t.expiresAt).where(sql`status = 'held'`),
  ],
);
