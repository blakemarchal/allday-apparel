import { pgTable, uuid, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { emailSubscriberSourceEnum } from './enums';
import { storefront } from './storefront';

// Per-storefront fan email list for drop announcements + marketing blasts.
// Double opt-in: confirmed_at is null until they click the opt-in link.
// CAN-SPAM compliant: every marketing email carries an unsubscribe_token link.
//
// We do NOT delete unsubscribed rows — we set unsubscribed_at instead, which:
//   1. Preserves audit trail
//   2. Prevents accidental re-subscription via stale popup state
//   3. Lets admin see lifetime list size vs active size
export const emailSubscriber = pgTable(
  'email_subscriber',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storefrontId: uuid('storefront_id')
      .notNull()
      .references(() => storefront.id, { onDelete: 'cascade' }),

    // Stored lowercased. App code normalizes on insert.
    email: text('email').notNull(),

    source: emailSubscriberSourceEnum('source').notNull(),

    // Double opt-in: until confirmed_at is set, no marketing sends are allowed.
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    // Single-use token in the opt-in email link; cleared after confirmation.
    confirmToken: text('confirm_token'),

    // Stable token used in every marketing email's unsubscribe link.
    unsubscribeToken: text('unsubscribe_token').notNull(),

    // If non-null, treat as opted-out. Row is preserved (never deleted).
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Upsert key. Per-storefront lists are independent.
    uniqueIndex('email_subscriber_storefront_email_unique').on(t.storefrontId, t.email),
    // "Active subscribers" segment for drop blasts (partial index).
    index('email_subscriber_active_idx')
      .on(t.storefrontId)
      .where(sql`confirmed_at IS NOT NULL AND unsubscribed_at IS NULL`),
    // Link lookups.
    uniqueIndex('email_subscriber_confirm_token_unique').on(t.confirmToken),
    uniqueIndex('email_subscriber_unsubscribe_token_unique').on(t.unsubscribeToken),
  ],
);
