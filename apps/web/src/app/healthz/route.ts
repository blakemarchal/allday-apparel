import { NextResponse } from 'next/server';
import { db } from '@allday/db';
import { sql } from 'drizzle-orm';

// Always evaluated at request time — health checks shouldn't be cached, and
// the DB call must not run at build time.
export const dynamic = 'force-dynamic';

// Health check. Verifies process is up AND DB is reachable.
// Used by Caddy/load balancer/operator smoke tests.
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: 'ok', db: 'reachable' });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'degraded',
        db: 'unreachable',
        error: err instanceof Error ? err.message : 'unknown error',
      },
      { status: 503 },
    );
  }
}
