import Link from 'next/link';
import { getCurrentStorefront, CHARACTER_BASE_PATH } from '@/lib/storefront';
import { cartItemCount } from '@/lib/cart';
import { getLandingHero } from '@/lib/theme';
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
  const [cartCount, hero] = await Promise.all([
    cartItemCount(storefront.id),
    getLandingHero(storefront.id),
  ]);

  const headline = hero.headline || `Welcome to ${storefront.name}`;

  return (
    <>
      <StorefrontHeader storefront={storefront} cartCount={cartCount} cross={crossLink(base)} />

      {/* Hero — palette + typeface come from the storefront theme tokens, so the
          same markup reads premium-clean for apparel and loud for the character store. */}
      <main>
        <section className="px-6 py-24 sm:py-32 max-w-5xl mx-auto">
          {hero.eyebrow && (
            <p className="text-xs sm:text-sm uppercase tracking-[0.25em] text-accent font-medium mb-5">
              {hero.eyebrow}
            </p>
          )}
          <h1 className="font-heading font-bold leading-[0.95] text-5xl sm:text-7xl lg:text-8xl max-w-3xl">
            {headline}
          </h1>
          <div className="h-1 w-16 bg-accent mt-8 mb-8" aria-hidden />
          {hero.sub && (
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl leading-relaxed">
              {hero.sub}
            </p>
          )}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={`${base}/products`}
              className="bg-primary text-primary-foreground rounded px-8 py-4 text-lg font-medium hover:opacity-90 transition-opacity"
            >
              {hero.ctaLabel}
            </Link>
            <CrossStore base={base} />
          </div>
        </section>
      </main>
    </>
  );
}

function CrossStore({ base }: { base: string }) {
  const c = crossLink(base);
  // Plain <a> (full load) so crossing stores re-resolves the per-store theme —
  // the shared root layout would otherwise keep the current store's palette.
  return (
    <a
      href={c.href}
      className="text-base text-muted-foreground hover:text-foreground underline underline-offset-4"
    >
      or visit {c.label} →
    </a>
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
