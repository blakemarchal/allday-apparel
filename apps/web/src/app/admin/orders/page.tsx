import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { order, storefront } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { formatMoney, formatRelativeDate, shortId } from '@/lib/money';

export default async function OrdersListPage() {
  await requireAdmin();

  const orders = await db
    .select({
      id: order.id,
      status: order.status,
      subtotalCents: order.subtotalCents,
      totalCents: order.totalCents,
      currency: order.currency,
      emailSnapshot: order.emailSnapshot,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      fulfilledAt: order.fulfilledAt,
      storefrontSlug: storefront.slug,
      storefrontName: storefront.name,
    })
    .from(order)
    .innerJoin(storefront, eq(storefront.id, order.storefrontId))
    .orderBy(desc(order.createdAt))
    .limit(100);

  return (
    <div>
      <header className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-heading font-bold">Orders</h1>
        <span className="text-xs text-muted-foreground">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'}
        </span>
      </header>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No orders yet.
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border -mx-4">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/orders/${o.id}`}
                className="block px-4 py-3 active:bg-muted"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{shortId(o.id)}
                  </span>
                  <span className="text-base font-medium">
                    {formatMoney(o.totalCents, o.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-sm truncate">
                    {o.emailSnapshot ?? <em className="text-muted-foreground">guest</em>}
                  </span>
                  <StatusBadge status={o.status} />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{o.storefrontName}</span>
                  <span>{formatRelativeDate(o.paidAt ?? o.createdAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  // Color map intentionally narrow — adds visual weight only to states that
  // need operator attention.
  const cls =
    status === 'paid'
      ? 'bg-primary text-primary-foreground' // needs to ship
      : status === 'fulfilled'
        ? 'border border-border text-muted-foreground' // done
        : status === 'refunded' || status === 'partially_refunded'
          ? 'bg-muted text-muted-foreground' // archived attention
          : 'bg-muted text-muted-foreground'; // pending/cancelled
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
