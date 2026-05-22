'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '@allday/db';
import { variant, product, inventoryItem, reservation } from '@allday/db/schema';
import { readCart, setCartItemQty, removeFromCart, clearCart } from '@/lib/cart';
import { getCurrentStorefront } from '@/lib/storefront';

// =============================================================================
// Cart line mutations
// =============================================================================

export async function updateCartQty(
  variantId: string,
  formData: FormData,
): Promise<void> {
  const qtyRaw = formData.get('qty');
  const qty = Number.parseInt(String(qtyRaw ?? '0'), 10);
  if (!Number.isFinite(qty)) return;
  await setCartItemQty(variantId, qty);
  revalidatePath('/cart');
}

export async function removeCartItem(variantId: string): Promise<void> {
  await removeFromCart(variantId);
  revalidatePath('/cart');
}

// =============================================================================
// Checkout — create Stripe Checkout Session and redirect
// =============================================================================

const STRIPE_API_VERSION = (process.env.STRIPE_API_VERSION ??
  '2024-12-18.acacia') as Stripe.LatestApiVersion;

function err(msg: string): never {
  redirect(`/cart?error=${encodeURIComponent(msg)}`);
}

/**
 * Stripe Checkout creation. The transactional heavy lifting:
 *
 *   1. Re-validate every cart line against current variant/inventory state
 *      (cookie is untrusted; price comes from variant.priceCents).
 *   2. SERIALIZABLE transaction:
 *        - Re-check availability (qty_on_hand - qty_reserved >= requested).
 *        - Increment inventory_item.qty_reserved by qty.
 *        - Insert reservation rows linked by stripe_checkout_session_id
 *          (which we don't yet have — placeholder string, patched after
 *          Stripe session creation; see below).
 *   3. Create Stripe Checkout Session with line_items.price_data (ad-hoc
 *      prices; Stripe Product/Price sync lands separately in #23).
 *   4. UPDATE reservation rows with the real session id.
 *   5. Clear the cart cookie and redirect to Stripe.
 *
 * If any step after the reservation insert fails, the reservation rows
 * still exist with the placeholder session id and a near-future expiry;
 * the sweeper job releases them. The customer just sees the cart again.
 *
 * Idempotency on Stripe creation: we don't dedupe at the cart level —
 * each Checkout button click creates a new session + new reservations.
 * This is acceptable behaviour; abandoned sessions release inventory
 * naturally.
 */
export async function startCheckout(): Promise<void> {
  const storefront = await getCurrentStorefront();
  if (!storefront) err('Storefront not configured.');

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret || stripeSecret.startsWith('sk_test_placeholder')) {
    err('Stripe is not configured. Add STRIPE_SECRET_KEY to enable checkout.');
  }

  const cart = await readCart();
  if (cart.items.length === 0) err('Cart is empty.');

  // 1. Pull authoritative variant data.
  const variantIds = cart.items.map((i) => i.variantId);
  const variants = await db
    .select({
      id: variant.id,
      status: variant.status,
      sku: variant.sku,
      priceCents: variant.priceCents,
      productTitle: product.title,
      storefrontId: product.storefrontId,
      qtyOnHand: inventoryItem.qtyOnHand,
      qtyReserved: inventoryItem.qtyReserved,
    })
    .from(variant)
    .innerJoin(product, eq(product.id, variant.productId))
    .leftJoin(inventoryItem, eq(inventoryItem.variantId, variant.id))
    .where(inArray(variant.id, variantIds));

  const variantById = new Map(variants.map((v) => [v.id, v]));

  // Validate every cart line BEFORE entering the reservation transaction.
  const validatedLines = cart.items.map((i) => {
    const v = variantById.get(i.variantId);
    if (!v) throw new Error(`Cart contains an unknown variant.`);
    if (v.status !== 'published') throw new Error(`${v.sku} is no longer for sale.`);
    if (v.storefrontId !== storefront.id) {
      throw new Error(`${v.sku} belongs to another storefront.`);
    }
    const available = Math.max(0, (v.qtyOnHand ?? 0) - (v.qtyReserved ?? 0));
    if (i.qty > available) {
      throw new Error(`Only ${available} of ${v.sku} available — please reduce qty.`);
    }
    return { ...i, variant: v };
  });

  // 2. Reserve inventory.
  // Stripe session id isn't known yet — use a placeholder that we patch in
  // step 4. If we crash between insert and patch, the rows still expire and
  // the sweeper releases them.
  const placeholderSessionId = `pending_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 min, matches Stripe session expiry

  const reservationIds: string[] = [];
  try {
    await db.transaction(
      async (tx) => {
        for (const line of validatedLines) {
          // Re-check availability under lock.
          const [inv] = await tx
            .select({
              qtyOnHand: inventoryItem.qtyOnHand,
              qtyReserved: inventoryItem.qtyReserved,
            })
            .from(inventoryItem)
            .where(eq(inventoryItem.variantId, line.variantId))
            .limit(1);
          if (!inv) throw new Error(`${line.variant.sku} has no inventory record.`);
          if ((inv.qtyOnHand ?? 0) - (inv.qtyReserved ?? 0) < line.qty) {
            throw new Error(`${line.variant.sku} just sold out — please refresh.`);
          }

          await tx
            .update(inventoryItem)
            .set({
              qtyReserved: sql`${inventoryItem.qtyReserved} + ${line.qty}`,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItem.variantId, line.variantId));

          const [r] = await tx
            .insert(reservation)
            .values({
              variantId: line.variantId,
              qty: line.qty,
              unitPriceCents: line.variant.priceCents,
              stripeCheckoutSessionId: placeholderSessionId,
              expiresAt,
              status: 'held',
            })
            .returning({ id: reservation.id });
          if (!r) throw new Error('reservation insert returned no row');
          reservationIds.push(r.id);
        }
      },
      { isolationLevel: 'serializable' },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'reservation failed';
    err(msg);
  }

  // 3. Create Stripe Checkout Session.
  const stripe = new Stripe(stripeSecret, { apiVersion: STRIPE_API_VERSION });

  const hdrs = await headers();
  const host = hdrs.get('host') ?? `${storefront.hostname}:3001`;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: validatedLines.map((line) => ({
        quantity: line.qty,
        price_data: {
          currency: storefront.currency.toLowerCase(),
          unit_amount: line.variant.priceCents,
          product_data: {
            name: `${line.variant.productTitle} — ${line.variant.sku}`,
          },
        },
      })),
      success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      // Capture email + shipping for fulfillment.
      shipping_address_collection: { allowed_countries: ['US'] },
      automatic_tax: { enabled: false }, // flip to true after Stripe Tax is configured
    });
  } catch (e) {
    // Free the reservations we just made — they're held under placeholder id,
    // sweeper will eventually release, but let's not wait.
    await db
      .update(reservation)
      .set({ status: 'released', updatedAt: new Date() })
      .where(inArray(reservation.id, reservationIds));
    for (const line of validatedLines) {
      await db
        .update(inventoryItem)
        .set({
          qtyReserved: sql`${inventoryItem.qtyReserved} - ${line.qty}`,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItem.variantId, line.variantId));
    }
    const msg = e instanceof Error ? e.message : 'stripe error';
    err(`Couldn't start checkout — ${msg.slice(0, 100)}`);
  }

  // 4. Patch reservations with the real session id.
  await db
    .update(reservation)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(
      and(
        eq(reservation.stripeCheckoutSessionId, placeholderSessionId),
        inArray(reservation.id, reservationIds),
      ),
    );

  // 5. Clear cart + redirect.
  await clearCart();
  if (!session.url) err('Stripe returned no checkout URL.');
  redirect(session.url);
}
