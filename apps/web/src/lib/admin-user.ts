import 'server-only';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { adminUser } from '@allday/db/schema';
import { getSupabaseServerClient } from './supabase/server';

export type AdminUser = typeof adminUser.$inferSelect;

/**
 * Resolve the currently authed admin user for this request, or null if:
 *   - Supabase env isn't configured yet (early dev),
 *   - the user has no session,
 *   - the user has a session but no admin_user row (not invited),
 *   - the admin_user row is disabled.
 */
export async function currentAdminUser(): Promise<AdminUser | null> {
  let supabaseUserId: string | undefined;
  try {
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    supabaseUserId = data.user?.id;
  } catch {
    // Env not configured yet — treat as unauthed.
    return null;
  }
  if (!supabaseUserId) return null;

  const [row] = await db
    .select()
    .from(adminUser)
    .where(eq(adminUser.supabaseUserId, supabaseUserId))
    .limit(1);

  if (!row) return null;
  if (row.status === 'disabled') return null;
  return row;
}

/**
 * Require an authed admin. Redirects to /admin/login if not signed in.
 * Call at the top of any protected admin page.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const user = await currentAdminUser();
  if (!user) redirect('/admin/login');
  return user;
}

/**
 * Require the owner role specifically (governance: invite/remove admins,
 * payout-rate changes, disbursement entry). Manager gets a 403 page.
 */
export async function requireOwner(): Promise<AdminUser> {
  const user = await requireAdmin();
  if (user.role !== 'owner') {
    // Throw rather than redirect — surfaces the access denial clearly in
    // server logs. Wrap in a Next.js error boundary when admin UI matures.
    throw new Error('Forbidden: owner role required');
  }
  return user;
}
