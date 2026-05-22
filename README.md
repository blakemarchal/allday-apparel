# Allday Merch

Multi-storefront merchandise platform. Two storefronts (apparel + wrestling persona) share one codebase, one admin, one database.

**Read [`CLAUDE.md`](CLAUDE.md) first** for architecture, conventions, and the standing rules. Schema sketch lives at [`docs/schema.md`](docs/schema.md).

## Quickstart (local)

```bash
pnpm install
pnpm infra:up        # boots Postgres (:5433) + Redis (:6380) in Docker
pnpm db:migrate      # apply Drizzle migrations
pnpm dev:web         # Next.js on :3001
pnpm dev:worker      # BullMQ worker (separate terminal)
```

## Repo layout

- `apps/web/` — Next.js App Router (storefronts + admin)
- `packages/db/` — Drizzle schema, migrations, client
- `packages/workers/` — BullMQ jobs
- `infra/` — Docker compose for data stores
- `deploy/` — systemd units, Caddy snippet
- `docs/` — schema sketch, build plan
- `scripts/` — deploy, seed, ops helpers
