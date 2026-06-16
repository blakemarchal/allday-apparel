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
| Routing | **Apparel = apex `allday-apparel.com`; character = `/WillAllday` path on the SAME host; admin = `admin.` subdomain.** Implemented + live. Middleware sets `x-pathname`; `getCurrentStorefront()` resolves by host + path (returns a `basePath`). Cart cookie is keyed by `storefrontId` so the two stores never share a cart. Shared view components under `components/storefront/views/`; root + `app/WillAllday/*` routes are thin re-export shims. (Reversed the original subdomain-per-storefront plan.) |
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
infra/              (runtime + deploy artifacts; mirrors RegKnots' layout)
  docker-compose.yml   Postgres + Redis for merch
  init.sql             Initial DB setup
  merch-web.service    systemd unit for Next.js (mirror RegKnots' pattern)
  merch-worker.service systemd unit for BullMQ worker
  Caddyfile.snippet    Block to append to /etc/caddy/Caddyfile
  README.md            Brief deploy notes
packages/
  db/               Drizzle schema + migrations + client
  workers/          BullMQ jobs (webhook processing, drop activation, low-stock, email blasts)
docs/
  schema.md         Canonical schema sketch (review before code)
scripts/
  deploy.sh         Production deploy (TBD)
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

**LIVE in production** at `https://allday-apparel.com` (apparel storefront) + `https://admin.allday-apparel.com` (admin), deployed to the VPS at `/opt/AlldayApparel`. Full admin suite + storefront + checkout pipeline built and deployed. Local + prod both run the same stack.

Production specifics:
- **Domain:** `allday-apparel.com` (GoDaddy registrar, GoDaddy DNS). Apex `A @` + `A admin` → `68.183.130.3`, 600s TTL. `www` CNAME → apex.
- **Routing:** apparel = apex; character = `/WillAllday` path (NOT yet implemented — see task); admin = `admin.` subdomain.
- **TLS:** Caddy auto-issues Let's Encrypt certs for the merch hostnames (static, NOT on-demand). Merch Caddy block appended to `/etc/caddy/Caddyfile` after the RegKnots block. **Gotcha:** Caddy runs as user `caddy`; any new `/var/log/caddy/*.log` must be pre-created with `caddy:caddy` ownership or the config reload fails with "permission denied". Also the systemd reload timeout (~90s) can kill a reload that's provisioning fresh certs — use `caddy reload --config ... --force` directly if needed.
- **Compose:** the VPS only had docker-compose **v1** (project `infra`, same as RegKnots → volume-name collision risk). Installed the **Compose v2 plugin** binary at `/usr/libexec/docker/cli-plugins/docker-compose`. Merch compose pins `name: merch` so volumes/networks are `merch_*`, never `infra_*`. Bring up: `cd /opt/AlldayApparel/infra && docker compose up -d`.
- **Services:** `merch-web` (:3001) + `merch-worker` systemd units. Data stores: `merch-postgres` (:5433) + `merch-redis` (:6380) containers on `merch_merch-net`.
- **Prod env:** `/opt/AlldayApparel/.env.production` (chmod 600). Stripe keys still placeholder → checkout self-disables until real keys land. Supabase prod redirect URL `https://admin.allday-apparel.com/admin/auth/callback` must be added to the Supabase project Auth config.
- **Git remote:** `github.com/blakemarchal/allday-apparel` (private). Local `git push` works (HTTPS, cached creds). VPS has a read-only **deploy key** at `/root/.ssh/allday_deploy` and the repo remote is the SSH URL with repo-local `core.sshCommand` (RegKnots git untouched) — but the key must be added to the repo's Deploy Keys for VPS pulls to work. **Until then the VPS still deploys via tar.** Once authorized: `cd /opt/AlldayApparel && git fetch origin && git reset --hard origin/main` (delete-aware) → build → restart.
- **Branding:** v1 brand pass live (apparel = warm-premium Fraunces; character = loud Anton red/gold). Tokens + hero copy in `scripts/brand-v1.sql` (theme_config.tokens/landing). Fonts self-hosted via `next/font` in `apps/web/src/app/layout.tsx`. This is Claude's proposal for Will to react to — iterate freely.
- **DEPLOY GOTCHA — tar does not delete.** tar-over-ssh only adds/overwrites; files deleted or moved in a commit still linger on the VPS and can break the build (a stale `app/cart/actions.ts` with an old signature 502'd prod once). After a tar deploy, remove deletions manually or run `git -C /opt/AlldayApparel clean -fd` (gitignored `.env*`/`.next`/`node_modules` are preserved). This is the #1 reason to finish the GitHub remote so deploys use `git pull` (delete-aware). Deploy = transport → `clean` stale → `set -a; . ./.env.production; set +a; pnpm build:web` → `systemctl restart merch-web` (+ `merch-worker` if changed).

## Deferred until Will's intake answers come back

The setup-and-intake form was sent to Will (`Will_Allday_Merch_Intake.docx`). Items below are gated on his answers and should NOT be built speculatively:

- **Pre-orders.** Section 4 asks if launch includes pre-orders. If yes, add `preorder_ships_at` to `drop` (or `variant`) and an "allow oversell" flag to skip inventory checks. Schema seam will be retrofittable cheaply.
- **Multi-admin logins.** Section 6 asks about managers/family needing their own logins. The `admin_user` table + role design lands with task #10 (Supabase auth) regardless — just need Will's answer to know if we ship single-user-only for v1 or include the role model up front.
- **Brand values.** All of section 3 (logos, fonts, colors, character description, brand-feel words, catchphrases, things to avoid, inspirations) feeds `theme_config.tokens` and `theme_config.landing`. Build the theming system with placeholders; swap values when Will answers.
- **Product catalog values.** Section 4 — types of products, size ranges, total count, signed items, drop style (qty vs time). Schema accommodates all; we just need values for seed data.
- **Shipping numbers.** Section 5 — free-shipping threshold + flat-rate value. Schema has `free_shipping_threshold_cents` and `flat_shipping_cents` on storefront; populate from Will's answer.
- **Email setup.** Section 5 — Will to create a Proton inbox + share domain DNS access. Resend domain auth + ImprovMX aliases configured once those land.
