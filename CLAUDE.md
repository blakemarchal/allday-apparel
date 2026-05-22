# Allday Merch — Claude session brief

This file is auto-loaded by Claude Code in any session opened from this repo. **Read it before starting work.**

---

## What this is

A multi-storefront merchandise platform for a pro wrestler (Will). Two storefronts share one codebase, one admin, one database:

1. **Apparel storefront** — long-term flagship brand. Clean, premium aesthetic.
2. **Wrestling/character storefront** — louder, grittier, persona-driven.

v1 ships from Will's garage (self-fulfillment), US-only, with the door left open for POD/3PL later. Stripe will use Will's LLC account when ready; Blake's test keys until then.

- **Blake Marchal** — sole developer. Email `blakemarchal@gmail.com`.
- **Will** — non-technical, defers to Blake on all tech.

## Standing rules (non-negotiable)

- **Garage operation, not a marketplace.** Do not gold-plate. Designs are multi-tenant *at the storefront seam only* to support the two-store split. No tenant-aware ceremony beyond that. The "other wrestlers might want this" SaaS is a separate future project — do not pre-build for it.
- **RegKnots isolation is hard requirement.** This app co-tenants a VPS with RegKnots. A problem here must not be able to touch RegKnots data or take it down. Separate Postgres container on a separate Docker network. App-layer scoping by `storefront_id` for the merch tenancy seam (no Postgres RLS — overkill for a single-owner setup).
- **No git worktrees.** Past agentic sessions have stranded changes in worktrees that Blake then had to recover manually. Work in-place. Do not pass `isolation: "worktree"` to Agent calls on this repo.
- **Branch policy:** commit directly to `main`. No feature branches. Blake pushes manually unless he explicitly asks Claude to push (in which case Claude runs the full dev → test → push → deploy chain). Mirrors RegKnots' workflow.
- **Schema-first when querying.** Read actual table definitions (Drizzle schema or `information_schema`) before writing queries. Do not infer columns from memory.
- **Stripe is not the source of truth.** Catalog lives in our Postgres. Stripe Products/Prices are synced *from* our DB, not the other way around.

## Locked architectural decisions

| Concern | Decision |
|---|---|
| Frontend + API | Next.js (App Router), Node API routes. No FastAPI sidecar in v1. |
| DB | PostgreSQL (own Docker container, port 5433 to avoid RegKnots' 5432). |
| ORM | Drizzle. |
| Auth (admin only) | Supabase. Customers checkout as guests. |
| Payments | Stripe Checkout (hosted). Regular account (not Connect). |
| Queue | BullMQ on a dedicated merch Redis container (port 6380). |
| Tenancy | App-layer `storefront_id` scoping. No RLS. |
| Variant model | Normalized: Product → ProductOption → ProductOptionValue → Variant → VariantOptionValue → InventoryItem. |
| Drops | Lightweight reservation system (`qty_on_hand`, `qty_reserved`, `reservation` table) gated by Stripe session expiry. |
| Routing | Subdomain per storefront, resolved via a `storefront_host` lookup table. |
| Isolation | Data stores in Docker on a separate `merch-net`. App processes as systemd units (mirrors RegKnots). |
| Image storage | Cloudflare R2 from day one. Never local disk. |
| Email (send) | Resend, domain-authenticated. |
| Email (receive) | ImprovMX role aliases → Proton. (Operational, not architectural.) |
| Webhooks | Stripe signature verification + idempotent persistence + post-work queued to BullMQ. |
| Backups | Nightly `pg_dump` to R2. |
| Tax | Stripe Tax. |
| Shipping | Free over a configurable threshold; flat under it. Per-storefront settings. |

## Repo layout (planned)

```
apps/
  web/              Next.js App Router — storefronts + admin
infra/
  docker-compose.yml   Postgres + Redis for merch
  init.sql             Initial DB setup
deploy/
  merch-web.service       systemd units (mirror RegKnots' pattern)
  merch-worker.service
  Caddyfile.snippet       Block to add to /etc/caddy/Caddyfile
packages/
  db/              Drizzle schema + migrations + client
  workers/         BullMQ jobs (webhook processing, drop activation, low-stock, email blasts)
docs/
  schema.md        Canonical schema sketch (review before code)
  build-plan.md    Build order (mirrors the task list)
scripts/
  deploy.sh        Production deploy
  seed.ts          Seed data for demo
```

## Production / VPS context

- **VPS:** `root@68.183.130.3` (DigitalOcean, hostname `spiritflow-prod-01`, Ubuntu 24.04, 2 vCPU / 3.8 GB RAM / 116 GB disk). Co-tenants with RegKnots.
- **RegKnots-owned ports/services:** Postgres 5432 (Docker), Redis 6379 (Docker), Next.js 3000 (systemd `regknots-web`), FastAPI 8000 (systemd `regknots-api`), Celery worker (systemd `regknots-worker`).
- **Free for merch:** Postgres 5433, Redis 6380, Next.js 3001, worker (no port).
- **Caddy:** `/etc/caddy/Caddyfile`. RegKnots block uses on-demand TLS for SaaS custom domains. Merch will use static TLS for known hostnames only.
- **DO Droplet can be vertically resized** (CPU + RAM) when traffic justifies it. Do not design as if RAM is permanently capped at 3.8 GB — set sensible *protective* container limits, not stingy ones.

## Working conventions

- **Workflow:** Blake reviews proposed changes before code lands for anything non-trivial. State the plan, wait for greenlight, then execute.
- **Phone-first admin.** Will operates from backstage/hotels/airports. UI priority is 30-second-from-phone actions (flip a drop live, mark order shipped, low-stock glance).
- **Drop concurrency is non-negotiable.** Limited drops MUST use the reservation flow. Overselling = refunding sold-out fans = bad customer experience.
- **Catalog edits never mutate order history.** OrderLineItem snapshots SKU, title, options, and price at purchase time.
- **Webhook handlers do the minimum inline** (signature check + idempotency check + enqueue). The heavy work (inventory, email, fulfillment hooks) runs in BullMQ workers.

## Build status

Not yet bootstrapped. See `docs/build-plan.md` once written, or the active task list in this session. Schema sketch lives at `docs/schema.md` and should be reviewed before any Drizzle code is written.
