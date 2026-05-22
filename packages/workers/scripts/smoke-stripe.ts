/**
 * End-to-end smoke test for the Stripe checkout pipeline.
 *
 * Tests both paths against a running worker:
 *   1. checkout.session.completed — consumes the reservation, creates the
 *      order + line items with cost/options snapshots, accrues the payout.
 *   2. checkout.session.expired — releases the reservation without touching
 *      qty_on_hand.
 *
 * Usage (two terminals):
 *   pnpm --filter @allday/workers start                                # terminal 1
 *   pnpm --filter @allday/workers exec tsx scripts/smoke-stripe.ts     # terminal 2
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@allday/db';
import {
  storefront,
  product,
  productOption,
  productOptionValue,
  variant,
  variantOptionValue,
  inventoryItem,
  reservation,
  stripeWebhookEvent,
  order,
  orderLineItem,
  payoutAccrual,
} from '@allday/db/schema';
import { stripeEventsQueue } from '../src/queue';

const ts = Date.now();

// -----------------------------------------------------------------------------
// Seed: one storefront (reuse if exists), one product with Size: M, $30 price,
// $12 cost, 10 on hand, no reservations.
// -----------------------------------------------------------------------------

console.log(`[smoke] seeding (run id ${ts})...`);

let [sf] = await db
  .select()
  .from(storefront)
  .where(eq(storefront.slug, 'apparel'))
  .limit(1);
if (!sf) {
  [sf] = await db
    .insert(storefront)
    .values({ slug: 'apparel', name: 'Allday Apparel' })
    .returning();
}
if (!sf) throw new Error('failed to ensure storefront');

const [prod] = await db
  .insert(product)
  .values({
    storefrontId: sf.id,
    slug: `smoke-tee-${ts}`,
    title: `Smoke Tee ${ts}`,
    status: 'published',
  })
  .returning();
if (!prod) throw new Error('failed to insert product');

const [opt] = await db
  .insert(productOption)
  .values({ productId: prod.id, name: 'Size', position: 0 })
  .returning();
if (!opt) throw new Error('failed to insert product_option');

const [optVal] = await db
  .insert(productOptionValue)
  .values({ productOptionId: opt.id, value: 'M', position: 0 })
  .returning();
if (!optVal) throw new Error('failed to insert product_option_value');

const [v] = await db
  .insert(variant)
  .values({
    productId: prod.id,
    sku: `SMOKE-TEE-${ts}-M`,
    priceCents: 3000,
    costCents: 1200,
    status: 'published',
  })
  .returning();
if (!v) throw new Error('failed to insert variant');

await db.insert(variantOptionValue).values({
  variantId: v.id,
  productOptionValueId: optVal.id,
});

await db
  .insert(inventoryItem)
  .values({ variantId: v.id, qtyOnHand: 10, qtyReserved: 0, lowStockThreshold: 2 });

console.log(`[smoke] seeded variant ${v.id} (10 on hand, $30 price, $12 cost)`);

// -----------------------------------------------------------------------------
// Phase 1: checkout.session.completed
// -----------------------------------------------------------------------------

console.log('\n[smoke] === PHASE 1: checkout.session.completed ===');

const completedSessionId = `cs_smoke_completed_${ts}`;

// Hold 2 units on the variant.
const [held1] = await db
  .insert(reservation)
  .values({
    variantId: v.id,
    qty: 2,
    unitPriceCents: 3000,
    stripeCheckoutSessionId: completedSessionId,
    expiresAt: new Date(Date.now() + 20 * 60 * 1000),
    status: 'held',
  })
  .returning();
if (!held1) throw new Error('failed to insert reservation');

await db
  .update(inventoryItem)
  .set({ qtyReserved: 2 })
  .where(eq(inventoryItem.variantId, v.id));

console.log(`[smoke] reservation ${held1.id} held (qty=2)`);

// Build a session payload matching Stripe's shape.
const completedSessionPayload = {
  id: completedSessionId,
  object: 'checkout.session',
  amount_subtotal: 6000,
  amount_total: 6649,
  total_details: { amount_tax: 350, amount_shipping: 299 },
  currency: 'usd',
  customer: null,
  customer_email: 'fan@example.com',
  customer_details: {
    email: 'fan@example.com',
    address: { line1: '123 Main St', city: 'Anytown', state: 'CA', postal_code: '90001', country: 'US' },
    name: 'Test Fan',
  },
  payment_intent: `pi_smoke_${ts}`,
  shipping_details: {
    address: { line1: '123 Main St', city: 'Anytown', state: 'CA', postal_code: '90001', country: 'US' },
    name: 'Test Fan',
  },
};

const completedEventId = `evt_smoke_completed_${ts}`;
const [completedEvent] = await db
  .insert(stripeWebhookEvent)
  .values({
    stripeEventId: completedEventId,
    eventType: 'checkout.session.completed',
    payload: {
      id: completedEventId,
      type: 'checkout.session.completed',
      data: { object: completedSessionPayload },
    },
  })
  .returning({ id: stripeWebhookEvent.id });
if (!completedEvent) throw new Error('failed to insert webhook event');

await stripeEventsQueue.add('checkout.session.completed', {
  webhookEventId: completedEvent.id,
  stripeEventId: completedEventId,
  eventType: 'checkout.session.completed',
});

console.log('[smoke] enqueued completed event; polling...');

// Poll for processing.
let processed = false;
for (let i = 0; i < 50; i++) {
  const [evt] = await db
    .select({ processedAt: stripeWebhookEvent.processedAt, error: stripeWebhookEvent.error })
    .from(stripeWebhookEvent)
    .where(eq(stripeWebhookEvent.id, completedEvent.id))
    .limit(1);
  if (evt?.processedAt) {
    processed = true;
    break;
  }
  if (evt?.error) {
    console.error(`[smoke] ✗ worker error: ${evt.error}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 200));
}
if (!processed) {
  console.error('[smoke] ✗ timed out (worker not running?)');
  process.exit(1);
}

// Verify all the expected mutations landed.
const [reservationAfter] = await db
  .select()
  .from(reservation)
  .where(eq(reservation.id, held1.id))
  .limit(1);
const [inventoryAfter] = await db
  .select()
  .from(inventoryItem)
  .where(eq(inventoryItem.variantId, v.id))
  .limit(1);
const [orderRow] = await db
  .select()
  .from(order)
  .where(eq(order.stripeCheckoutSessionId, completedSessionId))
  .limit(1);
const lineItems = orderRow
  ? await db.select().from(orderLineItem).where(eq(orderLineItem.orderId, orderRow.id))
  : [];
const [accrual] = orderRow
  ? await db
      .select()
      .from(payoutAccrual)
      .where(eq(payoutAccrual.orderId, orderRow.id))
      .limit(1)
  : [];

const checks: Array<[string, boolean, string]> = [
  ['reservation consumed', reservationAfter?.status === 'consumed', `status=${reservationAfter?.status}`],
  ['qty_on_hand decremented (10 -> 8)', inventoryAfter?.qtyOnHand === 8, `qty_on_hand=${inventoryAfter?.qtyOnHand}`],
  ['qty_reserved decremented (2 -> 0)', inventoryAfter?.qtyReserved === 0, `qty_reserved=${inventoryAfter?.qtyReserved}`],
  ['order created', Boolean(orderRow), orderRow ? `order=${orderRow.id}` : 'no order'],
  ['order.status = paid', orderRow?.status === 'paid', `status=${orderRow?.status}`],
  ['order subtotal=6000', orderRow?.subtotalCents === 6000, `subtotal=${orderRow?.subtotalCents}`],
  ['order tax=350', orderRow?.taxCents === 350, `tax=${orderRow?.taxCents}`],
  ['order shipping=299', orderRow?.shippingCents === 299, `shipping=${orderRow?.shippingCents}`],
  ['one line item', lineItems.length === 1, `count=${lineItems.length}`],
  ['line item qty=2', lineItems[0]?.qty === 2, `qty=${lineItems[0]?.qty}`],
  ['line item unit_price=3000', lineItems[0]?.unitPriceCents === 3000, `unit_price=${lineItems[0]?.unitPriceCents}`],
  ['line item unit_cost snapshot=1200', lineItems[0]?.unitCostCentsSnapshot === 1200, `unit_cost=${lineItems[0]?.unitCostCentsSnapshot}`],
  ['line item title includes "M"', lineItems[0]?.titleSnapshot?.includes('M') ?? false, `title=${lineItems[0]?.titleSnapshot}`],
  ['payout accrual created', Boolean(accrual), accrual ? `accrual=${accrual.id}` : 'no accrual'],
  ['accrual gross=6000', accrual?.grossCents === 6000, `gross=${accrual?.grossCents}`],
  ['accrual cogs=2400 (2 * 1200)', accrual?.cogsCents === 2400, `cogs=${accrual?.cogsCents}`],
  // 2.9% of 6649 = 192.821 -> 193; + 30 = 223
  ['accrual stripe_fee=223 (estimate)', accrual?.stripeFeeCents === 223, `fee=${accrual?.stripeFeeCents}`],
  // 6000 - 2400 - 223 = 3377
  ['accrual net_margin=3377', accrual?.netMarginCents === 3377, `net=${accrual?.netMarginCents}`],
  // 3377 * 2000 / 10000 = 675.4 -> 675
  ['accrual amount=675 (20% of net)', accrual?.amountCents === 675, `amount=${accrual?.amountCents}`],
];

let phase1Failed = 0;
for (const [name, ok, detail] of checks) {
  if (ok) {
    console.log(`[smoke]   ✓ ${name}`);
  } else {
    console.error(`[smoke]   ✗ ${name} — ${detail}`);
    phase1Failed++;
  }
}

// -----------------------------------------------------------------------------
// Phase 2: checkout.session.expired
// -----------------------------------------------------------------------------

console.log('\n[smoke] === PHASE 2: checkout.session.expired ===');

const expiredSessionId = `cs_smoke_expired_${ts}`;

const [held2] = await db
  .insert(reservation)
  .values({
    variantId: v.id,
    qty: 3,
    unitPriceCents: 3000,
    stripeCheckoutSessionId: expiredSessionId,
    expiresAt: new Date(Date.now() - 60_000), // already past
    status: 'held',
  })
  .returning();
if (!held2) throw new Error('failed to insert second reservation');

// Manually bump qty_reserved to simulate what checkout would have done.
await db
  .update(inventoryItem)
  .set({ qtyReserved: 3 })
  .where(eq(inventoryItem.variantId, v.id));

const inventoryBeforeExpire = await db
  .select()
  .from(inventoryItem)
  .where(eq(inventoryItem.variantId, v.id))
  .limit(1);

console.log(
  `[smoke] reservation ${held2.id} held (qty=3, qty_on_hand=${inventoryBeforeExpire[0]?.qtyOnHand}, qty_reserved=${inventoryBeforeExpire[0]?.qtyReserved})`,
);

const expiredEventId = `evt_smoke_expired_${ts}`;
const [expiredEvent] = await db
  .insert(stripeWebhookEvent)
  .values({
    stripeEventId: expiredEventId,
    eventType: 'checkout.session.expired',
    payload: {
      id: expiredEventId,
      type: 'checkout.session.expired',
      data: { object: { ...completedSessionPayload, id: expiredSessionId } },
    },
  })
  .returning({ id: stripeWebhookEvent.id });
if (!expiredEvent) throw new Error('failed to insert expired webhook event');

await stripeEventsQueue.add('checkout.session.expired', {
  webhookEventId: expiredEvent.id,
  stripeEventId: expiredEventId,
  eventType: 'checkout.session.expired',
});

console.log('[smoke] enqueued expired event; polling...');

processed = false;
for (let i = 0; i < 50; i++) {
  const [evt] = await db
    .select({ processedAt: stripeWebhookEvent.processedAt, error: stripeWebhookEvent.error })
    .from(stripeWebhookEvent)
    .where(eq(stripeWebhookEvent.id, expiredEvent.id))
    .limit(1);
  if (evt?.processedAt) {
    processed = true;
    break;
  }
  if (evt?.error) {
    console.error(`[smoke] ✗ worker error: ${evt.error}`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 200));
}
if (!processed) {
  console.error('[smoke] ✗ timed out');
  process.exit(1);
}

const [reservationAfter2] = await db
  .select()
  .from(reservation)
  .where(eq(reservation.id, held2.id))
  .limit(1);
const [inventoryAfter2] = await db
  .select()
  .from(inventoryItem)
  .where(eq(inventoryItem.variantId, v.id))
  .limit(1);

const phase2Checks: Array<[string, boolean, string]> = [
  ['reservation released', reservationAfter2?.status === 'released', `status=${reservationAfter2?.status}`],
  ['qty_on_hand UNCHANGED (still 8)', inventoryAfter2?.qtyOnHand === 8, `qty_on_hand=${inventoryAfter2?.qtyOnHand}`],
  ['qty_reserved decremented (3 -> 0)', inventoryAfter2?.qtyReserved === 0, `qty_reserved=${inventoryAfter2?.qtyReserved}`],
];

let phase2Failed = 0;
for (const [name, ok, detail] of phase2Checks) {
  if (ok) {
    console.log(`[smoke]   ✓ ${name}`);
  } else {
    console.error(`[smoke]   ✗ ${name} — ${detail}`);
    phase2Failed++;
  }
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

const totalFailed = phase1Failed + phase2Failed;
const totalChecks = checks.length + phase2Checks.length;
console.log(`\n[smoke] ${totalChecks - totalFailed}/${totalChecks} checks passed`);

await stripeEventsQueue.close();
process.exit(totalFailed === 0 ? 0 : 1);
