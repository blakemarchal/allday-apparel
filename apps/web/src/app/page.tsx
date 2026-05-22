import { getCurrentStorefront, isAdminRequest } from '@/lib/storefront';
import Link from 'next/link';

// Server Component — runs in Node, can query Postgres directly.
export default async function HomePage() {
  // Admin subdomain hits the admin landing instead of the storefront landing.
  if (await isAdminRequest()) {
    return <AdminLanding />;
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
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.5rem' }}>
      <p style={{ fontSize: '0.85rem', color: '#888', margin: 0 }}>
        {storefront.hostname} → <code>{storefront.slug}</code>
      </p>
      <h1 style={{ fontSize: '2.5rem', margin: '0.25rem 0 1rem' }}>
        Welcome to {storefront.name}.
      </h1>
      <p style={{ color: '#444' }}>
        Catalog coming soon. Currency: {storefront.currency}.
      </p>
    </main>
  );
}

function AdminLanding() {
  return (
    <main style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1>Allday Merch — Admin</h1>
      <p>Sign in placeholder. Supabase auth lands with task #10.</p>
      <p>
        <Link href="/healthz">/healthz</Link>
      </p>
    </main>
  );
}

function UnconfiguredHost() {
  return (
    <main style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1>Storefront not configured</h1>
      <p>
        No <code>storefront_host</code> row matches this hostname. Seed the dev
        hosts with <code>pnpm seed</code> (coming with task #12) or insert a row
        manually:
      </p>
      <pre style={{ background: '#f4f4f4', padding: '1rem', overflow: 'auto' }}>
        {`INSERT INTO storefront (slug, name) VALUES ('apparel', 'Allday Apparel') RETURNING id;
INSERT INTO storefront_host (storefront_id, hostname, is_primary)
  VALUES ('<id-from-above>', 'apparel.localhost', true);`}
      </pre>
    </main>
  );
}
