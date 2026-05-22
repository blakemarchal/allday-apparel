import Link from 'next/link';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@allday/db';
import {
  payoutAccrual,
  payoutDisbursement,
  order,
  storefront,
} from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { formatMoney, formatRelativeDate, shortId } from '@/lib/money';
import { recordDisbursement, voidAccrual } from './actions';

type SearchParams = Promise<{ error?: string; ok?: string }>;

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { error, ok } = await searchParams;

  // Summary aggregates.
  const [owedRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${payoutAccrual.amountCents}), 0)::bigint`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(payoutAccrual)
    .where(eq(payoutAccrual.status, 'accrued'));

  const [paidRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${payoutAccrual.amountCents}), 0)::bigint`,
    })
    .from(payoutAccrual)
    .where(eq(payoutAccrual.status, 'paid'));

  // Accrued accruals (the ones eligible to settle), with order context.
  const accrued = await db
    .select({
      id: payoutAccrual.id,
      orderId: payoutAccrual.orderId,
      amountCents: payoutAccrual.amountCents,
      grossCents: payoutAccrual.grossCents,
      cogsCents: payoutAccrual.cogsCents,
      stripeFeeCents: payoutAccrual.stripeFeeCents,
      shippingLabelCostCents: payoutAccrual.shippingLabelCostCents,
      netMarginCents: payoutAccrual.netMarginCents,
      pctBasisPointsSnapshot: payoutAccrual.pctBasisPointsSnapshot,
      createdAt: payoutAccrual.createdAt,
      storefrontSlug: storefront.slug,
      orderPaidAt: order.paidAt,
    })
    .from(payoutAccrual)
    .innerJoin(order, eq(order.id, payoutAccrual.orderId))
    .innerJoin(storefront, eq(storefront.id, order.storefrontId))
    .where(eq(payoutAccrual.status, 'accrued'))
    .orderBy(desc(payoutAccrual.createdAt));

  // Recent disbursements.
  const disbursements = await db
    .select()
    .from(payoutDisbursement)
    .orderBy(desc(payoutDisbursement.paidAt))
    .limit(10);

  // Recently voided / paid summary (just counts so admin sees something happened).
  const [voidedRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(payoutAccrual)
    .where(eq(payoutAccrual.status, 'voided'));

  return (
    <div>
      <header className="mb-4">
        <h1 className="text-2xl font-heading font-bold">Payouts</h1>
        <p className="text-xs text-muted-foreground">
          Owed to Blake — accrued per order, settled via disbursement entries.
        </p>
      </header>

      {error && (
        <Banner>
          <strong className="text-foreground">Couldn&apos;t save:</strong> {error}
        </Banner>
      )}
      {ok && <Banner>Disbursement recorded.</Banner>}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <SummaryCard
          label="Owed (accrued)"
          value={formatMoney(Number(owedRow?.total ?? 0))}
          hint={`${owedRow?.count ?? 0} ${owedRow?.count === 1 ? 'order' : 'orders'}`}
        />
        <SummaryCard
          label="Paid (lifetime)"
          value={formatMoney(Number(paidRow?.total ?? 0))}
          hint={voidedRow?.count ? `${voidedRow.count} voided` : 'no voids'}
        />
      </div>

      {/* Record disbursement form — wraps the accrual checklist */}
      <Section title="Settle accruals">
        {accrued.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing outstanding. New accruals appear here when paid orders land.
          </p>
        ) : (
          <details className="border border-border rounded">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
              Record a disbursement (
              {accrued.length} accruals available, {formatMoney(Number(owedRow?.total ?? 0))}{' '}
              owed)
            </summary>
            <form action={recordDisbursement} className="p-4 flex flex-col gap-3 border-t border-border">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Amount ($)</span>
                  <input
                    type="number"
                    name="amountDollars"
                    required
                    step="0.01"
                    min="0"
                    className="border border-border rounded px-3 py-2 bg-background tabular-nums"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Method</span>
                  <input
                    type="text"
                    name="method"
                    required
                    placeholder="venmo"
                    className="border border-border rounded px-3 py-2 bg-background"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Ref</span>
                  <input
                    type="text"
                    name="reference"
                    placeholder="txn / memo"
                    className="border border-border rounded px-3 py-2 bg-background"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Paid</span>
                  <input
                    type="date"
                    name="paidAt"
                    required
                    defaultValue={todayIso()}
                    className="border border-border rounded px-3 py-2 bg-background"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Notes</span>
                <textarea
                  name="notes"
                  rows={2}
                  className="border border-border rounded px-3 py-2 bg-background"
                />
              </label>

              <fieldset className="flex flex-col gap-2 mt-1">
                <legend className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                  Accruals to mark paid against this disbursement
                </legend>
                <ul className="border border-border rounded divide-y divide-border max-h-72 overflow-y-auto">
                  {accrued.map((a) => (
                    <li key={a.id} className="px-3 py-2">
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="accrualIds"
                          value={a.id}
                          defaultChecked
                          className="w-4 h-4 mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <Link
                              href={`/admin/orders/${a.orderId}`}
                              className="font-mono text-xs underline"
                            >
                              #{shortId(a.orderId)}
                            </Link>
                            <span className="tabular-nums font-medium">
                              {formatMoney(a.amountCents)}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {a.storefrontSlug} · net{' '}
                            {formatMoney(a.netMarginCents)} ·{' '}
                            {(a.pctBasisPointsSnapshot / 100).toFixed(1)}% ·{' '}
                            {formatRelativeDate(a.orderPaidAt ?? a.createdAt)}
                          </div>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Sum of checked accruals should match the disbursement amount.
                  Admin flags discrepancies but doesn&apos;t enforce —
                  real-world payments include rounding.
                </p>
              </fieldset>

              <button
                type="submit"
                className="bg-primary text-primary-foreground rounded px-4 py-2 font-medium hover:opacity-90 mt-1"
              >
                Record disbursement + mark selected paid
              </button>
            </form>
          </details>
        )}
      </Section>

      {/* Accrued list (read-only, with void action per row) */}
      {accrued.length > 0 && (
        <Section
          title="Accrued"
          right={<span className="text-xs text-muted-foreground">{accrued.length}</span>}
        >
          <ul className="border-y border-border -mx-4 divide-y divide-border">
            {accrued.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/admin/orders/${a.orderId}`}
                    className="font-mono text-xs underline"
                  >
                    #{shortId(a.orderId)}
                  </Link>
                  <span className="tabular-nums font-medium">
                    {formatMoney(a.amountCents)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  gross {formatMoney(a.grossCents)} − cogs{' '}
                  {formatMoney(a.cogsCents)} − fee{' '}
                  {formatMoney(a.stripeFeeCents)}
                  {a.shippingLabelCostCents != null &&
                    ` − ship ${formatMoney(a.shippingLabelCostCents)}`}{' '}
                  = net {formatMoney(a.netMarginCents)}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-muted-foreground">
                    {a.storefrontSlug} · {formatRelativeDate(a.orderPaidAt ?? a.createdAt)}
                  </span>
                  <form action={voidAccrual.bind(null, a.id)}>
                    <button
                      type="submit"
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Void
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Recent disbursements */}
      {disbursements.length > 0 && (
        <Section
          title="Disbursements"
          right={<span className="text-xs text-muted-foreground">last {disbursements.length}</span>}
        >
          <ul className="border-y border-border -mx-4 divide-y divide-border">
            {disbursements.map((d) => (
              <li key={d.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {formatMoney(d.amountCents)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeDate(d.paidAt)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {d.method}
                  {d.reference && ` · ${d.reference}`}
                </div>
                {d.notes && (
                  <p className="text-xs text-muted-foreground italic mt-1">{d.notes}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
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
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function SummaryCard({
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
      <div className="text-2xl font-heading font-bold mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border rounded p-3 mb-4 text-sm bg-muted text-muted-foreground">
      {children}
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
