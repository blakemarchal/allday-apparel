'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@allday/db';
import { payoutAccrual, payoutDisbursement } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';

function err(msg: string): never {
  redirect(`/admin/payouts?error=${encodeURIComponent(msg)}`);
}

function dollarsToCents(value: FormDataEntryValue | null): number {
  if (value == null || value === '') throw new Error('missing');
  const n = Number.parseFloat(String(value));
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid');
  return Math.round(n * 100);
}

/**
 * Record a disbursement and optionally mark a set of accruals as paid
 * against it. Single SERIALIZABLE transaction so the disbursement row and
 * accrual updates land atomically.
 *
 * Discrepancy between sum-of-accruals and disbursement amount is allowed
 * (real payments include rounding / partial settlements); admin sees it
 * in the UI but the action doesn't enforce.
 */
export async function recordDisbursement(formData: FormData): Promise<void> {
  await requireAdmin();

  let amountCents: number;
  try {
    amountCents = dollarsToCents(formData.get('amountDollars'));
  } catch {
    err('Invalid amount.');
  }
  if (amountCents <= 0) err('Amount must be > 0.');

  const method = formData.get('method');
  if (typeof method !== 'string' || !method.trim()) err('Method required.');

  const reference = (formData.get('reference') as string | null)?.trim() || null;
  const notes = (formData.get('notes') as string | null)?.trim() || null;

  const paidAtStr = formData.get('paidAt');
  if (typeof paidAtStr !== 'string' || !paidAtStr) err('Paid date required.');
  const paidAt = new Date(paidAtStr + 'T12:00:00Z');
  if (Number.isNaN(paidAt.getTime())) err('Invalid paid date.');

  // Multiple "accrualIds" form values — getAll returns FormDataEntryValue[].
  const accrualIds = formData
    .getAll('accrualIds')
    .map((v) => String(v))
    .filter((v) => v.length > 0);

  await db.transaction(async (tx) => {
    const [disb] = await tx
      .insert(payoutDisbursement)
      .values({
        amountCents,
        method: (method as string).trim(),
        reference,
        paidAt,
        notes,
      })
      .returning({ id: payoutDisbursement.id });
    if (!disb) throw new Error('disbursement insert returned no row');

    if (accrualIds.length > 0) {
      // Only flip accruals currently in 'accrued' state — already-paid or
      // voided rows stay untouched. The WHERE makes this idempotent.
      await tx
        .update(payoutAccrual)
        .set({
          status: 'paid',
          disbursementId: disb.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(payoutAccrual.id, accrualIds),
            eq(payoutAccrual.status, 'accrued'),
          ),
        );
    }
  });

  revalidatePath('/admin/payouts');
  revalidatePath('/admin');
  redirect('/admin/payouts?ok=1');
}

/**
 * Void an accrual (typically because the order was refunded). Idempotent
 * on retry — WHERE status='accrued' makes a second call a no-op.
 */
export async function voidAccrual(accrualId: string): Promise<void> {
  await requireAdmin();

  await db
    .update(payoutAccrual)
    .set({
      status: 'voided',
      voidedReason: 'manual void by admin',
      updatedAt: new Date(),
    })
    .where(and(eq(payoutAccrual.id, accrualId), eq(payoutAccrual.status, 'accrued')));

  revalidatePath('/admin/payouts');
  revalidatePath('/admin');
}
