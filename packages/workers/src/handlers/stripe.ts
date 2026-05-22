import type { Job } from 'bullmq';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { db } from '@allday/db';
import {
  stripeWebhookEvent,
  reservation,
  inventoryItem,
  order,
  orderLineItem,
  customer,
  variant,
  product,
  productOption,
  productOptionValue,
  variantOptionValue,
  payoutAccrual,
} from '@allday/db/schema';
import type { StripeEventJob } from '../queue';

// =============================================================================
// Stripe event handler — consume/release reservations on checkout sessions
// =============================================================================
//
// Idempotency:
//   - Webhook event row already deduplicated by stripe_event_id UNIQUE at the
//     webhook endpoint. We process exactly once per event.
//   - Within a single processing call, every mutation is idempotent on retry:
//       - Order creation guarded by stripe_checkout_session_id UNIQUE; if the
//         row exists, we skip the whole consume.
//       - Reservation transitions filter on status = 'held'; second pass is a
//         no-op because rows are already 'consumed'/'released'.
//       - Payout accrual has UNIQUE(order_id); the order check above already
//         prevents getting here twice.
//
// Isolation:
//   - SERIALIZABLE for both consume and release. Inventory math under
//     contention (concurrent webhooks for different sessions on the same
//     variant) must not race; SERIALIZABLE is the strictest level and Postgres
//     will surface conflicts as serialization failures, which BullMQ retries.
//
// What's NOT here yet (deferred):
//   - Order confirmation email enqueue (lands with task #11 / Resend wiring).
//   - Real Stripe fee from BalanceTransaction; we estimate at 2.9% + $0.30.
//   - shipping_label_cost_cents stays NULL; populated when the admin buys a
//     label (Shippo/EasyPost integration is a separate task).

// -----------------------------------------------------------------------------
// Types — narrow view of the Stripe payload we actually use
// -----------------------------------------------------------------------------

/** Minimal shape of a checkout.session.{completed,expired} payload. */
type CheckoutSessionPayload = {
  id: string;
  amount_subtotal: number | null;
  amount_total: number | null;
  total_details?: {
    amount_tax: number | null;
    amount_shipping: number | null;
  } | null;
  currency: string | null;
  customer: string | { id: string } | null;
  customer_email: string | null;
  customer_details?: {
    email: string | null;
    address?: unknown;
    name?: string | null;
  } | null;
  payment_intent: string | { id: string } | null;
  shipping_details?: {
    address?: unknown;
    name?: string | null;
  } | null;
};

type StripeEventPayload = {
  id: string;
  type: string;
  data: { object: CheckoutSessionPayload };
};

// -----------------------------------------------------------------------------
// Config + helpers
// -----------------------------------------------------------------------------

const PARTNER_PAYOUT_PCT_BPS = Number.parseInt(
  process.env.PARTNER_PAYOUT_PCT_BPS ?? '2000',
  10,
);

/** Stripe standard pricing: 2.9% + $0.30 per charge. Replaced by actual fee
 * from BalanceTransaction in a follow-up. */
function estimateStripeFee(grossCents: number): number {
  return Math.round(grossCents * 0.029) + 30;
}

function asStripeCustomerId(c: CheckoutSessionPayload['customer']): string | null {
  if (!c) return null;
  return typeof c === 'string' ? c : c.id;
}

function asPaymentIntentId(p: CheckoutSessionPayload['payment_intent']): string | null {
  if (!p) return null;
  return typeof p === 'string' ? p : p.id;
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

export async function handleStripeEvent(job: Job<StripeEventJob>): Promise<void> {
  const { webhookEventId, stripeEventId, eventType } = job.data;
  console.log(`[stripe] processing ${stripeEventId} (${eventType})`);

  try {
    const [row] = await db
      .select({ payload: stripeWebhookEvent.payload })
      .from(stripeWebhookEvent)
      .where(eq(stripeWebhookEvent.id, webhookEventId))
      .limit(1);
    if (!row) {
      throw new Error(`webhook event ${webhookEventId} not found`);
    }

    const event = row.payload as StripeEventPayload;
    const session = event.data.object;

    switch (eventType) {
      case 'checkout.session.completed':
        await consumeCheckoutSession(session);
        break;
      case 'checkout.session.expired':
        await releaseCheckoutSession(session);
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
    await db
      .update(stripeWebhookEvent)
      .set({ error: message })
      .where(eq(stripeWebhookEvent.id, webhookEventId));
    throw err;
  }
}

// -----------------------------------------------------------------------------
// checkout.session.completed — happy path
// -----------------------------------------------------------------------------

async function consumeCheckoutSession(session: CheckoutSessionPayload): Promise<void> {
  const sessionId = session.id;
  console.log(`[stripe] consume session ${sessionId}`);

  await db.transaction(
    async (tx) => {
      // Idempotency gate: order already exists -> we're a retry. Skip.
      const [existingOrder] = await tx
        .select({ id: order.id })
        .from(order)
        .where(eq(order.stripeCheckoutSessionId, sessionId))
        .limit(1);
      if (existingOrder) {
        console.log(
          `[stripe] order ${existingOrder.id} already exists for ${sessionId} — skipping`,
        );
        return;
      }

      // Pull all held reservations for this session.
      const reservations = await tx
        .select()
        .from(reservation)
        .where(
          and(
            eq(reservation.stripeCheckoutSessionId, sessionId),
            eq(reservation.status, 'held'),
          ),
        );

      if (reservations.length === 0) {
        console.warn(
          `[stripe] no held reservations for ${sessionId} — already consumed or test event`,
        );
        return;
      }

      // Resolve each variant to its product + storefront + cost.
      const variantIds = reservations.map((r) => r.variantId);
      const variants = await tx
        .select({
          id: variant.id,
          sku: variant.sku,
          costCents: variant.costCents,
          storefrontId: product.storefrontId,
          productTitle: product.title,
        })
        .from(variant)
        .innerJoin(product, eq(product.id, variant.productId))
        .where(inArray(variant.id, variantIds));

      const variantById = new Map(variants.map((v) => [v.id, v]));
      const storefrontId = variants[0]?.storefrontId;
      if (!storefrontId) {
        throw new Error(`no variants resolved for reservations of ${sessionId}`);
      }
      for (const v of variants) {
        if (v.storefrontId !== storefrontId) {
          throw new Error(`session ${sessionId} spans multiple storefronts — refusing`);
        }
      }

      // Consume each reservation: decrement BOTH qty_on_hand and qty_reserved
      // (the customer now owns those units), flip status to 'consumed'.
      for (const r of reservations) {
        await tx
          .update(inventoryItem)
          .set({
            qtyOnHand: sql`${inventoryItem.qtyOnHand} - ${r.qty}`,
            qtyReserved: sql`${inventoryItem.qtyReserved} - ${r.qty}`,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItem.variantId, r.variantId));

        await tx
          .update(reservation)
          .set({ status: 'consumed', updatedAt: new Date() })
          .where(eq(reservation.id, r.id));
      }

      // Resolve / create customer (opportunistic — guest checkout still works).
      const rawEmail = session.customer_details?.email ?? session.customer_email ?? null;
      const customerEmail = rawEmail ? rawEmail.toLowerCase() : null;
      let customerId: string | null = null;
      if (customerEmail) {
        const [existingCustomer] = await tx
          .select({ id: customer.id })
          .from(customer)
          .where(eq(customer.email, customerEmail))
          .limit(1);
        if (existingCustomer) {
          customerId = existingCustomer.id;
        } else {
          const [newCustomer] = await tx
            .insert(customer)
            .values({
              email: customerEmail,
              stripeCustomerId: asStripeCustomerId(session.customer),
            })
            .returning({ id: customer.id });
          customerId = newCustomer?.id ?? null;
        }
      }

      // Build the order from session totals.
      const subtotalCents = session.amount_subtotal ?? 0;
      const totalCents = session.amount_total ?? 0;
      const taxCents = session.total_details?.amount_tax ?? 0;
      const shippingCents = session.total_details?.amount_shipping ?? 0;
      const currency = (session.currency ?? 'usd').toUpperCase();

      const [newOrder] = await tx
        .insert(order)
        .values({
          storefrontId,
          customerId,
          stripeCheckoutSessionId: sessionId,
          stripePaymentIntentId: asPaymentIntentId(session.payment_intent),
          status: 'paid',
          subtotalCents,
          taxCents,
          shippingCents,
          totalCents,
          currency,
          shippingAddress: (session.shipping_details?.address ?? null) as never,
          billingAddress: (session.customer_details?.address ?? null) as never,
          emailSnapshot: customerEmail,
          paidAt: new Date(),
        })
        .returning({ id: order.id });
      if (!newOrder) throw new Error('order insert returned no row');
      const orderId = newOrder.id;

      // Line items + COGS rollup.
      let cogsCents = 0;
      for (const r of reservations) {
        const v = variantById.get(r.variantId);
        if (!v) throw new Error(`variant ${r.variantId} missing during line-item build`);

        // Snapshot option values (e.g. [{name: 'Size', value: 'M'}, ...]).
        const optionRows = await tx
          .select({
            name: productOption.name,
            value: productOptionValue.value,
          })
          .from(variantOptionValue)
          .innerJoin(
            productOptionValue,
            eq(productOptionValue.id, variantOptionValue.productOptionValueId),
          )
          .innerJoin(productOption, eq(productOption.id, productOptionValue.productOptionId))
          .where(eq(variantOptionValue.variantId, r.variantId));

        const optionsSnapshot = optionRows.map((o) => ({ name: o.name, value: o.value }));
        const titleSnapshot =
          optionsSnapshot.length > 0
            ? `${v.productTitle} — ${optionsSnapshot.map((o) => o.value).join(' / ')}`
            : v.productTitle;

        const unitPriceCents = r.unitPriceCents;
        const lineTotalCents = unitPriceCents * r.qty;
        const unitCostCentsSnapshot = v.costCents;
        if (unitCostCentsSnapshot != null) {
          cogsCents += unitCostCentsSnapshot * r.qty;
        }

        await tx.insert(orderLineItem).values({
          orderId,
          variantId: r.variantId,
          skuSnapshot: v.sku,
          titleSnapshot,
          optionsSnapshot,
          qty: r.qty,
          unitPriceCents,
          lineTotalCents,
          unitCostCentsSnapshot,
        });
      }

      // Payout accrual — snapshot the basis AND the percentage so a future
      // rate change doesn't rewrite history.
      const grossCents = subtotalCents;
      const stripeFeeCents = estimateStripeFee(totalCents);
      const netMarginCents = grossCents - cogsCents - stripeFeeCents;
      const amountCents = Math.round((netMarginCents * PARTNER_PAYOUT_PCT_BPS) / 10000);

      await tx.insert(payoutAccrual).values({
        orderId,
        grossCents,
        cogsCents,
        stripeFeeCents,
        shippingLabelCostCents: null,
        netMarginCents,
        pctBasisPointsSnapshot: PARTNER_PAYOUT_PCT_BPS,
        amountCents,
        status: 'accrued',
      });

      console.log(
        `[stripe] ✓ session ${sessionId} → order ${orderId} ` +
          `(gross=${grossCents}, cogs=${cogsCents}, fee=${stripeFeeCents}, ` +
          `net=${netMarginCents}, accrued=${amountCents})`,
      );
    },
    { isolationLevel: 'serializable' },
  );
}

// -----------------------------------------------------------------------------
// checkout.session.expired — customer abandoned, release the hold
// -----------------------------------------------------------------------------

async function releaseCheckoutSession(session: CheckoutSessionPayload): Promise<void> {
  const sessionId = session.id;
  console.log(`[stripe] release session ${sessionId}`);

  await db.transaction(
    async (tx) => {
      const reservations = await tx
        .select()
        .from(reservation)
        .where(
          and(
            eq(reservation.stripeCheckoutSessionId, sessionId),
            eq(reservation.status, 'held'),
          ),
        );

      for (const r of reservations) {
        await tx
          .update(inventoryItem)
          .set({
            // Release-only: qty_on_hand is unchanged, qty_reserved decrements.
            qtyReserved: sql`${inventoryItem.qtyReserved} - ${r.qty}`,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItem.variantId, r.variantId));

        await tx
          .update(reservation)
          .set({ status: 'released', updatedAt: new Date() })
          .where(eq(reservation.id, r.id));
      }

      console.log(
        `[stripe] released ${reservations.length} reservations for ${sessionId}`,
      );
    },
    { isolationLevel: 'serializable' },
  );
}
