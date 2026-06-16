'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray, sql } from 'drizzle-orm';
import Stripe from 'stripe';
import { db } from '@allday/db';
import { variant, product, inventoryItem, reservation } from '@allday/db/schema';
import {
  readCart,
  setCartItemQty,
  removeFromCart,
  clearCart,
  addToCart,
} from '@/lib/cart';
import { getStorefrontById } from '@/lib/storefront';

// Every action takes an explicit storefrontId (bound in the component) rather
// than re-deriving it from the request — robust against the apparel/character
// split living on one host.

// =============================================================================
// Cart line mutations
// =============================================================================

export async function addToCartAction(
  storefrontId: string,
  variantId: string,
): Promise<{ error?: string } | undefined> {
  // Validate the variant is published AND belongs to this storefront.
  const [v] = await db
    .select({ id: variant.id, status: variant.status, storefrontId: product.storefrontId })
    .from(variant)
    .innerJoin(product, eq(product.id, variant.productId))
    .where(eq(variant.id, variantId))
    .limit(1);

  if (!v) return { error: 'Variant no longer exists.' };
  if (v.status !== 'published') return { error: 'Variant is no longer available.' };
  if (v.storefrontId !== storefrontId) return { error: 'Variant belongs to another store.' };

  await addToCart(storefrontId, variantId, 1);
  return undefined;
}

export async function updateCartQty(
  storefrontId: string,
  basePath: string,
  variantId: string,
  formData: FormData,
): Promise<void> {
  const qty = Number.parseInt(String(formData.get('qty') ?? '0'), 10);
  if (!Number.isFinite(qty)) return;
  await setCartItemQty(storefrontId, variantId, qty);
  revalidatePath(`${basePath}/cart`);
}

export async function removeCartItem(
  storefrontId: string,
  basePath: string,
  variantId: string,
): Promise<void> {
  await removeFromCart(storefrontId, variantId);
  revalidatePath(`${basePath}/cart`);
}

// =============================================================================
// Checkout — create Stripe Checkout Session and redirect
// =============================================================================

const STRIPE_API_VERSION = (process.env.STRIPE_API_VERSION ??
  '2024-12-18.acacia') as Stripe.LatestApiVersion;

// Module-level function declaration (not an arrow) so TS recognizes the `never`
// return for control-flow narrowing + definite-assignment analysis downstream.
function fail(basePath: string, msg: string): never {
  redirect(`${basePath}/cart?error=${encodeURIComponent(msg)}`);
}

/**
 * Create a Stripe Checkout Session scoped to ONE storefront, reserving
 * inventory first. See the inline steps. `basePath` ('' or '/WillAllday')
 * keeps the success/cancel URLs inside the right store.
 */
export async function startCheckout(storefrontId: string, basePath: string): Promise<void> {
  const storefront = await getStorefrontById(storefrontId);
  if (!storefront) fail(basePath, 'Storefront not configured.');

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret || stripeSecret.startsWith('sk_test_placeholder')) {
    fail(basePath, 'Stripe is not configured. Add STRIPE_SECRET_KEY to enable checkout.');
  }

  const items = await readCart(storefrontId);
  if (items.length === 0) fail(basePath, 'Cart is empty.');

  // 1. Authoritative variant data.
  const variantIds = items.map((i) => i.variantId);
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

  const validatedLines = items.map((i) => {
    const v = variantById.get(i.variantId);
    if (!v) throw new Error('Cart contains an unknown variant.');
    if (v.status !== 'published') throw new Error(`${v.sku} is no longer for sale.`);
    if (v.storefrontId !== storefrontId) throw new Error(`${v.sku} belongs to another store.`);
    const available = Math.max(0, (v.qtyOnHand ?? 0) - (v.qtyReserved ?? 0));
    if (i.qty > available) throw new Error(`Only ${available} of ${v.sku} available — reduce qty.`);
    return { ...i, variant: v };
  });

  // 2. Reserve inventory in a serializable transaction.
  const placeholderSessionId = `pending_${crypto.randomUUID()}`;
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
  const reservationIds: string[] = [];
  try {
    await db.transaction(
      async (tx) => {
        for (const line of validatedLines) {
          const [inv] = await tx
            .select({ qtyOnHand: inventoryItem.qtyOnHand, qtyReserved: inventoryItem.qtyReserved })
            .from(inventoryItem)
            .where(eq(inventoryItem.variantId, line.variantId))
            .limit(1);
          if (!inv) throw new Error(`${line.variant.sku} has no inventory record.`);
          if ((inv.qtyOnHand ?? 0) - (inv.qtyReserved ?? 0) < line.qty) {
            throw new Error(`${line.variant.sku} just sold out — please refresh.`);
          }
          await tx
            .update(inventoryItem)
            .set({ qtyReserved: sql`${inventoryItem.qtyReserved} + ${line.qty}`, updatedAt: new Date() })
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
    fail(basePath, e instanceof Error ? e.message : 'reservation failed');
  }

  // 3. Create the Stripe Checkout Session.
  const stripe = new Stripe(stripeSecret as string, { apiVersion: STRIPE_API_VERSION });
  const hdrs = await headers();
  const host = hdrs.get('host') ?? `${storefront.slug}.localhost:3001`;
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
          product_data: { name: `${line.variant.productTitle} — ${line.variant.sku}` },
        },
      })),
      success_url: `${baseUrl}${basePath}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}${basePath}/cart`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      shipping_address_collection: { allowed_countries: ['US'] },
      automatic_tax: { enabled: false },
    });
  } catch (e) {
    // Roll back the held reservations so inventory frees immediately.
    await db
      .update(reservation)
      .set({ status: 'released', updatedAt: new Date() })
      .where(inArray(reservation.id, reservationIds));
    for (const line of validatedLines) {
      await db
        .update(inventoryItem)
        .set({ qtyReserved: sql`${inventoryItem.qtyReserved} - ${line.qty}`, updatedAt: new Date() })
        .where(eq(inventoryItem.variantId, line.variantId));
    }
    fail(basePath, `Couldn't start checkout — ${(e instanceof Error ? e.message : 'stripe error').slice(0, 100)}`);
  }

  // 4. Bind the real session id onto the reservations.
  await db
    .update(reservation)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(
      and(
        eq(reservation.stripeCheckoutSessionId, placeholderSessionId),
        inArray(reservation.id, reservationIds),
      ),
    );

  // 5. Clear THIS store's cart and redirect to Stripe.
  await clearCart(storefrontId);
  if (!session.url) fail(basePath, 'Stripe returned no checkout URL.');
  redirect(session.url);
}
