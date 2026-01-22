# Audit Report

**Date:** 2026-01-22
**Commit:** f64ab53
**Root:** /srv/cartie/apps/cartie2_repo

## Phase 0: Snapshot

### Structure
- **Monorepo:** `apps/server`, `apps/web`
- **Infra:** `infra/docker-compose.cartie2.prod.yml`, `infra/deploy_prod.sh`
- **Frontend Stack:** Vite, React, Tailwind, Framer Motion (HashRouter used)
- **Backend Stack:** Node.js, Express, Prisma, Postgres

### Services
- **DB:** Postgres 15 (`cartie_db`) on 5433:5432
- **API:** Node on 3002:3001
- **WEB:** Caddy on 8082:8080

## Phase 1: Problem Analysis

### 1.1 Integrity Matrix (Module -> Backend -> Frontend)

| Module | Backend (Prisma/Module) | Frontend (Route/Page) | Status |
| :--- | :--- | :--- | :--- |
| **Leads** | `Lead` model, `Sales` module? | `/leads` (`Leads.tsx`) | ✅ Connected |
| **Inventory** | `CarListing`, `Inventory` module | `/inventory` (`Inventory.tsx`) | ✅ Connected |
| **Requests** | `B2bRequest` | `/requests` (`RequestList`) | ✅ Connected (Route duplicated in App.tsx) |
| **Telegram** | `BotConfig`, `BotSession` | `/telegram` (`TelegramHub`) | ⚠️ `TelegramHub.bak.tsx` (82KB) exists. MTProto needing separation. |
| **Integrations** | `Integration`, `MTProtoConnector` | `/integrations` (`IntegrationsPage`) | ⚠️ Monolithic page. Needs decomposition. |
| **Companies** | `Workspace` | `/companies` (`CompaniesPage`) | ✅ Connected |
| **Scenarios** | `Scenario` | `/scenarios` (`ScenarioBuilder`) | ⚠️ Component too large (73KB). |
| **Content** | `Draft`? | `/content`, `/calendar` | ✅ Connected |
| **Entities** | `EntityDefinition` | `/entities` (`EntitiesPage`) | ✅ Connected (Dynamic) |

### 1.2 Deployment Issues
- **Problem:** Manual removal of old containers required.
- **Root Cause:** `deploy_prod.sh` relies on `docker ps` filtering with general terms (`infra`, `cartie`). If project name differs (e.g. `infra2` vs `cartie_infra`), it misses them.
- **Fix:** Use specific project name `infra2` and `docker compose down --remove-orphans`.
- **Health Check:** `deploy_prod.sh` checks localhost ports correctly.

### 1.3 Data Status
- **Schema:** Contains full support for leads, inventory, bots, and MTProto.
- **Seeds:** `seed.ts` is robust, creates System/Cartie/Demo workspaces.
    - **Issue:** Uses `FEATURE_FLAGS` check (though defaults are TRUE).
- **Missing Data:** Real-world connection of "TG Channel -> Inventory" seems weak in current seed.

### 1.4 Code Quality & Complexity
- **Feature Flags:** `src/utils/constants.ts` defines flags. Usage found in `userService.js` and `seed.ts`. MUST REMOVE.
- **Junk:**
    - `TelegramHub.bak.tsx` (~80KB) - **DELETE**.
    - Duplicate `/requests` route in `App.tsx`.
- **Complexity:**
    - `ScenarioBuilder` is massive.
    - `IntegrationsPage` is a single bucket for all settings.

## Phase 2: Telegram Focus
- Current state: `MTProtoConnector` exists in DB. `TelegramHub` exists in UI.
- Goal: Ensure separation of "Ingestion" (MTProto) and "Bot Interaction".
- Action: UI needs clear tabs/sub-pages for each.

## Phase 3: Action Items
1.  **Refactor Deploy Script:** Make it strictly use `docker compose -p infra2 down --remove-orphans`.
2.  **Clean Code:** Delete `.bak` files, remove feature flags (hardcode enabled).
3.  **UI Refact:** Split `Integrations` into `/integrations/meta`, `/integrations/telegram`, etc.
4.  **Routing:** Fix duplicate lines in `App.tsx`.
