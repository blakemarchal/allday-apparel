import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdminRequest } from '@/lib/storefront';
import { currentAdminUser } from '@/lib/admin-user';

/**
 * Admin chrome — header + (when authed) bottom nav. Phone-first layout.
 *
 * Auth gate strategy:
 *   - Hostname check enforced here (admin pages only accessible via the
 *     admin.* subdomain).
 *   - Per-page `requireAdmin()` redirects unauthed users to /admin/login.
 *     Layout itself doesn't redirect — that would loop on the login page.
 *   - When authed, the layout knows it (via currentAdminUser) and shows
 *     the full nav. When unauthed, only the header is rendered.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdminRequest())) {
    redirect('/');
  }

  const me = await currentAdminUser();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <Link href="/admin" className="flex items-baseline gap-2">
          <span className="font-heading font-bold text-lg">Allday Merch</span>
          <span className="text-xs text-muted-foreground uppercase tracking-wide">Admin</span>
        </Link>
        {me ? (
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{me.name ?? me.email.split('@')[0]}</span>
            <span className="ml-2 capitalize">· {me.role}</span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Not signed in</div>
        )}
      </header>

      <main className="flex-1 px-4 py-6 pb-24">{children}</main>

      {me && <AdminBottomNav />}
    </div>
  );
}

function AdminBottomNav() {
  const items = [
    { href: '/admin', label: 'Home' },
    { href: '/admin/orders', label: 'Orders' },
    { href: '/admin/products', label: 'Products' },
    { href: '/admin/drops', label: 'Drops' },
    { href: '/admin/stock', label: 'Stock' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-background grid grid-cols-5">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center justify-center py-3 text-xs text-muted-foreground hover:text-foreground active:bg-muted"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
