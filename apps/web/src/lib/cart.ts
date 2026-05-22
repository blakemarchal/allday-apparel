import 'server-only';
import { cookies } from 'next/headers';

/**
 * Cart lives in an httpOnly cookie. Per-storefront isolation falls out
 * naturally because each storefront is a different origin (subdomain), so
 * cookies don't cross.
 *
 * The cookie is NOT a security boundary — checkout MUST re-validate every
 * field server-side (variant exists, qty > 0, price comes from variant row
 * not cart). Tampering only changes what the customer sees in their own UI.
 */

const COOKIE_NAME = 'cart';
const MAX_QTY_PER_LINE = 99; // sanity cap

export type CartItem = { variantId: string; qty: number };
export type Cart = { items: CartItem[] };

export async function readCart(): Promise<Cart> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return { items: [] };
  try {
    const parsed = JSON.parse(raw) as Cart;
    if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
    // Sanitize: ensure each item has a string id and an integer qty in range.
    const items = parsed.items
      .filter(
        (i): i is CartItem =>
          typeof i?.variantId === 'string' &&
          Number.isInteger(i?.qty) &&
          i.qty > 0 &&
          i.qty <= MAX_QTY_PER_LINE,
      )
      .slice(0, 50); // hard cap on distinct lines
    return { items };
  } catch {
    return { items: [] };
  }
}

async function writeCart(cart: Cart): Promise<void> {
  const store = await cookies();
  // 7-day TTL is generous; carts naturally expire when sessions land or stale.
  store.set(COOKIE_NAME, JSON.stringify(cart), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function addToCart(variantId: string, qty = 1): Promise<void> {
  if (qty <= 0) return;
  const cart = await readCart();
  const existing = cart.items.find((i) => i.variantId === variantId);
  if (existing) {
    existing.qty = Math.min(MAX_QTY_PER_LINE, existing.qty + qty);
  } else {
    cart.items.push({ variantId, qty: Math.min(MAX_QTY_PER_LINE, qty) });
  }
  await writeCart(cart);
}

export async function setCartItemQty(variantId: string, qty: number): Promise<void> {
  const cart = await readCart();
  if (qty <= 0) {
    cart.items = cart.items.filter((i) => i.variantId !== variantId);
  } else {
    const existing = cart.items.find((i) => i.variantId === variantId);
    if (existing) {
      existing.qty = Math.min(MAX_QTY_PER_LINE, qty);
    }
  }
  await writeCart(cart);
}

export async function removeFromCart(variantId: string): Promise<void> {
  const cart = await readCart();
  cart.items = cart.items.filter((i) => i.variantId !== variantId);
  await writeCart(cart);
}

export async function clearCart(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Total item count (sum of qty across lines). For the header badge. */
export async function cartItemCount(): Promise<number> {
  const cart = await readCart();
  return cart.items.reduce((s, i) => s + i.qty, 0);
}
