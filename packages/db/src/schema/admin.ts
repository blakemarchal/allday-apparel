import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { adminRoleEnum, adminUserStatusEnum } from './enums';

// Admin users (operator-side; distinct from `customer` which is buyers).
//
// Lifecycle:
//   1. Existing admin invites by email -> row inserted with status='invited',
//      supabase_user_id=NULL. An invite email is sent (magic link).
//   2. Invitee clicks the link -> Supabase creates an auth user -> our app
//      callback patches supabase_user_id and flips status='active'.
//   3. Owner can disable a row (status='disabled') without deleting history.
//
// Roles (v1):
//   - owner: Will. Can manage other admin rows (invite, remove, change role).
//   - manager: Wife, Blake, future helpers. Close-to-par operational access
//     (orders, products, drops, stock, payouts view). Cannot manage admins.
export const adminUser = pgTable(
  'admin_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Set when the user accepts the invite. NULL until then.
    // Postgres UNIQUE allows multiple NULLs, so the index works for invited rows.
    supabaseUserId: text('supabase_user_id'),

    // Stored lowercased. Used for invite lookups and display.
    email: text('email').notNull(),
    name: text('name'),

    role: adminRoleEnum('role').notNull().default('manager'),
    status: adminUserStatusEnum('status').notNull().default('invited'),

    // Audit: who invited this user. NULL for the first owner (bootstrap).
    invitedById: uuid('invited_by_id').references(
      (): AnyPgColumn => adminUser.id,
      { onDelete: 'set null' },
    ),

    lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('admin_user_supabase_id_unique').on(t.supabaseUserId),
    uniqueIndex('admin_user_email_unique').on(t.email),
  ],
);
