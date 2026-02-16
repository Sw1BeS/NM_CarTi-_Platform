# Cartie Platform Docs

This directory is the canonical documentation set for the Cartie platform.

## Index
- docs/README.md
- docs/ARCHITECTURE.md
- docs/AUDIT.md
- docs/PLAN.md
- docs/REFERENCE.md
- docs/MODULES/

## Snapshot (2026-01-22)
- Repo root: /srv/cartie
- Stack: Node.js + TypeScript + Express, Prisma + Postgres, React 19 + Vite 6 + Tailwind 4, Docker Compose + Caddy, GitHub Actions CI

### High-Level Tree
```
.
├── .github/
├── _archive/
├── apps/
│   ├── server/
│   └── web/
├── docs/
├── infra/
├── scripts/
├── .env
├── .env.example
└── fix.sql
```

## Run
📌 Local dev (Node)
🔘 Server: `cd apps/server && npm install && npm run dev`
🔘 Web: `cd apps/web && npm install && npm run dev`
📌 Production (Docker)
🔘 Compose file: `infra/docker-compose.cartie2.prod.yml`
🔘 Canonical deploy script: `infra/deploy_prod.sh`
🔘 Compatibility wrappers: `infra/deploy_infra2.sh`, `infra/deploy_manual.sh` (both delegate to `deploy_prod.sh`)
🔘 Common deploy modes:
🔘 `bash infra/deploy_prod.sh` (default: pull main + migrate + seed + health)
🔘 `SKIP_PULL=1 ALLOW_DIRTY=1 bash infra/deploy_manual.sh` (local/manual deploy)
🔘 `RUN_SEED=0 bash infra/deploy_prod.sh` (skip seed for hotfix rollout)

## Configs
📌 Root env: `.env` (local), `env/prod.env` (production)
📌 Infra env: `infra/.env`, `infra/Caddyfile`
📌 Web env: `apps/web/.env.production`, `apps/web/.env.production.example`

## Workers
📌 Content publishing worker: `apps/server/src/workers/content.runner.ts` (`npm run worker:content`)
📌 MTProto import: `apps/server/src/modules/Integrations/mtproto/mtproto.import.worker.ts`
📌 Jobs/cron: `apps/server/src/workers` + `apps/server/src/modules/Integrations`
