import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@allday/db';
import { drop, dropAllocation, storefront } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { formatRelativeDate } from '@/lib/money';

export default async function DropsListPage() {
  await requireAdmin();

  const rows = await db
    .select({
      id: drop.id,
      name: drop.name,
      slug: drop.slug,
      status: drop.status,
      startsAt: drop.startsAt,
      endsAt: drop.endsAt,
      quantityCap: drop.quantityCap,
      perCustomerCap: drop.perCustomerCap,
      storefrontSlug: storefront.slug,
      storefrontName: storefront.name,
      allocationCount: sql<number>`COUNT(${dropAllocation.variantId})::int`,
    })
    .from(drop)
    .innerJoin(storefront, eq(storefront.id, drop.storefrontId))
    .leftJoin(dropAllocation, eq(dropAllocation.dropId, drop.id))
    .groupBy(drop.id, storefront.id)
    .orderBy(desc(drop.createdAt));

  return (
    <div>
      <header className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-heading font-bold">Drops</h1>
        <Link
          href="/admin/drops/new"
          className="bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm font-medium hover:opacity-90"
        >
          + New
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          <p>No drops yet.</p>
          <Link href="/admin/drops/new" className="text-foreground underline mt-2 inline-block">
            Schedule your first drop →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border -mx-4">
          {rows.map((d) => (
            <li key={d.id}>
              <Link
                href={`/admin/drops/${d.id}`}
                className="block px-4 py-3 active:bg-muted"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium truncate">{d.name}</span>
                  <DropStatusBadge status={d.status} />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
                  <span className="font-mono">
                    {d.storefrontSlug} / {d.slug}
                  </span>
                  <span>
                    {d.allocationCount} {d.allocationCount === 1 ? 'variant' : 'variants'}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
                  <span>
                    {d.startsAt
                      ? `Starts ${formatRelativeDate(d.startsAt)}`
                      : 'No start time'}
                    {d.endsAt && ` · ends ${formatRelativeDate(d.endsAt)}`}
                  </span>
                  {d.quantityCap && (
                    <span className="tabular-nums">cap {d.quantityCap}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DropStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'live'
      ? 'bg-primary text-primary-foreground' // selling now — most important state
      : status === 'scheduled'
        ? 'border border-border text-foreground' // queued
        : status === 'draft'
          ? 'bg-muted text-muted-foreground'
          : 'bg-muted text-muted-foreground'; // ended
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {status}
    </span>
  );
}
