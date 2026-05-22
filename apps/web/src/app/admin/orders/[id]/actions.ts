'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@allday/db';
import { order } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';

/**
 * Flip a paid order to fulfilled and stamp fulfilled_at.
 *
 * Guard:
 *   - Auth via requireAdmin (any admin can mark fulfilled — Will + wife + Blake).
 *   - WHERE status='paid' so double-submits / retries are no-ops.
 */
export async function markFulfilled(orderId: string): Promise<void> {
  await requireAdmin();
  await db
    .update(order)
    .set({ status: 'fulfilled', fulfilledAt: new Date() })
    .where(and(eq(order.id, orderId), eq(order.status, 'paid')));

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  revalidatePath('/admin');
}
