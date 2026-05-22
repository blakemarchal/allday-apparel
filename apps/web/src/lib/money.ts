/**
 * Format an integer cents amount as currency. Default USD because v1 is
 * US-only; the second arg lets per-storefront currency override later.
 */
export function formatMoney(cents: number | null | undefined, currency = 'USD'): string {
  const c = cents ?? 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(c / 100);
}

/** Short, scannable ID for display (last 8 of a UUID). */
export function shortId(id: string): string {
  return id.slice(-8);
}

/** Human-readable relative date for list pages (e.g. "today 3:14p", "Mar 12"). */
export function formatRelativeDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  const now = new Date();
  const sameDay =
    date.getUTCFullYear() === now.getUTCFullYear() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCDate() === now.getUTCDate();
  if (sameDay) {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: now.getUTCFullYear() === date.getUTCFullYear() ? undefined : 'numeric',
  }).format(date);
}
