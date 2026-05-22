import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { dropStatusEnum } from './enums';
import { storefront } from './storefront';
import { variant } from './product';

// A limited release with optional time-window and/or quantity cap.
// State transitions (scheduled → live → ended) driven by a queued scheduler.
export const drop = pgTable(
  'drop',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storefrontId: uuid('storefront_id')
      .notNull()
      .references(() => storefront.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    quantityCap: integer('quantity_cap'),
    perCustomerCap: integer('per_customer_cap'),
    status: dropStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('drop_storefront_slug_unique').on(t.storefrontId, t.slug),
    index('drop_storefront_status_idx').on(t.storefrontId, t.status),
    index('drop_starts_at_idx').on(t.startsAt),
  ],
);

// Which variants are in a drop. allocated_qty NULL = use full variant inventory.
export const dropAllocation = pgTable(
  'drop_allocation',
  {
    dropId: uuid('drop_id')
      .notNull()
      .references(() => drop.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variant.id, { onDelete: 'restrict' }),
    allocatedQty: integer('allocated_qty'),
  },
  (t) => [primaryKey({ columns: [t.dropId, t.variantId] })],
);
