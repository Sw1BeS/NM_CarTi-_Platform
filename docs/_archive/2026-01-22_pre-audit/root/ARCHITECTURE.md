# Cartie2 Structure & Ownership

## Layout
- `apps/web` — Vite React client (all source under `src/`)
- `apps/server` — Express + Prisma API
- `infra` — docker-compose (prod), Dockerfile.api/web, Caddyfile, deploy script
- `.env` (root) — production env for compose (api/db/web)
- `SUMMARY.md` — feature stage overview
- `DEPLOYMENT.md` — deployment checklist

## Web (apps/web/src)
- `pages/` — product surfaces:
  - `Login`, `Dashboard`, `Inbox`, `Requests`, `Leads`, `Inventory`, `DealerPortal`, `Search`, `TelegramHub`
  - `Content`, `ContentCalendar` (content scheduling), `Marketplace`, `Integrations`, `CompanySettings`, `Settings`, `ScenarioBuilder`, `QAStageA`, `PublicRequest`, `MiniApp`, `Health`
- `components/` — layout and shared UI (Layout, CommandPalette, NotFound)
- `contexts/` — app state providers (Auth, Company, Language, Theme, Toast, Worker)
- `services/` — client logic grouped by domain (API clients, bot/telegram helpers, content generators, matching/normalization, adapters)
- `types.ts` — shared types
- `translations.ts` — language strings
- `index.tsx` / `App.tsx` — entry and routing
- Config: `vite.config.ts` (alias `@ -> src`), `tsconfig.json`, `.env.production.example`

## Server (apps/server)
- `src/index.ts` — bootstrap (Express, routes, bots, content worker)
- `src/routes/` — API surface (auth, public, QA, entities, etc.)
- `src/modules/` — domain logic:
  - `auth` — login/JWT
  - `bots` — bot registry/manager, bot routes
  - `telegram` — Telegram pipeline, routers (callback/inline/message/webapp), outbox
  - `inventory` — inventory routes
  - `requests` — B2B requests
  - `companies` — multi-tenancy
  - `templates` — marketplace
  - `integrations` — Meta/Sheets/Webhooks/etc.
  - `superadmin` — system-level admin
  - `normalization` — brand/model/city/phone utils
  - `users` — seeding/admin helpers
- `src/middleware/` — auth, company isolation
- `src/services/` — Prisma client, DTO mappers, integration helpers, telegram sender
- `src/workers/` — content worker (cron)
- `prisma/` — schema, migrations, seeds (`prisma/seeds`)
- Config: `package.json`, `tsconfig.json`, `.env.example`

## Infra
- `infra/docker-compose.cartie2.prod.yml` — prod stack (db/api/web)
- `infra/Dockerfile.api` — builds `apps/server`
- `infra/Dockerfile.web` — builds `apps/web`
- `infra/Caddyfile` — reverse proxy for web/api
- `infra/deploy_infra2.sh` — deploy helper (build+up+health checks)

## Environment
- Root `.env` consumed by compose: `PORT`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `CORS_ORIGIN`, `SEED_ADMIN_*`
- Frontend env example: `apps/web/.env.production.example` (VITE_API_BASE_URL, GEMINI_API_KEY)
- Backend env example: `apps/server/.env.example`

## Builds & Tests
- Frontend: `cd apps/web && npm run build`
- Backend: `cd apps/server && npm run build`
- Compose build: `docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml build`
- Health: `curl http://127.0.0.1:3002/health` and `http://127.0.0.1:8082/api/health`

## Data & Migrations
- Prisma schema: `apps/server/prisma/schema.prisma`
- Migrations: `apps/server/prisma/migrations/*`
- Seeds: `apps/server/prisma/seed.ts`, `apps/server/prisma/seeds/templates.seed.ts`

## Ownership / Domains
- Bots/Telegram: `apps/server/src/modules/bots`, `apps/server/src/modules/telegram`, `apps/web/src/pages/TelegramHub.tsx`, `apps/web/src/services/botEngine.ts`
- Content/Scheduling: `apps/web/src/pages/Content*.tsx`, `apps/server/src/workers/content.worker.ts`, `apps/web/src/services/contentGenerator.ts`
- Marketplace/Templates: `apps/web/src/pages/Marketplace.tsx`, `apps/server/src/modules/templates`
- Integrations: `apps/web/src/pages/Integrations.tsx`, `apps/server/src/modules/integrations`
- Multi-tenancy/Companies: `apps/web/src/pages/CompanySettings.tsx`, `apps/server/src/modules/companies`, auth middleware
- Requests/Leads/Inventory: respective pages + `apps/server/src/modules/{requests,inventory}`
