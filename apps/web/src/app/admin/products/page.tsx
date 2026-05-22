import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@allday/db';
import { product, storefront, variant } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { formatMoney, formatRelativeDate } from '@/lib/money';

export default async function ProductsListPage() {
  await requireAdmin();

  // List with variant count + min/max price so admin sees enough at a glance
  // without drilling in.
  const rows = await db
    .select({
      id: product.id,
      title: product.title,
      slug: product.slug,
      status: product.status,
      updatedAt: product.updatedAt,
      storefrontSlug: storefront.slug,
      storefrontName: storefront.name,
      variantCount: sql<number>`COUNT(${variant.id})::int`,
      minPriceCents: sql<number | null>`MIN(${variant.priceCents})`,
      maxPriceCents: sql<number | null>`MAX(${variant.priceCents})`,
    })
    .from(product)
    .innerJoin(storefront, eq(storefront.id, product.storefrontId))
    .leftJoin(variant, eq(variant.productId, product.id))
    .groupBy(product.id, storefront.id)
    .orderBy(desc(product.updatedAt));

  return (
    <div>
      <header className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-heading font-bold">Products</h1>
        <Link
          href="/admin/products/new"
          className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          + New
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          <p>No products yet.</p>
          <Link
            href="/admin/products/new"
            className="text-foreground underline mt-2 inline-block"
          >
            Create your first product →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border -mx-4">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                href={`/admin/products/${p.id}`}
                className="block px-4 py-3 active:bg-muted"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium truncate">{p.title}</span>
                  <PriceRange
                    min={p.minPriceCents}
                    max={p.maxPriceCents}
                    count={p.variantCount}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xs text-muted-foreground font-mono">
                    {p.storefrontSlug} / {p.slug}
                  </span>
                  <ProductStatusBadge status={p.status} />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
                  <span>
                    {p.variantCount} {p.variantCount === 1 ? 'variant' : 'variants'}
                  </span>
                  <span>Updated {formatRelativeDate(p.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PriceRange({
  min,
  max,
  count,
}: {
  min: number | null;
  max: number | null;
  count: number;
}) {
  if (count === 0 || min == null || max == null) {
    return <span className="text-xs text-muted-foreground">no variants</span>;
  }
  if (min === max) {
    return <span className="text-sm font-medium tabular-nums">{formatMoney(min)}</span>;
  }
  return (
    <span className="text-sm font-medium tabular-nums">
      {formatMoney(min)}–{formatMoney(max)}
    </span>
  );
}

function ProductStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'published'
      ? 'bg-primary text-primary-foreground'
      : status === 'draft'
        ? 'bg-muted text-muted-foreground'
        : 'border border-border text-muted-foreground'; // archived
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {status}
    </span>
  );
}
