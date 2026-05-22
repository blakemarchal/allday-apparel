import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Tenancy anchor. Two rows at launch (apparel, character).
export const storefront = pgTable(
  'storefront',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('USD'),
    freeShippingThresholdCents: integer('free_shipping_threshold_cents'),
    flatShippingCents: integer('flat_shipping_cents'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('storefront_slug_unique').on(t.slug)],
);

// Hostname → storefront routing. Lets us flip subdomain ↔ custom domain
// without a code change (row insert + DNS).
export const storefrontHost = pgTable(
  'storefront_host',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storefrontId: uuid('storefront_id')
      .notNull()
      .references(() => storefront.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('storefront_host_hostname_unique').on(t.hostname)],
);

// Per-storefront theme tokens + landing content.
export const themeConfig = pgTable('theme_config', {
  storefrontId: uuid('storefront_id')
    .primaryKey()
    .references(() => storefront.id, { onDelete: 'cascade' }),
  tokens: jsonb('tokens').notNull().default({}),
  landing: jsonb('landing').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
