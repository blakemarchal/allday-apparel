import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq, and } from 'drizzle-orm';
import { db } from '@allday/db';
import {
  drop,
  dropAllocation,
  storefront,
  product,
  variant,
  inventoryItem,
} from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { formatMoney } from '@/lib/money';
import {
  updateDropBasics,
  setDropStatus,
  addAllocation,
  updateAllocation,
  removeAllocation,
} from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

export default async function EditDropPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;

  const [d] = await db
    .select({
      id: drop.id,
      name: drop.name,
      slug: drop.slug,
      status: drop.status,
      startsAt: drop.startsAt,
      endsAt: drop.endsAt,
      quantityCap: drop.quantityCap,
      perCustomerCap: drop.perCustomerCap,
      storefrontId: drop.storefrontId,
      storefrontSlug: storefront.slug,
      storefrontName: storefront.name,
    })
    .from(drop)
    .innerJoin(storefront, eq(storefront.id, drop.storefrontId))
    .where(eq(drop.id, id))
    .limit(1);

  if (!d) notFound();

  // Current allocations for this drop.
  const allocations = await db
    .select({
      variantId: dropAllocation.variantId,
      allocatedQty: dropAllocation.allocatedQty,
      sku: variant.sku,
      priceCents: variant.priceCents,
      productTitle: product.title,
      qtyOnHand: inventoryItem.qtyOnHand,
    })
    .from(dropAllocation)
    .innerJoin(variant, eq(variant.id, dropAllocation.variantId))
    .innerJoin(product, eq(product.id, variant.productId))
    .leftJoin(inventoryItem, eq(inventoryItem.variantId, variant.id))
    .where(eq(dropAllocation.dropId, d.id))
    .orderBy(asc(product.title), asc(variant.sku));

  const allocatedIds = new Set(allocations.map((a) => a.variantId));

  // Available variants in this storefront not yet in the drop, for the
  // "add allocation" picker.
  const availableVariants = await db
    .select({
      id: variant.id,
      sku: variant.sku,
      priceCents: variant.priceCents,
      productId: variant.productId,
      productTitle: product.title,
    })
    .from(variant)
    .innerJoin(product, eq(product.id, variant.productId))
    .where(and(eq(product.storefrontId, d.storefrontId), eq(product.status, 'published')))
    .orderBy(asc(product.title), asc(variant.sku));

  const pickerCandidates = availableVariants.filter((v) => !allocatedIds.has(v.id));

  return (
    <div>
      <Link
        href="/admin/drops"
        className="text-sm text-muted-foreground hover:text-foreground inline-block mb-3"
      >
        ← Drops
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-heading font-bold">{d.name}</h1>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {d.storefrontSlug} / {d.slug}
        </p>
      </header>

      {error && (
        <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
          <strong className="text-foreground">Couldn&apos;t save:</strong> {error}
        </div>
      )}

      {/* Status + lifecycle */}
      <Section title="Status">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span
            className={`text-xs px-2 py-0.5 rounded font-medium ${
              d.status === 'live'
                ? 'bg-primary text-primary-foreground'
                : d.status === 'scheduled'
                  ? 'border border-border text-foreground'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {d.status}
          </span>
          <div className="flex gap-2 flex-wrap justify-end">
            {d.status !== 'live' && d.status !== 'ended' && (
              <form action={setDropStatus.bind(null, d.id, 'live')}>
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
                  disabled={allocations.length === 0}
                  title={
                    allocations.length === 0
                      ? 'Add at least one variant first'
                      : undefined
                  }
                >
                  Go live now
                </button>
              </form>
            )}
            {d.status === 'draft' && d.startsAt && (
              <form action={setDropStatus.bind(null, d.id, 'scheduled')}>
                <button
                  type="submit"
                  className="border border-border rounded px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  Schedule
                </button>
              </form>
            )}
            {d.status === 'live' && (
              <form action={setDropStatus.bind(null, d.id, 'ended')}>
                <button
                  type="submit"
                  className="border border-border rounded px-3 py-1.5 text-sm hover:bg-muted text-muted-foreground"
                >
                  End now
                </button>
              </form>
            )}
            {d.status !== 'draft' && d.status !== 'ended' && (
              <form action={setDropStatus.bind(null, d.id, 'draft')}>
                <button
                  type="submit"
                  className="border border-border rounded px-3 py-1.5 text-sm hover:bg-muted text-muted-foreground"
                >
                  Move to draft
                </button>
              </form>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Auto-flip on starts_at/ends_at is a separate background worker (not
          built yet). For now, status changes are manual via these buttons.
        </p>
      </Section>

      {/* Basic settings + schedule */}
      <Section title="Schedule + caps">
        <form action={updateDropBasics.bind(null, d.id)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Name</span>
            <input
              type="text"
              name="name"
              required
              defaultValue={d.name}
              className="border border-border rounded px-3 py-2 bg-background"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Slug</span>
            <input
              type="text"
              name="slug"
              required
              pattern="[a-z0-9\-]+"
              defaultValue={d.slug}
              className="border border-border rounded px-3 py-2 bg-background font-mono"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Starts (UTC)</span>
              <input
                type="datetime-local"
                name="startsAt"
                defaultValue={d.startsAt ? toDtLocal(d.startsAt) : ''}
                className="border border-border rounded px-3 py-2 bg-background"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Ends (UTC)</span>
              <input
                type="datetime-local"
                name="endsAt"
                defaultValue={d.endsAt ? toDtLocal(d.endsAt) : ''}
                className="border border-border rounded px-3 py-2 bg-background"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Total cap</span>
              <input
                type="number"
                name="quantityCap"
                min="1"
                step="1"
                placeholder="—"
                defaultValue={d.quantityCap ?? ''}
                className="border border-border rounded px-3 py-2 bg-background tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Per customer</span>
              <input
                type="number"
                name="perCustomerCap"
                min="1"
                step="1"
                placeholder="—"
                defaultValue={d.perCustomerCap ?? ''}
                className="border border-border rounded px-3 py-2 bg-background tabular-nums"
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Times are stored as UTC. Convert from your local TZ before
            entering (e.g. PT = UTC-7 or UTC-8 depending on DST).
          </p>
          <button
            type="submit"
            className="self-start bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Save schedule
          </button>
        </form>
      </Section>

      {/* Allocations */}
      <Section
        title="Variants in this drop"
        right={
          <span className="text-xs text-muted-foreground">
            {allocations.length} {allocations.length === 1 ? 'variant' : 'variants'}
          </span>
        }
      >
        {allocations.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-3">
            No variants assigned yet.
          </p>
        ) : (
          <ul className="border-y border-border -mx-4 divide-y divide-border mb-3">
            {allocations.map((a) => (
              <li key={a.variantId} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{a.productTitle}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {a.sku} · {formatMoney(a.priceCents)}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {a.qtyOnHand ?? 0} on hand
                  </span>
                </div>
                <form
                  action={updateAllocation.bind(null, d.id, a.variantId)}
                  className="flex items-end gap-2 mt-2"
                >
                  <label className="flex flex-col gap-0.5 flex-1">
                    <span className="text-xs text-muted-foreground">
                      Drop cap (blank = use full inventory)
                    </span>
                    <input
                      type="number"
                      name="allocatedQty"
                      min="1"
                      step="1"
                      defaultValue={a.allocatedQty ?? ''}
                      placeholder="—"
                      className="border border-border rounded px-2 py-1 text-sm bg-background tabular-nums"
                    />
                  </label>
                  <button
                    type="submit"
                    className="bg-primary text-primary-foreground rounded px-3 py-1 text-xs font-medium hover:opacity-90"
                  >
                    Save
                  </button>
                </form>
                <form
                  action={removeAllocation.bind(null, d.id, a.variantId)}
                  className="mt-1"
                >
                  <button
                    type="submit"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Remove from drop
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {/* Add allocation */}
        {pickerCandidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {availableVariants.length === 0
              ? `No published variants in ${d.storefrontSlug} yet. Publish a product first.`
              : 'All published variants are already in this drop.'}
          </p>
        ) : (
          <details className="border border-border rounded p-3">
            <summary className="cursor-pointer text-sm font-medium">Add variant</summary>
            <form
              action={addAllocation.bind(null, d.id)}
              className="flex items-end gap-2 mt-3"
            >
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-muted-foreground">Variant</span>
                <select
                  name="variantId"
                  required
                  className="border border-border rounded px-2 py-1 text-sm bg-background"
                >
                  <option value="">— pick —</option>
                  {groupByProduct(pickerCandidates).map((g) => (
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
              <label className="flex flex-col gap-1 w-24">
                <span className="text-xs text-muted-foreground">Cap (opt)</span>
                <input
                  type="number"
                  name="allocatedQty"
                  min="1"
                  step="1"
                  placeholder="—"
                  className="border border-border rounded px-2 py-1 text-sm bg-background tabular-nums"
                />
              </label>
              <button
                type="submit"
                className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
              >
                Add
              </button>
            </form>
          </details>
        )}
      </Section>
    </div>
  );
}

// -----------------------------------------------------------------------------

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <header className="flex items-baseline justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

/** Convert a Date to the YYYY-MM-DDTHH:mm string datetime-local expects, in UTC. */
function toDtLocal(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

type VariantPickerRow = {
  id: string;
  sku: string;
  priceCents: number;
  productId: string;
  productTitle: string;
};

function groupByProduct(variants: VariantPickerRow[]): Array<{
  productId: string;
  productTitle: string;
  variants: VariantPickerRow[];
}> {
  const map = new Map<string, { productId: string; productTitle: string; variants: VariantPickerRow[] }>();
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
