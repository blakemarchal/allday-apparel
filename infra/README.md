# infra/

Runtime + deploy artifacts for Allday Merch.

## Files

- **`docker-compose.yml`** — local + production data stores (Postgres :5433, Redis :6380) on the `merch-net` Docker network, isolated from RegKnots' `infra_regknots-net`. Run with `pnpm infra:up` from the repo root.
- **`init.sql`** — Postgres extensions enabled on container first-start (`pgcrypto`, `citext`).
- **`merch-web.service`** — systemd unit for the Next.js app (apps/web). Copy to `/etc/systemd/system/` on the VPS.
- **`merch-worker.service`** — systemd unit for the BullMQ worker (packages/workers).
- **`Caddyfile.snippet`** — site block to append to `/etc/caddy/Caddyfile`. Replace `<ROOT>` with Will's domain.

## VPS deploy (rough sketch, will be scripted later)

```bash
# On laptop: push to main, then on the VPS:
ssh root@68.183.130.3
cd /opt
git clone <repo> AlldayApparel
cd AlldayApparel
pnpm install
pnpm build:web
pnpm infra:up               # boots merch-postgres + merch-redis
pnpm db:migrate              # apply Drizzle migrations
cp infra/merch-web.service /etc/systemd/system/
cp infra/merch-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now merch-web merch-worker
# Then edit /etc/caddy/Caddyfile to append infra/Caddyfile.snippet contents,
# replace <ROOT> with the real domain, and:
systemctl reload caddy
```

`scripts/deploy.sh` will eventually wrap this for repeatable rollouts.
