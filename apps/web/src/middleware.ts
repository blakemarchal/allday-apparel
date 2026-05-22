import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Runs on every non-static request. Responsible for keeping the Supabase
 * session refreshed across requests — without this, Server-Component-side
 * auth checks re-refresh on every page load (functional but wasteful).
 */
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and the Stripe webhook (which needs the raw body
    // unmodified for signature verification).
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook).*)',
  ],
};
