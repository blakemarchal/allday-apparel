import 'server-only';
import { headers } from 'next/headers';
import { db } from '@allday/db';
import { storefront, storefrontHost } from '@allday/db/schema';
import { eq } from 'drizzle-orm';

/**
 * The storefront context resolved from the incoming request hostname.
 * `null` when no storefront_host row matches — caller decides whether to 404,
 * redirect, or render a not-configured screen.
 */
export type StorefrontContext = {
  id: string;
  slug: string;
  name: string;
  currency: string;
  hostname: string;
  isPrimaryHost: boolean;
} | null;

/**
 * Strip port from a host header value. `apparel.localhost:3001` -> `apparel.localhost`.
 */
function normalizeHost(host: string): string {
  return host.split(':')[0]!.toLowerCase();
}

/**
 * Resolve the storefront for a given hostname via the storefront_host lookup.
 * Returns null if no row matches.
 */
export async function getStorefrontByHost(host: string): Promise<StorefrontContext> {
  const hostname = normalizeHost(host);

  const rows = await db
    .select({
      id: storefront.id,
      slug: storefront.slug,
      name: storefront.name,
      currency: storefront.currency,
      hostname: storefrontHost.hostname,
      isPrimary: storefrontHost.isPrimary,
    })
    .from(storefrontHost)
    .innerJoin(storefront, eq(storefrontHost.storefrontId, storefront.id))
    .where(eq(storefrontHost.hostname, hostname))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    currency: row.currency,
    hostname: row.hostname,
    isPrimaryHost: row.isPrimary,
  };
}

/**
 * Resolve the current request's storefront context using Next's `headers()`.
 * Call from Server Components / Server Actions / Route Handlers.
 */
export async function getCurrentStorefront(): Promise<StorefrontContext> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  if (!host) return null;
  return getStorefrontByHost(host);
}

/**
 * Convenience: is the current request hitting the admin subdomain?
 * Admin is keyed by hostname prefix `admin.` for v1 (no DB lookup needed).
 */
export async function isAdminRequest(): Promise<boolean> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  return normalizeHost(host).startsWith('admin.');
}
