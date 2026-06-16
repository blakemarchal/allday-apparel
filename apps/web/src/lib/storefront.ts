import 'server-only';
import { headers } from 'next/headers';
import { db } from '@allday/db';
import { storefront, storefrontHost } from '@allday/db/schema';
import { eq } from 'drizzle-orm';

/**
 * The character store lives at this path prefix on the apparel host
 * (allday-apparel.com/WillAllday), NOT a subdomain. Apparel is the apex root.
 */
export const CHARACTER_BASE_PATH = '/WillAllday';
const CHARACTER_SLUG = 'character';

/**
 * Resolved storefront for the current request. `basePath` is '' for the
 * apparel apex and '/WillAllday' for the character store — prepend it to all
 * storefront-internal links so they stay within the right store.
 */
export type StorefrontContext = {
  id: string;
  slug: string;
  name: string;
  currency: string;
  hostname: string;
  isPrimaryHost: boolean;
  basePath: string;
} | null;

function normalizeHost(host: string): string {
  return host.split(':')[0]!.toLowerCase();
}

type Row = { id: string; slug: string; name: string; currency: string };

async function selectByHost(
  hostname: string,
): Promise<{ row: Row; isPrimary: boolean } | null> {
  const rows = await db
    .select({
      id: storefront.id,
      slug: storefront.slug,
      name: storefront.name,
      currency: storefront.currency,
      isPrimary: storefrontHost.isPrimary,
    })
    .from(storefrontHost)
    .innerJoin(storefront, eq(storefrontHost.storefrontId, storefront.id))
    .where(eq(storefrontHost.hostname, hostname))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    row: { id: r.id, slug: r.slug, name: r.name, currency: r.currency },
    isPrimary: r.isPrimary,
  };
}

async function selectBySlug(slug: string): Promise<Row | null> {
  const rows = await db
    .select({
      id: storefront.id,
      slug: storefront.slug,
      name: storefront.name,
      currency: storefront.currency,
    })
    .from(storefront)
    .where(eq(storefront.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

function isCharacterPath(pathname: string): boolean {
  return pathname === CHARACTER_BASE_PATH || pathname.startsWith(`${CHARACTER_BASE_PATH}/`);
}

/**
 * Resolve the storefront for the current request from host + path:
 *   - host doesn't map to a storefront  → null (unconfigured)
 *   - path under /WillAllday            → character store (basePath set)
 *   - otherwise                         → the host's storefront (apparel)
 *
 * Tying the character path to a configured host means /WillAllday only works
 * on a real storefront host, never a stray one.
 */
export async function getCurrentStorefront(): Promise<StorefrontContext> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  const pathname = hdrs.get('x-pathname') ?? '';
  if (!host) return null;

  const hostname = normalizeHost(host);
  const hostMatch = await selectByHost(hostname);
  if (!hostMatch) return null;

  if (isCharacterPath(pathname)) {
    const ch = await selectBySlug(CHARACTER_SLUG);
    if (!ch) return null;
    return {
      id: ch.id,
      slug: ch.slug,
      name: ch.name,
      currency: ch.currency,
      hostname,
      isPrimaryHost: false,
      basePath: CHARACTER_BASE_PATH,
    };
  }

  return {
    id: hostMatch.row.id,
    slug: hostMatch.row.slug,
    name: hostMatch.row.name,
    currency: hostMatch.row.currency,
    hostname,
    isPrimaryHost: hostMatch.isPrimary,
    basePath: '',
  };
}

/** Resolve a storefront by id (used by server actions that receive an explicit id). */
export async function getStorefrontById(id: string): Promise<Row | null> {
  const rows = await db
    .select({
      id: storefront.id,
      slug: storefront.slug,
      name: storefront.name,
      currency: storefront.currency,
    })
    .from(storefront)
    .where(eq(storefront.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** basePath for a storefront slug. Only the character store is path-prefixed. */
export function basePathForSlug(slug: string): string {
  return slug === CHARACTER_SLUG ? CHARACTER_BASE_PATH : '';
}

/** Is the current request hitting the admin subdomain? */
export async function isAdminRequest(): Promise<boolean> {
  const hdrs = await headers();
  const host = hdrs.get('host') ?? '';
  return normalizeHost(host).startsWith('admin.');
}
