import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { payoutAccrualStatusEnum } from './enums';
import { order } from './order';

// Actual payments from Will to Blake. Closes out one or more accruals.
export const payoutDisbursement = pgTable('payout_disbursement', {
  id: uuid('id').primaryKey().defaultRandom(),
  amountCents: integer('amount_cents').notNull(),
  method: text('method').notNull(), // e.g. 'venmo', 'zelle', 'bank_transfer'
  reference: text('reference'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// One row per paid order. Snapshots both the basis and the pct so changing the
// rate later doesn't rewrite history. Computed by the BullMQ worker on
// checkout.session.completed.
export const payoutAccrual = pgTable(
  'payout_accrual',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'restrict' }),

    // Snapshots at accrual time.
    grossCents: integer('gross_cents').notNull(),
    cogsCents: integer('cogs_cents').notNull().default(0),
    stripeFeeCents: integer('stripe_fee_cents').notNull().default(0),
    shippingLabelCostCents: integer('shipping_label_cost_cents'),

    // Computed: gross - cogs - stripe_fee - COALESCE(shipping_label_cost, 0).
    // Tax excluded (Stripe Tax remits it; not Will's money).
    netMarginCents: integer('net_margin_cents').notNull(),

    // Rate at accrual time, in basis points (2000 = 20%). Source: PARTNER_PAYOUT_PCT_BPS env.
    pctBasisPointsSnapshot: integer('pct_basis_points_snapshot').notNull(),

    // Computed: net_margin_cents * pct_basis_points_snapshot / 10000.
    amountCents: integer('amount_cents').notNull(),

    status: payoutAccrualStatusEnum('status').notNull().default('accrued'),
    disbursementId: uuid('disbursement_id').references(() => payoutDisbursement.id, {
      onDelete: 'set null',
    }),
    voidedReason: text('voided_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One accrual per order.
    uniqueIndex('payout_accrual_order_unique').on(t.orderId),
    // Admin "outstanding accruals" list.
    index('payout_accrual_status_created_at_idx').on(t.status, t.createdAt),
    // Reconciliation queries.
    index('payout_accrual_disbursement_idx').on(t.disbursementId),
  ],
);
