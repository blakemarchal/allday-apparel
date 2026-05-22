import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@allday/db';
import { adminUser } from '@allday/db/schema';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Magic-link callback. Supabase redirects here with a `code` query param
 * after the user clicks the email link. We:
 *   1. Exchange the code for a session (sets auth cookies).
 *   2. If the authed user's email matches an admin_user row, patch in the
 *      supabase_user_id and flip status -> active. This is how an invited
 *      row becomes a usable admin login.
 *   3. Redirect to /admin (dashboard).
 *
 * If the email isn't in admin_user, the user lands at /admin and the
 * layout's auth check renders the "not authorized" view. The Supabase
 * auth user still exists; admin row can be added later without re-inviting.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/admin/login?error=no-code', req.url));
  }

  let supabase;
  try {
    supabase = await getSupabaseServerClient();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'auth-not-configured';
    return NextResponse.redirect(
      new URL(`/admin/login?error=${encodeURIComponent(msg)}`, req.url),
    );
  }

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(
        `/admin/login?error=${encodeURIComponent(error?.message ?? 'auth-failed')}`,
        req.url,
      ),
    );
  }

  // Bind Supabase user_id to the admin_user row (matched by lowercased email).
  // If no row exists, the user can still reach /admin — the layout decides
  // what to render. This keeps the "invite by inserting admin_user row" flow
  // simple: insert the row at any time, the next sign-in binds it.
  const email = data.user.email?.toLowerCase();
  if (email) {
    await db
      .update(adminUser)
      .set({
        supabaseUserId: data.user.id,
        status: 'active',
        lastSignInAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adminUser.email, email));
  }

  return NextResponse.redirect(new URL('/admin', req.url));
}
