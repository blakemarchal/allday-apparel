import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { productStatusEnum, variantStatusEnum } from './enums';
import { storefront } from './storefront';
import { invoiceUpload } from './invoice';

export const product = pgTable(
  'product',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storefrontId: uuid('storefront_id')
      .notNull()
      .references(() => storefront.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    // Primary product image. Demo phase: a committed /demo/*.jpg path. Later:
    // a Cloudflare R2 URL once the upload pipeline lands. NULL → branded
    // placeholder tile in the UI.
    imageUrl: text('image_url'),
    status: productStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_storefront_slug_unique').on(t.storefrontId, t.slug),
    index('product_storefront_status_idx').on(t.storefrontId, t.status),
  ],
);

// Option dimensions on a product (e.g. "Size", "Color"). Multiple per product.
export const productOption = pgTable('product_option', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => product.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
});

// Allowed values for an option (e.g. "S", "M", "L" for Size).
export const productOptionValue = pgTable(
  'product_option_value',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productOptionId: uuid('product_option_id')
      .notNull()
      .references(() => productOption.id, { onDelete: 'cascade' }),
    value: text('value').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [uniqueIndex('product_option_value_option_value_unique').on(t.productOptionId, t.value)],
);

// A specific combination of option values, with its own SKU/price/Stripe linkage.
export const variant = pgTable(
  'variant',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => product.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    priceCents: integer('price_cents').notNull(),
    weightGrams: integer('weight_grams'),

    // Current unit cost (manually maintained; admin suggests value from latest stock_receipt).
    // Snapshotted to order_line_item.unit_cost_cents_snapshot at sale time.
    costCents: integer('cost_cents'),

    stripeProductId: text('stripe_product_id'),
    stripePriceId: text('stripe_price_id'),
    status: variantStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('variant_product_sku_unique').on(t.productId, t.sku),
    index('variant_product_status_idx').on(t.productId, t.status),
    index('variant_stripe_price_idx').on(t.stripePriceId),
  ],
);

// Join table: which option values define a variant.
export const variantOptionValue = pgTable(
  'variant_option_value',
  {
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variant.id, { onDelete: 'cascade' }),
    productOptionValueId: uuid('product_option_value_id')
      .notNull()
      .references(() => productOptionValue.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.variantId, t.productOptionValueId] })],
);

// One row per variant. Reservation math lives here.
// Available stock = qty_on_hand - qty_reserved.
export const inventoryItem = pgTable(
  'inventory_item',
  {
    variantId: uuid('variant_id')
      .primaryKey()
      .references(() => variant.id, { onDelete: 'cascade' }),
    qtyOnHand: integer('qty_on_hand').notNull().default(0),
    qtyReserved: integer('qty_reserved').notNull().default(0),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('qty_on_hand_non_negative', sql`${t.qtyOnHand} >= 0`),
    check('qty_reserved_non_negative', sql`${t.qtyReserved} >= 0`),
    check('qty_reserved_lte_on_hand', sql`${t.qtyReserved} <= ${t.qtyOnHand}`),
  ],
);

// Inventory investment log. One row per batch of units received.
// Source of truth for "total invested" reporting and for suggested cost on the variant.
// Inserting a row increments inventory_item.qty_on_hand (handled in app code, same tx).
export const stockReceipt = pgTable(
  'stock_receipt',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variant.id, { onDelete: 'restrict' }),
    qtyReceived: integer('qty_received').notNull(),
    unitCostCents: integer('unit_cost_cents').notNull(),
    // total_cost_cents may differ from qty * unit_cost if freight/duty is included.
    totalCostCents: integer('total_cost_cents').notNull(),
    vendor: text('vendor'),
    reference: text('reference'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    notes: text('notes'),

    // If created via OCR pipeline, points to the source invoice.
    sourceInvoiceUploadId: uuid('source_invoice_upload_id').references(() => invoiceUpload.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_receipt_variant_received_at_idx').on(t.variantId, t.receivedAt),
    index('stock_receipt_invoice_upload_idx').on(t.sourceInvoiceUploadId),
    check('qty_received_positive', sql`${t.qtyReceived} > 0`),
  ],
);
