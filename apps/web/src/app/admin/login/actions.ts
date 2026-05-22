'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Send a magic-link sign-in email to the given address. We don't pre-check
 * that the email is in admin_user — Supabase will create an auth user for
 * any address, but the admin/layout guard rejects users who aren't in the
 * admin_user table. Result: an invite-only-by-DB-row pattern.
 */
export async function sendMagicLink(formData: FormData): Promise<void> {
  const email = formData.get('email');
  if (typeof email !== 'string' || !email.includes('@')) {
    redirect('/admin/login?error=invalid-email');
  }

  // Build the absolute callback URL from the current request's host.
  const hdrs = await headers();
  const host = hdrs.get('host') ?? 'admin.localhost:3001';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `${protocol}://${host}`;

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: (email as string).toLowerCase(),
      options: {
        emailRedirectTo: `${siteUrl}/admin/auth/callback`,
      },
    });
    if (error) {
      redirect(`/admin/login?error=${encodeURIComponent(error.message)}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'auth-not-configured';
    redirect(`/admin/login?error=${encodeURIComponent(msg)}`);
  }

  redirect('/admin/login?sent=1');
}
