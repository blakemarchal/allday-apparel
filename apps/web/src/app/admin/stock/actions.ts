'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db } from '@allday/db';
import { stockReceipt, inventoryItem, variant } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';

function err(msg: string): never {
  redirect(`/admin/stock?error=${encodeURIComponent(msg)}`);
}

function dollarsToCents(value: FormDataEntryValue | null): number {
  if (value == null || value === '') throw new Error('missing');
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid');
  return Math.round(n * 100);
}

/**
 * Log a stock receipt and increment inventory in a single transaction.
 * Optionally apply the unit cost to the variant going forward (default-on
 * checkbox in the form — Will/admin almost always wants this).
 */
export async function addStockReceipt(formData: FormData): Promise<void> {
  await requireAdmin();

  const variantId = formData.get('variantId');
  if (typeof variantId !== 'string' || !variantId) err('Pick a variant.');

  const qtyReceivedRaw = formData.get('qtyReceived');
  if (typeof qtyReceivedRaw !== 'string') err('Qty required.');
  const qtyReceived = Number.parseInt(qtyReceivedRaw, 10);
  if (!Number.isFinite(qtyReceived) || qtyReceived <= 0) err('Qty must be > 0.');

  let unitCostCents: number;
  try {
    unitCostCents = dollarsToCents(formData.get('unitCostDollars'));
  } catch {
    err('Invalid unit cost.');
  }

  // Total cost defaults to qty * unit_cost; admin overrides for freight/duty.
  let totalCostCents: number;
  const totalRaw = formData.get('totalCostDollars');
  if (totalRaw && String(totalRaw).trim() !== '') {
    try {
      totalCostCents = dollarsToCents(totalRaw);
    } catch {
      err('Invalid total cost.');
    }
  } else {
    totalCostCents = qtyReceived * unitCostCents;
  }

  const vendor = (formData.get('vendor') as string | null)?.trim() || null;
  const reference = (formData.get('reference') as string | null)?.trim() || null;
  const notes = (formData.get('notes') as string | null)?.trim() || null;

  const receivedAtStr = formData.get('receivedAt');
  if (typeof receivedAtStr !== 'string' || !receivedAtStr) err('Received date required.');
  const receivedAt = new Date(receivedAtStr + 'T12:00:00Z'); // midday UTC to avoid TZ edge cases
  if (Number.isNaN(receivedAt.getTime())) err('Invalid received date.');

  const applyCost = formData.get('applyCost') === '1';

  await db.transaction(async (tx) => {
    // Verify variant exists.
    const [v] = await tx
      .select({ id: variant.id })
      .from(variant)
      .where(eq(variant.id, variantId as string))
      .limit(1);
    if (!v) throw new Error('variant not found');

    await tx.insert(stockReceipt).values({
      variantId: variantId as string,
      qtyReceived,
      unitCostCents,
      totalCostCents,
      vendor,
      reference,
      receivedAt,
      notes,
    });

    // Ensure an inventory_item row exists. It SHOULD already, since
    // addVariant creates one — but be defensive against historical data.
    const [inv] = await tx
      .select({ variantId: inventoryItem.variantId })
      .from(inventoryItem)
      .where(eq(inventoryItem.variantId, variantId as string))
      .limit(1);

    if (inv) {
      await tx
        .update(inventoryItem)
        .set({
          qtyOnHand: sql`${inventoryItem.qtyOnHand} + ${qtyReceived}`,
          updatedAt: new Date(),
        })
        .where(eq(inventoryItem.variantId, variantId as string));
    } else {
      await tx.insert(inventoryItem).values({
        variantId: variantId as string,
        qtyOnHand: qtyReceived,
        qtyReserved: 0,
        lowStockThreshold: 0,
      });
    }

    if (applyCost) {
      await tx
        .update(variant)
        .set({ costCents: unitCostCents, updatedAt: new Date() })
        .where(eq(variant.id, variantId as string));
    }
  });

  revalidatePath('/admin/stock');
  revalidatePath('/admin');
  redirect('/admin/stock?ok=1');
}

/**
 * One-tap "apply this receipt cost to the variant going forward."
 * Called from the receipt list when variant.cost_cents != receipt.unit_cost_cents.
 */
export async function applyCostToVariant(
  variantId: string,
  costCents: number,
): Promise<void> {
  await requireAdmin();
  await db
    .update(variant)
    .set({ costCents, updatedAt: new Date() })
    .where(eq(variant.id, variantId));

  revalidatePath('/admin/stock');
}
