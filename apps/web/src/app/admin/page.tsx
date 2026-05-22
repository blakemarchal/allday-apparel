import { requireAdmin } from '@/lib/admin-user';

/**
 * Admin dashboard — "30-second-from-phone" stats and quick actions.
 * Numbers are placeholders for now; wired to real queries in a follow-up
 * (today's orders / paid / fulfilled, low-stock count, drops live now,
 * outstanding payout accrual sum).
 */
export default async function AdminDashboard() {
  const me = await requireAdmin();

  const greeting = me.name ?? me.email.split('@')[0];

  return (
    <div>
      <h1 className="text-2xl font-heading font-bold mb-1">Hi, {greeting}.</h1>
      <p className="text-sm text-muted-foreground mb-6">Quick look. Tap a card to drill in.</p>

      <div className="grid grid-cols-2 gap-3">
        <DashboardCard label="Today’s orders" value="—" hint="Paid in the last 24h" />
        <DashboardCard label="Low stock" value="—" hint="Variants under threshold" />
        <DashboardCard label="Drops live" value="—" hint="Currently selling" />
        <DashboardCard label="Owed to Blake" value="—" hint="Outstanding accruals" />
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        Real numbers + drill-through links land with the per-section CRUD pages.
      </p>
    </div>
  );
}

function DashboardCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border border-border rounded p-4 bg-background">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-heading font-bold mt-1 text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}
