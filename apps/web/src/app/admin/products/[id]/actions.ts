'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { product, variant, inventoryItem } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';

type ProductStatus = 'draft' | 'published' | 'archived';

function back(productId: string, msg: string): never {
  redirect(`/admin/products/${productId}?error=${encodeURIComponent(msg)}`);
}

/** Convert a dollars form value (e.g. "30.00") to cents int. Throws on NaN. */
function dollarsToCents(value: FormDataEntryValue | null): number {
  if (value == null || value === '') throw new Error('missing');
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid amount');
  return Math.round(n * 100);
}

function dollarsToCentsOptional(value: FormDataEntryValue | null): number | null {
  if (value == null || value === '') return null;
  return dollarsToCents(value);
}

function intOrNull(value: FormDataEntryValue | null): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

// =============================================================================
// Product-level
// =============================================================================

export async function updateProduct(productId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const title = formData.get('title');
  const slug = formData.get('slug');
  const description = formData.get('description');

  if (typeof title !== 'string' || !title.trim()) back(productId, 'Title required.');
  if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    back(productId, 'Slug must be lowercase letters/numbers/hyphens.');
  }

  try {
    await db
      .update(product)
      .set({
        title: (title as string).trim(),
        slug: slug as string,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        updatedAt: new Date(),
      })
      .where(eq(product.id, productId));
  } catch (e) {
    back(productId, e instanceof Error ? e.message.slice(0, 120) : 'update failed');
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath('/admin/products');
}

export async function setProductStatus(
  productId: string,
  status: ProductStatus,
): Promise<void> {
  await requireAdmin();

  // Guard: publishing requires at least one variant.
  if (status === 'published') {
    const variants = await db
      .select({ id: variant.id })
      .from(variant)
      .where(eq(variant.productId, productId))
      .limit(1);
    if (variants.length === 0) back(productId, 'Add at least one variant before publishing.');
  }

  await db
    .update(product)
    .set({ status, updatedAt: new Date() })
    .where(eq(product.id, productId));

  // If publishing variants alongside, flip them too. Variant.status is
  // independent so admins can stage some variants as draft inside a published
  // product, but the common case is "publish all together".
  if (status === 'published') {
    await db
      .update(variant)
      .set({ status: 'published', updatedAt: new Date() })
      .where(and(eq(variant.productId, productId), eq(variant.status, 'draft')));
  } else if (status === 'archived') {
    await db
      .update(variant)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(variant.productId, productId));
  }

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath('/admin/products');
  revalidatePath('/admin');
}

// =============================================================================
// Variant-level
// =============================================================================

export async function addVariant(productId: string, formData: FormData): Promise<void> {
  await requireAdmin();

  const sku = formData.get('sku');
  if (typeof sku !== 'string' || !sku.trim()) back(productId, 'SKU required.');

  let priceCents: number;
  try {
    priceCents = dollarsToCents(formData.get('priceDollars'));
  } catch {
    back(productId, 'Invalid price.');
  }

  let costCents: number | null;
  try {
    costCents = dollarsToCentsOptional(formData.get('costDollars'));
  } catch {
    back(productId, 'Invalid cost.');
  }

  const weightGrams = intOrNull(formData.get('weightGrams'));

  try {
    const [v] = await db
      .insert(variant)
      .values({
        productId,
        sku: (sku as string).trim(),
        priceCents,
        costCents,
        weightGrams,
        status: 'draft', // promoted to published when the product is published
      })
      .returning({ id: variant.id });
    if (!v) throw new Error('variant insert returned no row');

    // Initialize inventory at 0; stock_receipt entries bump qty_on_hand later.
    await db.insert(inventoryItem).values({
      variantId: v.id,
      qtyOnHand: 0,
      qtyReserved: 0,
      lowStockThreshold: 0,
    });
  } catch (e) {
    back(productId, e instanceof Error ? e.message.slice(0, 120) : 'add failed');
  }

  revalidatePath(`/admin/products/${productId}`);
}

export async function updateVariant(
  productId: string,
  variantId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();

  const sku = formData.get('sku');
  if (typeof sku !== 'string' || !sku.trim()) back(productId, 'SKU required.');

  let priceCents: number;
  try {
    priceCents = dollarsToCents(formData.get('priceDollars'));
  } catch {
    back(productId, 'Invalid price.');
  }

  let costCents: number | null;
  try {
    costCents = dollarsToCentsOptional(formData.get('costDollars'));
  } catch {
    back(productId, 'Invalid cost.');
  }

  const weightGrams = intOrNull(formData.get('weightGrams'));

  try {
    await db
      .update(variant)
      .set({
        sku: (sku as string).trim(),
        priceCents,
        costCents,
        weightGrams,
        updatedAt: new Date(),
      })
      .where(and(eq(variant.id, variantId), eq(variant.productId, productId)));
  } catch (e) {
    back(productId, e instanceof Error ? e.message.slice(0, 120) : 'update failed');
  }

  revalidatePath(`/admin/products/${productId}`);
}

export async function deleteVariant(
  productId: string,
  variantId: string,
): Promise<void> {
  await requireAdmin();

  // FK from order_line_item.variant_id is ON DELETE restrict — if any
  // historical order references this variant, the delete fails. That's the
  // right behavior. We surface the failure to the admin.
  try {
    // Inventory + variant_option_value rows cascade.
    await db.delete(variant).where(and(eq(variant.id, variantId), eq(variant.productId, productId)));
  } catch (e) {
    back(
      productId,
      e instanceof Error
        ? 'Variant has order history — archive instead. ' + e.message.slice(0, 80)
        : 'delete failed',
    );
  }

  revalidatePath(`/admin/products/${productId}`);
}
