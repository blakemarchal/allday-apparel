import Link from 'next/link';
import { db } from '@allday/db';
import { storefront } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { createDrop } from './actions';

type SearchParams = Promise<{ error?: string }>;

export default async function NewDropPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  const storefronts = await db
    .select({ id: storefront.id, slug: storefront.slug, name: storefront.name })
    .from(storefront);

  return (
    <div className="max-w-md mx-auto">
      <Link
        href="/admin/drops"
        className="text-sm text-muted-foreground hover:text-foreground inline-block mb-3"
      >
        ← Drops
      </Link>
      <h1 className="text-2xl font-heading font-bold mb-4">Schedule a drop</h1>

      {error && (
        <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
          <strong className="text-foreground">Couldn&apos;t create:</strong> {error}
        </div>
      )}

      <form action={createDrop} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Storefront</span>
          <select
            name="storefrontId"
            required
            defaultValue={storefronts[0]?.id ?? ''}
            className="border border-border rounded px-3 py-2.5 bg-background"
          >
            {storefronts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.slug})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Name</span>
          <input
            type="text"
            name="name"
            required
            placeholder="Spring Drop 2026"
            className="border border-border rounded px-3 py-2.5 bg-background"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Slug</span>
          <input
            type="text"
            name="slug"
            required
            pattern="[a-z0-9\-]+"
            placeholder="spring-2026"
            className="border border-border rounded px-3 py-2.5 bg-background font-mono"
          />
        </label>

        <p className="text-xs text-muted-foreground -my-1">
          Schedule, allocation, and caps land on the next screen.
        </p>

        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded px-4 py-2.5 font-medium hover:opacity-90 mt-2"
        >
          Create as draft
        </button>
      </form>
    </div>
  );
}
