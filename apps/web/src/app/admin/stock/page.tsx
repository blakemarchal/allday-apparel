import Link from 'next/link';
import { asc, desc, eq, and, sql } from 'drizzle-orm';
import { db } from '@allday/db';
import {
  variant,
  product,
  inventoryItem,
  stockReceipt,
  storefront,
} from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { formatMoney, formatRelativeDate } from '@/lib/money';
import { addStockReceipt, applyCostToVariant } from './actions';

type SearchParams = Promise<{ error?: string; ok?: string }>;

export default async function StockPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { error, ok } = await searchParams;

  // Variants grouped by product for the picker.
  const variants = await db
    .select({
      id: variant.id,
      sku: variant.sku,
      priceCents: variant.priceCents,
      costCents: variant.costCents,
      qtyOnHand: inventoryItem.qtyOnHand,
      qtyReserved: inventoryItem.qtyReserved,
      lowStockThreshold: inventoryItem.lowStockThreshold,
      productId: variant.productId,
      productTitle: product.title,
      storefrontSlug: storefront.slug,
    })
    .from(variant)
    .innerJoin(product, eq(product.id, variant.productId))
    .innerJoin(storefront, eq(storefront.id, product.storefrontId))
    .leftJoin(inventoryItem, eq(inventoryItem.variantId, variant.id))
    .orderBy(asc(product.title), asc(variant.sku));

  // Low-stock subset.
  const lowStock = variants.filter(
    (v) =>
      v.lowStockThreshold != null &&
      v.lowStockThreshold > 0 &&
      (v.qtyOnHand ?? 0) <= v.lowStockThreshold,
  );

  // Recent receipts.
  const receipts = await db
    .select({
      id: stockReceipt.id,
      qtyReceived: stockReceipt.qtyReceived,
      unitCostCents: stockReceipt.unitCostCents,
      totalCostCents: stockReceipt.totalCostCents,
      vendor: stockReceipt.vendor,
      reference: stockReceipt.reference,
      receivedAt: stockReceipt.receivedAt,
      notes: stockReceipt.notes,
      variantSku: variant.sku,
      productTitle: product.title,
      variantCostCents: variant.costCents,
      variantId: variant.id,
    })
    .from(stockReceipt)
    .innerJoin(variant, eq(variant.id, stockReceipt.variantId))
    .innerJoin(product, eq(product.id, variant.productId))
    .orderBy(desc(stockReceipt.receivedAt))
    .limit(25);

  // Total invested all-time + this-period totals.
  const [investedRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${stockReceipt.totalCostCents}), 0)::bigint`,
    })
    .from(stockReceipt);

  // Group variants by product for the optgroup picker.
  const groupedForPicker = groupByProduct(variants);

  return (
    <div>
      <header className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-heading font-bold">Stock</h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          Invested: {formatMoney(Number(investedRow?.total ?? 0))}
        </span>
      </header>

      {error && (
        <Banner kind="error">
          <strong className="text-foreground">Couldn&apos;t save:</strong> {error}
        </Banner>
      )}
      {ok && <Banner kind="ok">Receipt logged.</Banner>}

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Low stock ({lowStock.length})
          </h2>
          <ul className="border-y border-border -mx-4 divide-y divide-border">
            {lowStock.map((v) => (
              <li key={v.id} className="px-4 py-3 flex items-baseline justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{v.productTitle}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {v.storefrontSlug} / {v.sku}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium text-foreground">
                    {v.qtyOnHand ?? 0} / {v.lowStockThreshold}
                  </div>
                  <Link
                    href={`/admin/products/${v.productId}`}
                    className="text-xs text-muted-foreground underline"
                  >
                    edit
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add receipt form */}
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Log a stock receipt
        </h2>
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No variants exist yet.{' '}
            <Link href="/admin/products/new" className="underline">
              Create a product
            </Link>{' '}
            first.
          </p>
        ) : (
          <form
            action={addStockReceipt}
            className="border border-border rounded p-3 flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Variant
              </span>
              <select
                name="variantId"
                required
                className="border border-border rounded px-3 py-2 bg-background"
              >
                <option value="">— pick one —</option>
                {groupedForPicker.map((g) => (
                  <optgroup key={g.productId} label={g.productTitle}>
                    {g.variants.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.sku} ({formatMoney(v.priceCents)})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Qty</span>
                <input
                  type="number"
                  name="qtyReceived"
                  required
                  min="1"
                  step="1"
                  placeholder="24"
                  className="border border-border rounded px-3 py-2 bg-background tabular-nums"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Unit cost ($)
                </span>
                <input
                  type="number"
                  name="unitCostDollars"
                  required
                  step="0.01"
                  min="0"
                  placeholder="12.00"
                  className="border border-border rounded px-3 py-2 bg-background tabular-nums"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">
                Total cost ($) <span className="normal-case text-muted-foreground/70">— optional, include freight/duty here</span>
              </span>
              <input
                type="number"
                name="totalCostDollars"
                step="0.01"
                min="0"
                placeholder="auto: qty × unit cost"
                className="border border-border rounded px-3 py-2 bg-background tabular-nums"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Vendor</span>
                <input
                  type="text"
                  name="vendor"
                  placeholder="Acme Apparel Co"
                  className="border border-border rounded px-3 py-2 bg-background"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Ref / PO#</span>
                <input
                  type="text"
                  name="reference"
                  placeholder="INV-12345"
                  className="border border-border rounded px-3 py-2 bg-background"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Received</span>
              <input
                type="date"
                name="receivedAt"
                required
                defaultValue={todayIso()}
                className="border border-border rounded px-3 py-2 bg-background"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Notes</span>
              <textarea
                name="notes"
                rows={2}
                className="border border-border rounded px-3 py-2 bg-background"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="applyCost"
                value="1"
                defaultChecked
                className="w-4 h-4"
              />
              <span>Apply this unit cost to the variant going forward</span>
            </label>

            <button
              type="submit"
              className="bg-primary text-primary-foreground rounded px-4 py-2 font-medium hover:opacity-90 mt-1"
            >
              Log receipt
            </button>
          </form>
        )}
      </section>

      {/* Recent receipts */}
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
          Recent receipts
        </h2>
        {receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No receipts yet.</p>
        ) : (
          <ul className="border-y border-border -mx-4 divide-y divide-border">
            {receipts.map((r) => (
              <li key={r.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{r.productTitle}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.variantSku}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="tabular-nums font-medium">
                      +{r.qtyReceived} @ {formatMoney(r.unitCostCents)}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      total {formatMoney(r.totalCostCents)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground gap-2">
                  <span className="truncate">
                    {[r.vendor, r.reference].filter(Boolean).join(' · ') || '—'}
                  </span>
                  <span>{formatRelativeDate(r.receivedAt)}</span>
                </div>
                {/* Quick "apply this cost to variant" if it differs */}
                {r.variantCostCents !== r.unitCostCents && (
                  <form
                    action={applyCostToVariant.bind(null, r.variantId, r.unitCostCents)}
                    className="mt-2"
                  >
                    <button
                      type="submit"
                      className="text-xs underline text-muted-foreground hover:text-foreground"
                    >
                      Set variant cost to {formatMoney(r.unitCostCents)} (currently{' '}
                      {r.variantCostCents != null
                        ? formatMoney(r.variantCostCents)
                        : 'unset'}
                      )
                    </button>
                  </form>
                )}
                {r.notes && (
                  <p className="text-xs text-muted-foreground mt-1 italic">{r.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------

type VariantRow = {
  id: string;
  sku: string;
  priceCents: number;
  productId: string;
  productTitle: string;
};

function groupByProduct(variants: VariantRow[]): Array<{
  productId: string;
  productTitle: string;
  variants: VariantRow[];
}> {
  const map = new Map<string, { productId: string; productTitle: string; variants: VariantRow[] }>();
  for (const v of variants) {
    let bucket = map.get(v.productId);
    if (!bucket) {
      bucket = { productId: v.productId, productTitle: v.productTitle, variants: [] };
      map.set(v.productId, bucket);
    }
    bucket.variants.push(v);
  }
  return Array.from(map.values());
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function Banner({
  kind,
  children,
}: {
  kind: 'error' | 'ok';
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
      {children}
    </div>
  );
}
