'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { drop, dropAllocation, variant, product } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';

type DropStatus = 'draft' | 'scheduled' | 'live' | 'ended';

function back(dropId: string, msg: string): never {
  redirect(`/admin/drops/${dropId}?error=${encodeURIComponent(msg)}`);
}

/**
 * Parse a `datetime-local` form value as UTC. The HTML widget submits
 * "2026-05-22T18:00" without timezone — we treat that string as UTC so the
 * stored time matches what admin typed.
 */
function parseDateTimeUtc(value: FormDataEntryValue | null): Date | null {
  if (value == null || value === '') return null;
  const str = String(value);
  // Append Z to force UTC.
  const d = new Date(`${str}:00Z`.replace(/(:\d\d):\d\dZ/, '$1Z'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function intOrNull(value: FormDataEntryValue | null): number | null {
  if (value == null || value === '') return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

// =============================================================================
// Drop basics
// =============================================================================

export async function updateDropBasics(dropId: string, formData: FormData): Promise<void> {
  await requireAdmin();

  const name = formData.get('name');
  const slug = formData.get('slug');
  if (typeof name !== 'string' || !name.trim()) back(dropId, 'Name required.');
  if (typeof slug !== 'string' || !/^[a-z0-9-]+$/.test(slug)) {
    back(dropId, 'Slug must be lowercase letters/numbers/hyphens.');
  }

  const startsAt = parseDateTimeUtc(formData.get('startsAt'));
  const endsAt = parseDateTimeUtc(formData.get('endsAt'));
  if (startsAt && endsAt && endsAt < startsAt) {
    back(dropId, 'End must be after start.');
  }

  const quantityCap = intOrNull(formData.get('quantityCap'));
  const perCustomerCap = intOrNull(formData.get('perCustomerCap'));

  try {
    await db
      .update(drop)
      .set({
        name: (name as string).trim(),
        slug: slug as string,
        startsAt,
        endsAt,
        quantityCap,
        perCustomerCap,
        updatedAt: new Date(),
      })
      .where(eq(drop.id, dropId));
  } catch (e) {
    back(dropId, e instanceof Error ? e.message.slice(0, 120) : 'update failed');
  }

  revalidatePath(`/admin/drops/${dropId}`);
  revalidatePath('/admin/drops');
}

export async function setDropStatus(dropId: string, status: DropStatus): Promise<void> {
  await requireAdmin();

  if (status === 'live') {
    // Must have at least one allocation.
    const [a] = await db
      .select({ variantId: dropAllocation.variantId })
      .from(dropAllocation)
      .where(eq(dropAllocation.dropId, dropId))
      .limit(1);
    if (!a) back(dropId, 'Add at least one variant before going live.');
  }

  if (status === 'scheduled') {
    // Must have starts_at set.
    const [d] = await db
      .select({ startsAt: drop.startsAt })
      .from(drop)
      .where(eq(drop.id, dropId))
      .limit(1);
    if (!d?.startsAt) back(dropId, 'Set a start time first.');
  }

  const patch: Record<string, unknown> = { status, updatedAt: new Date() };

  // Convenience: if flipping to live and starts_at is unset, stamp now.
  // Same for ended -> ends_at.
  if (status === 'live') {
    const [d] = await db
      .select({ startsAt: drop.startsAt })
      .from(drop)
      .where(eq(drop.id, dropId))
      .limit(1);
    if (!d?.startsAt) patch.startsAt = new Date();
  }
  if (status === 'ended') {
    const [d] = await db
      .select({ endsAt: drop.endsAt })
      .from(drop)
      .where(eq(drop.id, dropId))
      .limit(1);
    if (!d?.endsAt) patch.endsAt = new Date();
  }

  await db.update(drop).set(patch).where(eq(drop.id, dropId));

  revalidatePath(`/admin/drops/${dropId}`);
  revalidatePath('/admin/drops');
  revalidatePath('/admin');
}

// =============================================================================
// Allocations
// =============================================================================

export async function addAllocation(dropId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const variantId = formData.get('variantId');
  if (typeof variantId !== 'string' || !variantId) back(dropId, 'Pick a variant.');

  const allocatedQty = intOrNull(formData.get('allocatedQty'));

  // Verify variant belongs to this drop's storefront.
  const [check] = await db
    .select({ storefrontId: product.storefrontId, dropStorefrontId: drop.storefrontId })
    .from(variant)
    .innerJoin(product, eq(product.id, variant.productId))
    .innerJoin(drop, eq(drop.id, dropId))
    .where(eq(variant.id, variantId as string))
    .limit(1);
  if (!check) back(dropId, 'Variant not found.');
  if (check.storefrontId !== check.dropStorefrontId) {
    back(dropId, 'Variant belongs to a different storefront.');
  }

  try {
    await db.insert(dropAllocation).values({
      dropId,
      variantId: variantId as string,
      allocatedQty,
    });
  } catch (e) {
    // Likely PK collision — already in the drop.
    back(dropId, e instanceof Error ? 'Already in drop. ' + e.message.slice(0, 80) : 'add failed');
  }

  revalidatePath(`/admin/drops/${dropId}`);
}

export async function updateAllocation(
  dropId: string,
  variantId: string,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const allocatedQty = intOrNull(formData.get('allocatedQty'));

  await db
    .update(dropAllocation)
    .set({ allocatedQty })
    .where(
      and(eq(dropAllocation.dropId, dropId), eq(dropAllocation.variantId, variantId)),
    );

  revalidatePath(`/admin/drops/${dropId}`);
}

export async function removeAllocation(dropId: string, variantId: string): Promise<void> {
  await requireAdmin();

  await db
    .delete(dropAllocation)
    .where(
      and(eq(dropAllocation.dropId, dropId), eq(dropAllocation.variantId, variantId)),
    );

  revalidatePath(`/admin/drops/${dropId}`);
}
