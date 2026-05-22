import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq, sql, and } from 'drizzle-orm';
import { db } from '@allday/db';
import { product, variant } from '@allday/db/schema';
import { getCurrentStorefront } from '@/lib/storefront';
import { cartItemCount } from '@/lib/cart';
import { StorefrontHeader } from '@/components/storefront/Header';
import { formatMoney } from '@/lib/money';

export default async function CatalogPage() {
  const storefront = await getCurrentStorefront();
  if (!storefront) notFound();

  // Published products in this storefront with at least one published variant,
  // plus min/max price for the card.
  const rows = await db
    .select({
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      minPriceCents: sql<number | null>`MIN(${variant.priceCents})`,
      maxPriceCents: sql<number | null>`MAX(${variant.priceCents})`,
    })
    .from(product)
    .innerJoin(
      variant,
      and(eq(variant.productId, product.id), eq(variant.status, 'published')),
    )
    .where(
      and(eq(product.storefrontId, storefront.id), eq(product.status, 'published')),
    )
    .groupBy(product.id)
    .orderBy(asc(product.title));

  const cartCount = await cartItemCount();

  return (
    <>
      <StorefrontHeader storefront={storefront} cartCount={cartCount} />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-heading font-bold mb-6">Shop</h1>

        {rows.length === 0 ? (
          <p className="text-muted-foreground">
            No products yet. Check back soon.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rows.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.slug}`}
                  className="block border border-border rounded p-4 hover:bg-muted/30 active:bg-muted"
                >
                  <h2 className="font-heading font-bold text-xl">{p.title}</h2>
                  {p.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {p.description}
                    </p>
                  )}
                  <p className="mt-2 font-medium tabular-nums">
                    <PriceRange
                      min={p.minPriceCents}
                      max={p.maxPriceCents}
                      currency={storefront.currency}
                    />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function PriceRange({
  min,
  max,
  currency,
}: {
  min: number | null;
  max: number | null;
  currency: string;
}) {
  if (min == null || max == null) return <>—</>;
  if (min === max) return <>{formatMoney(min, currency)}</>;
  return (
    <>
      {formatMoney(min, currency)}–{formatMoney(max, currency)}
    </>
  );
}
