# Cartie Platform Docs

This directory is the canonical documentation set for the Cartie platform.

## Index
- docs/README.md
- docs/RELEASE_BASELINE.md
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

## Quick Runbook: Connect New Bot By Template
📌 Goal: new bot is ready immediately after connection (menu/scenario/miniapp preset)
1. Open `Telegram Hub` → `Connect Bot`
2. Choose template: `Lead Bot` or `B2B Network`
3. Fill token + optional `channelId`/`adminChatId`
4. Save bot (default `applyPreset=true`)
5. Optional recovery: `Bot Settings` → `Reapply Preset`

📌 Expected result
🔘 `CLIENT_LEAD`: buy/sell/support/lang scenarios are ensured and menu buttons are linked
🔘 `B2B`: hard-flow menu (`/request`, `/menu`) + B2B miniapp preset are ensured
🔘 Bot response includes `presetStatus` (`ready|partial|missing`) and `presetVersion`

## Configs
📌 Root env: `.env` (local), `env/prod.env` (production)
📌 Infra env: `infra/.env`, `infra/Caddyfile`
📌 Web env: `apps/web/.env.production`, `apps/web/.env.production.example`

## Workers
📌 Content publishing worker: `apps/server/src/workers/content.runner.ts` (`npm run worker:content`)
📌 MTProto import: `apps/server/src/modules/Integrations/mtproto/mtproto.import.worker.ts`
📌 Jobs/cron: `apps/server/src/workers` + `apps/server/src/modules/Integrations`
