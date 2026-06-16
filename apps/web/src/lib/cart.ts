import 'server-only';
import { cookies } from 'next/headers';

/**
 * Cart lives in a single httpOnly cookie, but keyed BY STOREFRONT so the
 * apparel and character stores (which now share one host) keep separate carts:
 *
 *   { "<storefrontId>": [ {variantId, qty}, ... ], ... }
 *
 * Without this, an apparel item and a /WillAllday item would share one cart —
 * and checkout rejects a cart that spans storefronts (one Stripe session is
 * scoped to a single store).
 *
 * The cookie is NOT a security boundary — checkout re-validates every line
 * server-side (variant exists, published, belongs to the storefront, price
 * comes from the variant row). Tampering only changes the customer's own UI.
 */

const COOKIE_NAME = 'cart';
const MAX_QTY_PER_LINE = 99;
const MAX_LINES = 50;

export type CartItem = { variantId: string; qty: number };
type CartMap = Record<string, CartItem[]>;

function sanitizeItems(items: unknown): CartItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (i): i is CartItem =>
        !!i &&
        typeof (i as CartItem).variantId === 'string' &&
        Number.isInteger((i as CartItem).qty) &&
        (i as CartItem).qty > 0 &&
        (i as CartItem).qty <= MAX_QTY_PER_LINE,
    )
    .slice(0, MAX_LINES);
}

async function readMap(): Promise<CartMap> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: CartMap = {};
    for (const [storefrontId, items] of Object.entries(parsed)) {
      const clean = sanitizeItems(items);
      if (clean.length > 0) out[storefrontId] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeMap(map: CartMap): Promise<void> {
  const store = await cookies();
  const hasAny = Object.values(map).some((items) => items.length > 0);
  if (!hasAny) {
    store.delete(COOKIE_NAME);
    return;
  }
  store.set(COOKIE_NAME, JSON.stringify(map), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function readCart(storefrontId: string): Promise<CartItem[]> {
  const map = await readMap();
  return map[storefrontId] ?? [];
}

export async function addToCart(
  storefrontId: string,
  variantId: string,
  qty = 1,
): Promise<void> {
  if (qty <= 0) return;
  const map = await readMap();
  const items = map[storefrontId] ?? [];
  const existing = items.find((i) => i.variantId === variantId);
  if (existing) {
    existing.qty = Math.min(MAX_QTY_PER_LINE, existing.qty + qty);
  } else {
    items.push({ variantId, qty: Math.min(MAX_QTY_PER_LINE, qty) });
  }
  map[storefrontId] = items;
  await writeMap(map);
}

export async function setCartItemQty(
  storefrontId: string,
  variantId: string,
  qty: number,
): Promise<void> {
  const map = await readMap();
  const items = map[storefrontId] ?? [];
  if (qty <= 0) {
    map[storefrontId] = items.filter((i) => i.variantId !== variantId);
  } else {
    const existing = items.find((i) => i.variantId === variantId);
    if (existing) existing.qty = Math.min(MAX_QTY_PER_LINE, qty);
    map[storefrontId] = items;
  }
  await writeMap(map);
}

export async function removeFromCart(
  storefrontId: string,
  variantId: string,
): Promise<void> {
  const map = await readMap();
  const items = map[storefrontId] ?? [];
  map[storefrontId] = items.filter((i) => i.variantId !== variantId);
  await writeMap(map);
}

/** Clear only this storefront's cart; the other store's cart is preserved. */
export async function clearCart(storefrontId: string): Promise<void> {
  const map = await readMap();
  delete map[storefrontId];
  await writeMap(map);
}

/** Item count (sum of qty) for one storefront — powers the header badge. */
export async function cartItemCount(storefrontId: string): Promise<number> {
  const items = await readCart(storefrontId);
  return items.reduce((s, i) => s + i.qty, 0);
}
