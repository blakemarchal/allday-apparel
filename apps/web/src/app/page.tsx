import { redirect } from 'next/navigation';
import { getCurrentStorefront, isAdminRequest } from '@/lib/storefront';

// Server Component — runs in Node, can query Postgres directly.
// Visual tokens come from layout.tsx + the theme system; this file uses
// `var(--token-name)` / Tailwind classes mapped to those tokens, so the
// two storefronts look distinct without conditional code.
export default async function HomePage() {
  // Admin subdomain has its own route tree under /admin. Bounce there.
  if (await isAdminRequest()) {
    redirect('/admin');
  }

  const storefront = await getCurrentStorefront();
  if (!storefront) {
    return <UnconfiguredHost />;
  }

  return <StorefrontLanding storefront={storefront} />;
}

function StorefrontLanding({
  storefront,
}: {
  storefront: NonNullable<Awaited<ReturnType<typeof getCurrentStorefront>>>;
}) {
  return (
    <main className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-sm text-muted-foreground">
        {storefront.hostname} → <code>{storefront.slug}</code>
      </p>
      <h1 className="text-5xl font-heading font-bold mt-1 mb-4">
        Welcome to {storefront.name}.
      </h1>
      <p className="opacity-75">
        Catalog coming soon. Currency: {storefront.currency}.
      </p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          className="bg-primary text-primary-foreground rounded px-6 py-3 font-medium hover:opacity-90"
        >
          Browse the drop →
        </button>
        <button
          type="button"
          className="border border-border rounded px-6 py-3 font-medium hover:bg-muted"
        >
          Join the list
        </button>
      </div>
    </main>
  );
}

function UnconfiguredHost() {
  return (
    <main className="max-w-xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold mb-4">Storefront not configured</h1>
      <p>
        No <code>storefront_host</code> row matches this hostname. Seed the dev
        hosts with <code>pnpm seed</code> (coming with task #12) or insert a
        row manually:
      </p>
      <pre>{`INSERT INTO storefront (slug, name) VALUES ('apparel', 'Allday Apparel') RETURNING id;
INSERT INTO storefront_host (storefront_id, hostname, is_primary)
  VALUES ('<id-from-above>', 'apparel.localhost', true);`}</pre>
    </main>
  );
}
