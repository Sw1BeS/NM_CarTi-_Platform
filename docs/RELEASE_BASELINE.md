# RELEASE BASELINE — 2026-02-16

## Runtime Snapshot
📌 Environment: production (`main`)  
📌 Public URL: `https://cartie2.umanoff-analytics.space`  
📌 Build SHA endpoint: `/BUILD_SHA`  
📌 Health endpoint: `/api/health`

## Infra Snapshot
📌 Compose project: `infra2` (`infra/docker-compose.cartie2.prod.yml`)  
📌 Services:
🔘 `infra2-db-1` → Postgres 15 (`127.0.0.1:5433`)  
🔘 `infra2-api-1` → Node/Express API (`127.0.0.1:3002`)  
🔘 `infra2-web-1` → Caddy + web build (`127.0.0.1:8082`)

📌 Canonical deploy path:
🔘 `infra/deploy_prod.sh` (single source of truth)  
🔘 `infra/deploy_infra2.sh`, `infra/deploy_manual.sh` delegate to `deploy_prod.sh`

## Database Snapshot
📌 Prisma migrations: 23 applied (including `20260216133000_add_scheduled_job_table`)  
📌 Scheduler table present: `ScheduledJob`

## Bot/Flow Snapshot
📌 Active bots in production: 1  
📌 Supported templates: `CLIENT_LEAD`, `B2B`, `CATALOG`  
📌 B2B runtime model in this release: hard-flow (`routeMessage` + `ScenarioEngine` callbacks)

## Module Map (Module → Responsibility → Intersections)
📌 Core (`apps/server/src/modules/Core`)  
🔘 Auth, users, workspace/system settings, templates  
🔘 Intersections: bot creation context, company scoping, public settings

📌 Communication (`apps/server/src/modules/Communication`)  
🔘 Bot runtime, Telegram update routing, scenarios, outbox delivery  
🔘 Intersections: Sales requests/variants, MiniApp web_app_data, publication notifications

📌 Sales (`apps/server/src/modules/Sales`)  
🔘 B2B request lifecycle, variants, manager/admin routing  
🔘 Intersections: Communication callbacks, card rendering, channel posts

📌 Inventory (`apps/server/src/modules/Inventory`)  
🔘 `CarListing` normalization, inventory records and lookups  
🔘 Intersections: MiniApp showcase inventory, content publication templates, parser/MTProto ingestion

📌 Integrations (`apps/server/src/modules/Integrations`)  
🔘 MTProto ingest, Telegram/media publication path, external connectors  
🔘 Intersections: Inventory fill quality, publication worker reliability

📌 Frontend (`apps/web/src`)  
🔘 Admin app, Telegram Hub, Requests, Inventory, public MiniApp pages  
🔘 Intersections: `/api/bots`, `/api/scenarios`, `/api/miniapp/*`

📌 Infra (`infra`)  
🔘 Build/deploy scripts, compose, Caddy routing and cache policy  
🔘 Intersections: stale asset behavior, health checks, smoke validation

📌 Docs (`docs`)  
🔘 Release audit/checklists/runbooks and architecture references

## Source of Truth Registry
📌 Inventory = source of truth for vehicles (`CarListing`)  
📌 Showcase = saved view/preset over inventory (filters/rules/sorting)  
📌 Surfaces (bot/channel/miniapp/landing) = outputs over same data, not separate inventories
