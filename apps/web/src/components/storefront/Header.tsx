import Link from 'next/link';
import type { StorefrontContext } from '@/lib/storefront';

export function StorefrontHeader({
  storefront,
  cartCount,
}: {
  storefront: NonNullable<StorefrontContext>;
  cartCount: number;
}) {
  return (
    <header className="border-b border-border px-4 py-3 flex items-center justify-between">
      <Link href="/" className="font-heading font-bold text-lg truncate">
        {storefront.name}
      </Link>
      <Link
        href="/cart"
        className="text-sm flex items-center gap-1.5 hover:opacity-80"
      >
        <span>Cart</span>
        {cartCount > 0 && (
          <span className="bg-primary text-primary-foreground rounded-full text-xs px-1.5 py-0.5 tabular-nums min-w-[1.25rem] text-center">
            {cartCount}
          </span>
        )}
      </Link>
    </header>
  );
}
