import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { product, variant, inventoryItem } from '@allday/db/schema';
import { getCurrentStorefront } from '@/lib/storefront';
import { cartItemCount } from '@/lib/cart';
import { StorefrontHeader } from '@/components/storefront/Header';
import { PdpAddToCart } from '@/components/storefront/PdpAddToCart';

type Params = Promise<{ slug: string }>;

export default async function PdpPage({ params }: { params: Params }) {
  const storefront = await getCurrentStorefront();
  if (!storefront) notFound();
  const base = storefront.basePath;
  const { slug } = await params;

  const [p] = await db
    .select({ id: product.id, title: product.title, description: product.description })
    .from(product)
    .where(
      and(
        eq(product.storefrontId, storefront.id),
        eq(product.slug, slug),
        eq(product.status, 'published'),
      ),
    )
    .limit(1);

  if (!p) notFound();

  const variants = await db
    .select({
      id: variant.id,
      sku: variant.sku,
      priceCents: variant.priceCents,
      qtyOnHand: inventoryItem.qtyOnHand,
      qtyReserved: inventoryItem.qtyReserved,
    })
    .from(variant)
    .leftJoin(inventoryItem, eq(inventoryItem.variantId, variant.id))
    .where(and(eq(variant.productId, p.id), eq(variant.status, 'published')))
    .orderBy(asc(variant.sku));

  const variantsForClient = variants.map((v) => ({
    id: v.id,
    sku: v.sku,
    priceCents: v.priceCents,
    available: Math.max(0, (v.qtyOnHand ?? 0) - (v.qtyReserved ?? 0)),
  }));

  const cartCount = await cartItemCount(storefront.id);

  return (
    <>
      <StorefrontHeader storefront={storefront} cartCount={cartCount} />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-sm text-muted-foreground mb-2">
          <Link href={`${base}/products`} className="hover:underline">
            ← Shop
          </Link>
        </p>
        <h1 className="text-4xl font-heading font-bold">{p.title}</h1>
        {p.description && <p className="mt-3 text-muted-foreground whitespace-pre-wrap">{p.description}</p>}
        <div className="mt-6">
          {variantsForClient.length === 0 ? (
            <p className="text-muted-foreground">Out of stock.</p>
          ) : (
            <PdpAddToCart
              storefrontId={storefront.id}
              basePath={base}
              variants={variantsForClient}
              currency={storefront.currency}
            />
          )}
        </div>
      </main>
    </>
  );
}
