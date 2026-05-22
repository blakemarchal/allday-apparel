import Link from 'next/link';
import { db } from '@allday/db';
import { storefront } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { createProduct } from './actions';

type SearchParams = Promise<{ error?: string }>;

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const params = await searchParams;

  const storefronts = await db.select({ id: storefront.id, slug: storefront.slug, name: storefront.name }).from(storefront);

  return (
    <div className="max-w-md mx-auto">
      <Link
        href="/admin/products"
        className="text-sm text-muted-foreground hover:text-foreground inline-block mb-3"
      >
        ← Products
      </Link>
      <h1 className="text-2xl font-heading font-bold mb-4">New product</h1>

      {params.error && (
        <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
          <strong className="text-foreground">Couldn&apos;t create:</strong> {params.error}
        </div>
      )}

      <form action={createProduct} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Storefront</span>
          <select
            name="storefrontId"
            required
            defaultValue={storefronts[0]?.id ?? ''}
            className="border border-border rounded px-3 py-2.5 bg-background text-foreground"
          >
            {storefronts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.slug})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Title</span>
          <input
            type="text"
            name="title"
            required
            placeholder="Allday Black Tee"
            className="border border-border rounded px-3 py-2.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Slug</span>
          <input
            type="text"
            name="slug"
            required
            pattern="[a-z0-9\-]+"
            placeholder="black-tee"
            className="border border-border rounded px-3 py-2.5 bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <span className="text-xs text-muted-foreground">
            Lowercase letters, numbers, hyphens. Used in the URL.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Description</span>
          <textarea
            name="description"
            rows={4}
            placeholder="Markdown allowed."
            className="border border-border rounded px-3 py-2.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded px-4 py-2.5 font-medium hover:opacity-90 active:opacity-80 mt-2"
        >
          Create as draft
        </button>
      </form>

      <p className="text-xs text-muted-foreground mt-4">
        Created in draft. Add variants on the next screen, then publish when
        ready.
      </p>
    </div>
  );
}
