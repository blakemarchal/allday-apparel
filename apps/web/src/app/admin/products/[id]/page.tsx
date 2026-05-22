import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asc, eq } from 'drizzle-orm';
import { db } from '@allday/db';
import {
  product,
  storefront,
  variant,
  inventoryItem,
} from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import {
  updateProduct,
  setProductStatus,
  addVariant,
  updateVariant,
  deleteVariant,
} from './actions';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;

  const [p] = await db
    .select({
      id: product.id,
      title: product.title,
      slug: product.slug,
      description: product.description,
      status: product.status,
      storefrontId: product.storefrontId,
      storefrontName: storefront.name,
      storefrontSlug: storefront.slug,
      currency: storefront.currency,
    })
    .from(product)
    .innerJoin(storefront, eq(storefront.id, product.storefrontId))
    .where(eq(product.id, id))
    .limit(1);

  if (!p) notFound();

  const variants = await db
    .select({
      id: variant.id,
      sku: variant.sku,
      priceCents: variant.priceCents,
      costCents: variant.costCents,
      weightGrams: variant.weightGrams,
      status: variant.status,
      qtyOnHand: inventoryItem.qtyOnHand,
      qtyReserved: inventoryItem.qtyReserved,
    })
    .from(variant)
    .leftJoin(inventoryItem, eq(inventoryItem.variantId, variant.id))
    .where(eq(variant.productId, p.id))
    .orderBy(asc(variant.sku));

  return (
    <div>
      <Link
        href="/admin/products"
        className="text-sm text-muted-foreground hover:text-foreground inline-block mb-3"
      >
        ← Products
      </Link>

      <header className="mb-6">
        <h1 className="text-2xl font-heading font-bold">{p.title}</h1>
        <p className="text-xs text-muted-foreground font-mono mt-1">
          {p.storefrontSlug} / {p.slug}
        </p>
      </header>

      {error && (
        <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
          <strong className="text-foreground">Couldn&apos;t save:</strong> {error}
        </div>
      )}

      {/* Status + lifecycle actions */}
      <Section title="Status">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded font-medium ${
              p.status === 'published'
                ? 'bg-primary text-primary-foreground'
                : p.status === 'draft'
                  ? 'bg-muted text-muted-foreground'
                  : 'border border-border text-muted-foreground'
            }`}
          >
            {p.status}
          </span>
          <div className="flex gap-2">
            {p.status !== 'published' && (
              <form action={setProductStatus.bind(null, p.id, 'published')}>
                <button
                  type="submit"
                  className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
                  disabled={variants.length === 0}
                  title={variants.length === 0 ? 'Add at least one variant first' : undefined}
                >
                  Publish
                </button>
              </form>
            )}
            {p.status === 'published' && (
              <form action={setProductStatus.bind(null, p.id, 'draft')}>
                <button
                  type="submit"
                  className="border border-border rounded px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  Unpublish
                </button>
              </form>
            )}
            {p.status !== 'archived' && (
              <form action={setProductStatus.bind(null, p.id, 'archived')}>
                <button
                  type="submit"
                  className="border border-border rounded px-3 py-1.5 text-sm hover:bg-muted text-muted-foreground"
                >
                  Archive
                </button>
              </form>
            )}
          </div>
        </div>
        {variants.length === 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Add at least one variant before publishing.
          </p>
        )}
      </Section>

      {/* Basic info form */}
      <Section title="Details">
        <form action={updateProduct.bind(null, p.id)} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Title</span>
            <input
              type="text"
              name="title"
              required
              defaultValue={p.title}
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
              defaultValue={p.slug}
              className="border border-border rounded px-3 py-2 bg-background font-mono"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Description</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={p.description ?? ''}
              className="border border-border rounded px-3 py-2 bg-background"
            />
          </label>
          <button
            type="submit"
            className="self-start bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            Save details
          </button>
        </form>
      </Section>

      {/* Variants */}
      <Section
        title="Variants"
        right={
          <span className="text-xs text-muted-foreground">
            {variants.length} {variants.length === 1 ? 'variant' : 'variants'}
          </span>
        }
      >
        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-3">
            No variants yet. Single-SKU products (signed posters, one-offs) only
            need one variant. T-shirts with sizes need one per size — for now,
            add them one at a time. Option matrix (Size × Color) auto-generation
            lands later.
          </p>
        ) : (
          <ul className="border-y border-border -mx-4 divide-y divide-border mb-4">
            {variants.map((v) => (
              <li key={v.id} className="px-4 py-3">
                <form
                  action={updateVariant.bind(null, p.id, v.id)}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4 items-end"
                >
                  <label className="flex flex-col gap-0.5 col-span-2 sm:col-span-1">
                    <span className="text-xs text-muted-foreground">SKU</span>
                    <input
                      type="text"
                      name="sku"
                      required
                      defaultValue={v.sku}
                      className="border border-border rounded px-2 py-1 text-sm font-mono bg-background"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Price ($)</span>
                    <input
                      type="number"
                      name="priceDollars"
                      required
                      step="0.01"
                      min="0"
                      defaultValue={(v.priceCents / 100).toFixed(2)}
                      className="border border-border rounded px-2 py-1 text-sm bg-background tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Cost ($)</span>
                    <input
                      type="number"
                      name="costDollars"
                      step="0.01"
                      min="0"
                      defaultValue={v.costCents != null ? (v.costCents / 100).toFixed(2) : ''}
                      placeholder="—"
                      className="border border-border rounded px-2 py-1 text-sm bg-background tabular-nums"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">Wt (g)</span>
                    <input
                      type="number"
                      name="weightGrams"
                      step="1"
                      min="0"
                      defaultValue={v.weightGrams ?? ''}
                      placeholder="—"
                      className="border border-border rounded px-2 py-1 text-sm bg-background tabular-nums"
                    />
                  </label>
                  <div className="col-span-2 sm:col-span-4 flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      Stock: {v.qtyOnHand ?? 0} on hand, {v.qtyReserved ?? 0} reserved
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="bg-primary text-primary-foreground rounded px-3 py-1 text-xs font-medium hover:opacity-90"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </form>
                <form
                  action={deleteVariant.bind(null, p.id, v.id)}
                  className="mt-1"
                >
                  <button
                    type="submit"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Delete variant
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {/* Add variant form */}
        <details className="border border-border rounded p-3">
          <summary className="cursor-pointer text-sm font-medium">Add variant</summary>
          <form
            action={addVariant.bind(null, p.id)}
            className="grid grid-cols-2 gap-2 mt-3 sm:grid-cols-4 items-end"
          >
            <label className="flex flex-col gap-0.5 col-span-2 sm:col-span-1">
              <span className="text-xs text-muted-foreground">SKU</span>
              <input
                type="text"
                name="sku"
                required
                placeholder={`${p.slug.toUpperCase()}-1`}
                className="border border-border rounded px-2 py-1 text-sm font-mono bg-background"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Price ($)</span>
              <input
                type="number"
                name="priceDollars"
                required
                step="0.01"
                min="0"
                placeholder="30.00"
                className="border border-border rounded px-2 py-1 text-sm bg-background"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Cost ($)</span>
              <input
                type="number"
                name="costDollars"
                step="0.01"
                min="0"
                placeholder="—"
                className="border border-border rounded px-2 py-1 text-sm bg-background"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Wt (g)</span>
              <input
                type="number"
                name="weightGrams"
                step="1"
                min="0"
                placeholder="—"
                className="border border-border rounded px-2 py-1 text-sm bg-background"
              />
            </label>
            <button
              type="submit"
              className="col-span-2 sm:col-span-4 bg-primary text-primary-foreground rounded px-3 py-2 text-sm font-medium mt-1 hover:opacity-90"
            >
              Add variant
            </button>
          </form>
        </details>
      </Section>

      <p className="text-xs text-muted-foreground mt-6">
        Stripe Product / Price sync on publish lands in a follow-up. Image
        upload (R2) lands with #11.
      </p>
    </div>
  );
}

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

