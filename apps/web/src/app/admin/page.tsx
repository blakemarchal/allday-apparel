import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-user';
import { dashboardStats } from '@/lib/admin-queries';
import { formatMoney } from '@/lib/money';

/**
 * Admin dashboard — "30-second-from-phone" stats. Each card is a live query.
 */
export default async function AdminDashboard() {
  const me = await requireAdmin();
  const stats = await dashboardStats();

  const greeting = me.name ?? me.email.split('@')[0];

  return (
    <div>
      <h1 className="text-2xl font-heading font-bold mb-1">Hi, {greeting}.</h1>
      <p className="text-sm text-muted-foreground mb-6">Quick look. Tap a card to drill in.</p>

      <div className="grid grid-cols-2 gap-3">
        <DashboardCard
          href="/admin/orders"
          label="Paid today"
          value={String(stats.todayOrders)}
          hint="Need to ship"
        />
        <DashboardCard
          href="/admin/stock"
          label="Low stock"
          value={String(stats.lowStock)}
          hint="Under threshold"
        />
        <DashboardCard
          href="/admin/drops"
          label="Drops live"
          value={String(stats.dropsLive)}
          hint="Currently selling"
        />
        <DashboardCard
          href="/admin/payouts"
          label="Owed to Blake"
          value={formatMoney(stats.owedCents)}
          hint="Outstanding accruals"
        />
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Tap a card to drill in. Products / drops / stock / payouts CRUD pages
        land in the next chunk; orders is wired now.
      </p>
    </div>
  );
}

function DashboardCard({
  href,
  label,
  value,
  hint,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="border border-border rounded p-4 bg-background hover:bg-muted/40 active:bg-muted block"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-heading font-bold mt-1 text-foreground tabular-nums">
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </Link>
  );
}
