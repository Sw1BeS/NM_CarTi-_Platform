# Runtime Infra Map

Generated: 2026-05-26T15:50:52.636Z
Root: `/srv/cartie`
Git: `360d414`

## Runtime shape

- Compose file: `infra/docker-compose.cartie2.prod.yml`
- Database: Postgres 15 on `127.0.0.1:5433 -> 5432`, volume `/srv/cartie/data/cartie2/postgres`.
- API: Node/Express on `127.0.0.1:3002 -> 3001`, media mounted from `/srv/cartie/storage`.
- Web: Caddy/Vite static frontend on `127.0.0.1:8082 -> 8080`.
- Public reverse proxy: nginx sites in `/etc/nginx/sites-enabled`.

## Package scripts

| Package | Name | Type | Scripts | Dependencies | DevDeps |
| --- | --- | --- | --- | --- | --- |
| `apps/server/package.json` | cartie-admin-backend | module | dev, build, start, worker:content, start:worker:content, prisma:generate, prisma:migrate, seed, preset:sync, migrate:v4:seed, migrate:v4:inventory, migrate:v4:leads, media:reconcile, inventory:backfill-normalization, backfill:partner-codes-showcases, cleanup:external-hidden-listings, telegram:normalize-chat-ids, telegram:backfill-identity, repair:miniapp-menu-config, repair:miniapp-request-titles, cleanup:test-data, test, test:watch, b2b:backfill-partner-admin-groups | 13 | 14 |
| `apps/web/package.json` | cartie-b2b-&-telegram-hub_v4.2_fixes | module | dev, build, preview | 25 | 7 |

## nginx enabled sites

| Site | Target |
| --- | --- |
| `api.umanoff-analytics.space` | `/etc/nginx/sites-available/api.umanoff-analytics.space` |
| `cartie.umanoff-analytics.space` | `/etc/nginx/sites-available/cartie.umanoff-analytics.space` |
| `cartie2.umanoff-analytics.space.conf` | `/etc/nginx/sites-available/cartie2.umanoff-analytics.space.conf` |
| `default` | `/etc/nginx/sites-available/default` |
| `umanoff-analytics.space` | `/etc/nginx/sites-available/umanoff-analytics.space` |

## Current compose ps snapshot

```text
NAME           IMAGE                COMMAND                  SERVICE   CREATED         STATUS                   PORTS
infra2-api-1   infra2-api           "docker-entrypoint.s…"   api       7 minutes ago   Up 7 minutes (healthy)   127.0.0.1:3002->3001/tcp
infra2-db-1    postgres:15-alpine   "docker-entrypoint.s…"   db        2 weeks ago     Up 2 weeks (healthy)     127.0.0.1:5433->5432/tcp
infra2-web-1   infra2-web           "caddy run --config …"   web       21 hours ago    Up 21 hours (healthy)    80/tcp, 443/tcp, 2019/tcp, 443/udp, 127.0.0.1:8082->8080/tcp
```

## Systemd failed units snapshot

```text
UNIT LOAD ACTIVE SUB DESCRIPTION

0 loaded units listed.
```

## Safe smoke checks

```bash
docker compose -f /srv/cartie/infra/docker-compose.cartie2.prod.yml ps
curl -fsS http://127.0.0.1:3002/health
curl -fsS http://127.0.0.1:8082/
nginx -t
systemctl --failed --no-pager
```
