import Link from 'next/link';
import type { StorefrontContext } from '@/lib/storefront';

/**
 * Storefront header. `basePath` keeps the logo + cart links inside the current
 * store. `cross` is an optional link to the *other* store (Blake's "fans
 * curious about the root" funnel between apparel and the wrestling store).
 */
export function StorefrontHeader({
  storefront,
  cartCount,
  cross,
}: {
  storefront: NonNullable<StorefrontContext>;
  cartCount: number;
  cross?: { href: string; label: string } | null;
}) {
  const base = storefront.basePath || '';
  return (
    <header className="border-b border-border px-4 py-3 flex items-center justify-between gap-3">
      <Link href={base || '/'} className="font-heading font-bold text-lg truncate">
        {storefront.name}
      </Link>
      <div className="flex items-center gap-4 text-sm shrink-0">
        {cross && (
          // Plain <a> (full page load), NOT next/link: the two stores share the
          // root layout, which sets the theme on <body> and persists across
          // client-side nav. A hard navigation re-resolves the theme so crossing
          // apparel ↔ character actually repaints the palette + fonts.
          <a href={cross.href} className="text-muted-foreground hover:text-foreground hidden sm:inline">
            {cross.label} →
          </a>
        )}
        <Link href={`${base}/cart`} className="flex items-center gap-1.5 hover:opacity-80">
          <span>Cart</span>
          {cartCount > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full text-xs px-1.5 py-0.5 tabular-nums min-w-[1.25rem] text-center">
              {cartCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
