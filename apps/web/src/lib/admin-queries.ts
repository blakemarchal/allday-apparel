import 'server-only';
import { eq, and, gte, sum, count, sql } from 'drizzle-orm';
import { db } from '@allday/db';
import { order, inventoryItem, drop, payoutAccrual } from '@allday/db/schema';

/**
 * Dashboard top-of-page stats. All four cards in one round-trip-friendly
 * function — Drizzle issues four separate queries but a single Server
 * Component await covers them.
 */
export async function dashboardStats(): Promise<{
  todayOrders: number;
  lowStock: number;
  dropsLive: number;
  owedCents: number;
}> {
  // "Today" in UTC. Swap for a business timezone when Will's location matters
  // (he travels; probably want America/Los_Angeles or similar).
  const startOfUtcToday = new Date();
  startOfUtcToday.setUTCHours(0, 0, 0, 0);

  const [todayOrdersRow] = await db
    .select({ count: count() })
    .from(order)
    .where(and(eq(order.status, 'paid'), gte(order.paidAt, startOfUtcToday)));

  const [lowStockRow] = await db
    .select({ count: count() })
    .from(inventoryItem)
    .where(
      and(
        sql`${inventoryItem.lowStockThreshold} > 0`,
        sql`${inventoryItem.qtyOnHand} <= ${inventoryItem.lowStockThreshold}`,
      ),
    );

  const [dropsLiveRow] = await db
    .select({ count: count() })
    .from(drop)
    .where(eq(drop.status, 'live'));

  const [owedRow] = await db
    .select({ owedCents: sum(payoutAccrual.amountCents) })
    .from(payoutAccrual)
    .where(eq(payoutAccrual.status, 'accrued'));

  return {
    todayOrders: Number(todayOrdersRow?.count ?? 0),
    lowStock: Number(lowStockRow?.count ?? 0),
    dropsLive: Number(dropsLiveRow?.count ?? 0),
    // sum() returns numeric/string; coerce.
    owedCents: Number(owedRow?.owedCents ?? 0),
  };
}
