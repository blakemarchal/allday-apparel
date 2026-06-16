import Link from 'next/link';
import { getCurrentStorefront, CHARACTER_BASE_PATH } from '@/lib/storefront';
import { cartItemCount } from '@/lib/cart';
import { StorefrontHeader } from '@/components/storefront/Header';

function crossLink(basePath: string): { href: string; label: string } {
  return basePath === CHARACTER_BASE_PATH
    ? { href: '/', label: 'Allday Apparel' }
    : { href: CHARACTER_BASE_PATH, label: 'Will Allday' };
}

export default async function StorefrontLanding() {
  const storefront = await getCurrentStorefront();
  if (!storefront) return <UnconfiguredHost />;

  const base = storefront.basePath;
  const cartCount = await cartItemCount(storefront.id);

  return (
    <>
      <StorefrontHeader storefront={storefront} cartCount={cartCount} cross={crossLink(base)} />
      <main className="max-w-2xl mx-auto px-6 py-16">
        <p className="text-sm text-muted-foreground">
          {storefront.hostname}
          {base} → <code>{storefront.slug}</code>
        </p>
        <h1 className="text-5xl font-heading font-bold mt-1 mb-4">Welcome to {storefront.name}.</h1>
        <p className="opacity-75">Catalog coming soon. Currency: {storefront.currency}.</p>
        <div className="mt-8 flex gap-3">
          <Link
            href={`${base}/products`}
            className="bg-primary text-primary-foreground rounded px-6 py-3 font-medium hover:opacity-90"
          >
            Browse the shop →
          </Link>
        </div>
      </main>
    </>
  );
}

function UnconfiguredHost() {
  return (
    <main className="max-w-xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-4">Storefront not configured</h1>
      <p>
        No <code>storefront_host</code> row matches this hostname. Seed the dev hosts or insert a
        row manually.
      </p>
    </main>
  );
}
