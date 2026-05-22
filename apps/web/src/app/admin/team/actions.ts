'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { adminUser } from '@allday/db/schema';
import { requireAdmin } from '@/lib/admin-user';

type Role = 'owner' | 'manager';
type Status = 'invited' | 'active' | 'disabled';

function err(msg: string): never {
  redirect(`/admin/team?error=${encodeURIComponent(msg)}`);
}

/**
 * Owner-only guard. Returns the owner row or redirects with an error.
 * We don't throw — managers reaching these actions get a polite
 * redirect rather than an error boundary.
 */
async function ensureOwner() {
  const me = await requireAdmin();
  if (me.role !== 'owner') err('Owner role required.');
  return me;
}

export async function inviteAdmin(formData: FormData): Promise<void> {
  await ensureOwner();

  const emailRaw = formData.get('email');
  if (typeof emailRaw !== 'string' || !emailRaw.includes('@')) {
    err('Valid email required.');
  }
  const email = (emailRaw as string).trim().toLowerCase();

  const role = formData.get('role');
  if (role !== 'owner' && role !== 'manager') err('Pick a role.');

  const nameRaw = formData.get('name');
  const name =
    typeof nameRaw === 'string' && nameRaw.trim().length > 0
      ? nameRaw.trim()
      : null;

  const me = await requireAdmin(); // for invited_by_id

  try {
    await db.insert(adminUser).values({
      email,
      name,
      role: role as Role,
      status: 'invited',
      invitedById: me.id,
    });
  } catch (e) {
    // Most likely the unique-email collision.
    const msg = e instanceof Error ? e.message : 'insert failed';
    if (msg.toLowerCase().includes('unique')) {
      err('That email is already on the team.');
    }
    err(msg.slice(0, 120));
  }

  revalidatePath('/admin/team');
  redirect('/admin/team?ok=1');
}

export async function setAdminRole(userId: string, role: Role): Promise<void> {
  const me = await ensureOwner();
  if (userId === me.id) err('Use a different account to change your own role.');

  await db
    .update(adminUser)
    .set({ role, updatedAt: new Date() })
    .where(eq(adminUser.id, userId));

  revalidatePath('/admin/team');
  redirect('/admin/team?ok=1');
}

export async function setAdminStatus(userId: string, status: Status): Promise<void> {
  const me = await ensureOwner();
  if (userId === me.id) err('You cannot change your own status.');

  await db
    .update(adminUser)
    .set({ status, updatedAt: new Date() })
    .where(eq(adminUser.id, userId));

  revalidatePath('/admin/team');
  redirect('/admin/team?ok=1');
}
