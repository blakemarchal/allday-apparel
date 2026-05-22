import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@allday/db';
import { variant, product, inventoryItem } from '@allday/db/schema';
import { getCurrentStorefront } from '@/lib/storefront';
import { readCart, cartItemCount } from '@/lib/cart';
import { StorefrontHeader } from '@/components/storefront/Header';
import { formatMoney } from '@/lib/money';
import { updateCartQty, removeCartItem, startCheckout } from './actions';

type SearchParams = Promise<{ error?: string }>;

export default async function CartPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const storefront = await getCurrentStorefront();
  if (!storefront) notFound();

  const { error } = await searchParams;
  const cart = await readCart();
  const cartCount = await cartItemCount();

  // Load variant data for every cart item. We need: SKU, product title,
  // price, available qty (qty_on_hand - qty_reserved), storefront match.
  const variantIds = cart.items.map((i) => i.variantId);
  const variants =
    variantIds.length > 0
      ? await db
          .select({
            id: variant.id,
            sku: variant.sku,
            status: variant.status,
            priceCents: variant.priceCents,
            productTitle: product.title,
            productSlug: product.slug,
            storefrontId: product.storefrontId,
            qtyOnHand: inventoryItem.qtyOnHand,
            qtyReserved: inventoryItem.qtyReserved,
          })
          .from(variant)
          .innerJoin(product, eq(product.id, variant.productId))
          .leftJoin(inventoryItem, eq(inventoryItem.variantId, variant.id))
          .where(inArray(variant.id, variantIds))
      : [];

  const variantById = new Map(variants.map((v) => [v.id, v]));

  // Filter cart to valid lines (variant exists, matches storefront, published).
  // Decorate with derived fields. Bad lines surface as "no longer available."
  const lines = cart.items.map((i) => {
    const v = variantById.get(i.variantId);
    const valid =
      v != null && v.status === 'published' && v.storefrontId === storefront.id;
    const available = v ? Math.max(0, (v.qtyOnHand ?? 0) - (v.qtyReserved ?? 0)) : 0;
    return {
      ...i,
      valid,
      sku: v?.sku ?? '',
      productTitle: v?.productTitle ?? 'Unavailable',
      productSlug: v?.productSlug ?? '',
      unitPriceCents: v?.priceCents ?? 0,
      available,
    };
  });

  const subtotalCents = lines
    .filter((l) => l.valid)
    .reduce((s, l) => s + l.unitPriceCents * l.qty, 0);

  const hasInvalid = lines.some((l) => !l.valid);
  const anyOversold = lines.some((l) => l.valid && l.qty > l.available);
  const canCheckout = lines.length > 0 && !hasInvalid && !anyOversold;

  return (
    <>
      <StorefrontHeader storefront={storefront} cartCount={cartCount} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-heading font-bold mb-6">Cart</h1>

        {error && (
          <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
            <strong className="text-foreground">Couldn&apos;t check out:</strong>{' '}
            {error}
          </div>
        )}

        {lines.length === 0 ? (
          <p className="text-muted-foreground">
            Your cart&apos;s empty.{' '}
            <Link href="/products" className="underline">
              Browse the shop →
            </Link>
          </p>
        ) : (
          <>
            <ul className="border-y border-border -mx-4 divide-y divide-border mb-6">
              {lines.map((l) => (
                <li key={l.variantId} className="px-4 py-4">
                  {!l.valid ? (
                    <UnavailableLine variantId={l.variantId} />
                  ) : (
                    <ValidLine
                      variantId={l.variantId}
                      sku={l.sku}
                      title={l.productTitle}
                      slug={l.productSlug}
                      qty={l.qty}
                      unitPriceCents={l.unitPriceCents}
                      available={l.available}
                      currency={storefront.currency}
                    />
                  )}
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between mb-2">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-2xl font-heading font-bold tabular-nums">
                {formatMoney(subtotalCents, storefront.currency)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-6">
              Tax and shipping calculated at checkout.
            </p>

            {anyOversold && (
              <p className="text-sm text-muted-foreground mb-3">
                Reduce quantity on the oversold lines before checking out.
              </p>
            )}

            <form action={startCheckout}>
              <button
                type="submit"
                disabled={!canCheckout}
                className="w-full bg-primary text-primary-foreground rounded px-4 py-3 font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {canCheckout ? 'Checkout' : 'Fix cart before checking out'}
              </button>
            </form>
          </>
        )}
      </main>
    </>
  );
}

function ValidLine({
  variantId,
  sku,
  title,
  slug,
  qty,
  unitPriceCents,
  available,
  currency,
}: {
  variantId: string;
  sku: string;
  title: string;
  slug: string;
  qty: number;
  unitPriceCents: number;
  available: number;
  currency: string;
}) {
  const oversold = qty > available;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <Link
          href={`/products/${slug}`}
          className="font-medium truncate hover:underline block"
        >
          {title}
        </Link>
        <div className="text-xs text-muted-foreground font-mono">{sku}</div>
        <form
          action={updateCartQty.bind(null, variantId)}
          className="mt-2 flex items-center gap-2"
        >
          <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Qty</span>
            <input
              type="number"
              name="qty"
              min="1"
              max={available}
              defaultValue={qty}
              className="border border-border rounded w-16 px-2 py-1 text-sm bg-background tabular-nums"
            />
          </label>
          <button
            type="submit"
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Update
          </button>
        </form>
        <form action={removeCartItem.bind(null, variantId)} className="mt-1">
          <button
            type="submit"
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        </form>
        {oversold && (
          <p className="text-xs text-muted-foreground mt-2">
            Only {available} in stock.
          </p>
        )}
      </div>
      <div className="text-right">
        <div className="font-medium tabular-nums">
          {formatMoney(unitPriceCents * qty, currency)}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {qty} × {formatMoney(unitPriceCents, currency)}
        </div>
      </div>
    </div>
  );
}

function UnavailableLine({ variantId }: { variantId: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="font-medium text-muted-foreground italic">No longer available</div>
        <form action={removeCartItem.bind(null, variantId)} className="mt-1">
          <button
            type="submit"
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        </form>
      </div>
    </div>
  );
}
