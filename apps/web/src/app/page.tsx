import { getCurrentStorefront, isAdminRequest } from '@/lib/storefront';
import Link from 'next/link';

// Server Component — runs in Node, can query Postgres directly. Visual
// tokens come from the theme system in layout.tsx; this file uses
// var(--token-name) instead of hardcoding hex values, so the two stores
// look distinct without conditional code.
export default async function HomePage() {
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
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--color-muted-fg)',
          margin: 0,
        }}
      >
        {storefront.hostname} → <code>{storefront.slug}</code>
      </p>
      <h1 style={{ fontSize: '2.75rem', margin: '0.25rem 0 1rem' }}>
        Welcome to {storefront.name}.
      </h1>
      <p style={{ opacity: 0.75 }}>
        Catalog coming soon. Currency: {storefront.currency}.
      </p>
      <div style={{ marginTop: '2rem', display: 'flex', gap: '0.75rem' }}>
        <button type="button">Browse the drop →</button>
        <button
          type="button"
          style={{
            background: 'transparent',
            color: 'var(--color-foreground)',
            border: '1px solid var(--color-border)',
          }}
        >
          Join the list
        </button>
      </div>
    </main>
  );
}

function AdminLanding() {
  return (
    <main style={{ maxWidth: 480, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
        Allday Merch — Admin
      </h1>
      <p style={{ opacity: 0.75 }}>
        Sign in placeholder. Supabase auth lands with task #10.
      </p>
      <p style={{ marginTop: '1.5rem' }}>
        <Link
          href="/healthz"
          style={{
            color: 'var(--color-primary)',
            textDecoration: 'underline',
          }}
        >
          /healthz
        </Link>
      </p>
    </main>
  );
}

function UnconfiguredHost() {
  return (
    <main style={{ maxWidth: 560, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
        Storefront not configured
      </h1>
      <p>
        No <code>storefront_host</code> row matches this hostname. Seed the dev
        hosts with <code>pnpm seed</code> (coming with task #12) or insert a
        row manually:
      </p>
      <pre>
        {`INSERT INTO storefront (slug, name) VALUES ('apparel', 'Allday Apparel') RETURNING id;
INSERT INTO storefront_host (storefront_id, hostname, is_primary)
  VALUES ('<id-from-above>', 'apparel.localhost', true);`}
      </pre>
    </main>
  );
}
