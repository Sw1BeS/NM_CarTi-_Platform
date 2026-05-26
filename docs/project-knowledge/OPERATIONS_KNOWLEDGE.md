# Operations Knowledge

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

## Before any cleanup or refactor

- Treat these paths as protected by default: `/srv/cartie/data`, `/srv/cartie/storage`, `/srv/cartie/_logs`, `/srv/cartie/.deploy`, `/srv/cartie/env`, `/srv/cartie/.env`, `/srv/cartie/apps/server/.env`, `/srv/cartie/apps/web/.env.production`, `/srv/cartie/infra/.env`.
- Do not move or delete deployment state, rollback evidence, logs, or env directories without an owner-approved retention policy and verified restore path.
- Confirm `git status --short --branch` and note untracked product artifacts before editing.
- Archive before deleting historical or backup material.

## Standard smoke gate

```bash
docker compose -f /srv/cartie/infra/docker-compose.cartie2.prod.yml ps
curl -fsS http://127.0.0.1:3002/health
curl -fsS http://127.0.0.1:8082/
nginx -t
systemctl --failed --no-pager
```

## Deployment shape

- API build: `infra/Dockerfile.api`, exposed locally on `127.0.0.1:3002`.
- Web build: `infra/Dockerfile.web`, exposed locally on `127.0.0.1:8082`.
- Database: compose-managed Postgres volume under `/srv/cartie/data/cartie2/postgres`.
- Public routing: nginx sites for `cartie.umanoff-analytics.space`, `cartie2.umanoff-analytics.space`, `api.umanoff-analytics.space`, and related hostnames.

## Known verification caveat

The server TypeScript check passed in the latest manual assessment. The web TypeScript check had existing tracked failures, so use route-level/browser smoke checks until a dedicated type cleanup is done.
