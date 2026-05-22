-- Allday Merch — initial DB setup
-- Runs once when the postgres container's data volume is first initialized.
--
-- Keep this minimal. Schema and migrations live in packages/db (Drizzle).
-- This file is for extensions, roles, or DB-level setup that Drizzle can't own.

-- Enable pgcrypto for gen_random_uuid() (used by UUID primary keys in the schema).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- citext for case-insensitive email/slug comparisons if we want them later.
CREATE EXTENSION IF NOT EXISTS citext;
