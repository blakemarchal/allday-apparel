import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@allday/db';
import {
  order,
  orderLineItem,
  storefront,
  payoutAccrual,
} from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';
import { formatMoney, formatRelativeDate, shortId } from '@/lib/money';
import { markFulfilled } from './actions';

type Params = Promise<{ id: string }>;

export default async function OrderDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;

  const [row] = await db
    .select({
      // Order fields
      id: order.id,
      status: order.status,
      subtotalCents: order.subtotalCents,
      taxCents: order.taxCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      currency: order.currency,
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      emailSnapshot: order.emailSnapshot,
      refundedAmountCents: order.refundedAmountCents,
      refundReason: order.refundReason,
      stripeFeeCents: order.stripeFeeCents,
      shippingLabelCostCents: order.shippingLabelCostCents,
      stripeCheckoutSessionId: order.stripeCheckoutSessionId,
      stripePaymentIntentId: order.stripePaymentIntentId,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      fulfilledAt: order.fulfilledAt,
      // Storefront
      storefrontSlug: storefront.slug,
      storefrontName: storefront.name,
    })
    .from(order)
    .innerJoin(storefront, eq(storefront.id, order.storefrontId))
    .where(eq(order.id, id))
    .limit(1);

  if (!row) notFound();

  const lineItems = await db
    .select()
    .from(orderLineItem)
    .where(eq(orderLineItem.orderId, id));

  const [accrual] = await db
    .select()
    .from(payoutAccrual)
    .where(eq(payoutAccrual.orderId, id))
    .limit(1);

  return (
    <div>
      <Link
        href="/admin/orders"
        className="text-sm text-muted-foreground hover:text-foreground inline-block mb-3"
      >
        ← All orders
      </Link>

      <header className="mb-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-mono text-lg">#{shortId(row.id)}</h1>
          <span className="text-sm text-muted-foreground">{row.storefrontName}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3 mt-1">
          <span className="text-3xl font-heading font-bold">
            {formatMoney(row.totalCents, row.currency)}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded font-medium ${
              row.status === 'paid'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {row.status.replace('_', ' ')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Paid {formatRelativeDate(row.paidAt)} · Created{' '}
          {formatRelativeDate(row.createdAt)}
        </p>
      </header>

      {/* Primary action — only relevant when paid-but-unfulfilled. */}
      {row.status === 'paid' && (
        <form action={markFulfilled.bind(null, row.id)} className="mb-6">
          <button
            type="submit"
            className="w-full bg-primary text-primary-foreground rounded px-4 py-3 font-medium hover:opacity-90 active:opacity-80"
          >
            Mark shipped
          </button>
        </form>
      )}
      {row.fulfilledAt && (
        <p className="mb-6 text-sm text-muted-foreground">
          Shipped {formatRelativeDate(row.fulfilledAt)}.
        </p>
      )}

      {/* Line items */}
      <Section title="Items">
        <ul className="border-y border-border -mx-4 divide-y divide-border">
          {lineItems.map((li) => (
            <li key={li.id} className="px-4 py-3 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {li.titleSnapshot}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {li.skuSnapshot}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {li.qty} × {formatMoney(li.unitPriceCents, row.currency)}
                </div>
              </div>
              <div className="text-sm font-medium tabular-nums">
                {formatMoney(li.lineTotalCents, row.currency)}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      {/* Totals */}
      <Section title="Totals">
        <dl className="space-y-1 text-sm">
          <Row label="Subtotal" value={formatMoney(row.subtotalCents, row.currency)} />
          <Row label="Tax" value={formatMoney(row.taxCents, row.currency)} />
          <Row label="Shipping" value={formatMoney(row.shippingCents, row.currency)} />
          <Row
            label={<strong>Total</strong>}
            value={<strong>{formatMoney(row.totalCents, row.currency)}</strong>}
          />
        </dl>
      </Section>

      {/* Margin breakdown (admin-only operational data) */}
      {accrual && (
        <Section title="Margin">
          <dl className="space-y-1 text-sm">
            <Row label="Gross" value={formatMoney(accrual.grossCents, row.currency)} />
            <Row label="COGS" value={`-${formatMoney(accrual.cogsCents, row.currency)}`} />
            <Row
              label="Stripe fee"
              value={`-${formatMoney(accrual.stripeFeeCents, row.currency)}`}
              hint="(estimated 2.9% + $0.30)"
            />
            {accrual.shippingLabelCostCents != null && (
              <Row
                label="Shipping label"
                value={`-${formatMoney(accrual.shippingLabelCostCents, row.currency)}`}
              />
            )}
            <Row
              label={<strong>Net margin</strong>}
              value={
                <strong>{formatMoney(accrual.netMarginCents, row.currency)}</strong>
              }
            />
            <Row
              label="Owed to Blake"
              value={formatMoney(accrual.amountCents, row.currency)}
              hint={`(${(accrual.pctBasisPointsSnapshot / 100).toFixed(1)}% of net, status: ${accrual.status})`}
            />
          </dl>
        </Section>
      )}

      {/* Customer */}
      <Section title="Customer">
        <p className="text-sm">{row.emailSnapshot ?? 'guest checkout'}</p>
        {row.shippingAddress ? (
          <pre className="text-xs mt-2">
            {JSON.stringify(row.shippingAddress, null, 2)}
          </pre>
        ) : null}
      </Section>

      {/* Payment refs */}
      <Section title="Payment">
        <dl className="space-y-1 text-xs font-mono break-all">
          <Row label="Checkout" value={row.stripeCheckoutSessionId} />
          {row.stripePaymentIntentId && (
            <Row label="PaymentIntent" value={row.stripePaymentIntentId} />
          )}
        </dl>
        <p className="text-xs text-muted-foreground mt-2">
          Refund via Stripe Dashboard for v1. A built-in refund flow lands later.
        </p>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-right">
        {value}
        {hint && (
          <span className="ml-1 text-xs text-muted-foreground">{hint}</span>
        )}
      </dd>
    </div>
  );
}
