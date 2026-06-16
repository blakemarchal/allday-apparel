import { redirect } from 'next/navigation';
import { isAdminRequest } from '@/lib/storefront';
import StorefrontLanding from '@/components/storefront/views/StorefrontLanding';

// Apex root. Admin subdomain bounces to /admin; otherwise the apparel landing
// (StorefrontLanding resolves the storefront from host + path).
export default async function HomePage() {
  if (await isAdminRequest()) redirect('/admin');
  return <StorefrontLanding />;
}
