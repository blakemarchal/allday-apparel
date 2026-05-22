'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { variant } from '@allday/db/schema';
import { addToCart } from '@/lib/cart';

/**
 * Add a variant to the cart. Returns `{ error }` instead of throwing so the
 * client component can render the message inline (matches useTransition's
 * client-side flow).
 *
 * Validation:
 *   - Variant must exist.
 *   - Variant must be published. Defensive: also rejects archived/draft so a
 *     PDP that's stale doesn't push a defunct row into the cart.
 */
export async function addToCartAction(
  variantId: string,
): Promise<{ error?: string } | undefined> {
  const [v] = await db
    .select({ id: variant.id, status: variant.status })
    .from(variant)
    .where(eq(variant.id, variantId))
    .limit(1);

  if (!v) return { error: 'Variant no longer exists.' };
  if (v.status !== 'published') return { error: 'Variant is no longer available.' };

  await addToCart(variantId, 1);
  revalidatePath('/cart');
  revalidatePath('/products/[slug]', 'page');
  return undefined;
}
