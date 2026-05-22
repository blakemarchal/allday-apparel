import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentStorefront } from '@/lib/storefront';
import { cartItemCount } from '@/lib/cart';
import { StorefrontHeader } from '@/components/storefront/Header';

type SearchParams = Promise<{ session_id?: string }>;

export default async function CheckoutSuccess({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const storefront = await getCurrentStorefront();
  if (!storefront) notFound();

  const { session_id: sessionId } = await searchParams;
  const cartCount = await cartItemCount();

  return (
    <>
      <StorefrontHeader storefront={storefront} cartCount={cartCount} />
      <main className="max-w-md mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-heading font-bold">Thanks — you&apos;re set.</h1>
        <p className="mt-3 text-muted-foreground">
          Your payment went through. A confirmation email is on the way once
          the order finishes processing (usually a few seconds).
        </p>
        {sessionId && (
          <p className="mt-4 text-xs text-muted-foreground font-mono break-all">
            Reference: {sessionId}
          </p>
        )}
        <Link
          href="/products"
          className="inline-block mt-8 bg-primary text-primary-foreground rounded px-5 py-2.5 font-medium hover:opacity-90"
        >
          Keep shopping
        </Link>
      </main>
    </>
  );
}
