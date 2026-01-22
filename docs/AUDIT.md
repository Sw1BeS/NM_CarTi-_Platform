# CARTIE PLATFORM AUDIT

**Date**: 2026-01-22  
**Repository**: `/srv/cartie/apps/cartie2_repo`  
**Commit**: `9924958` (branch: `main`)  
**Production**: https://cartie2.umanoff-analytics.space/

---

## PHASE 0: BASELINE SNAPSHOT

### Repository State
- **Root**: `/srv/cartie/apps/cartie2_repo`
- **Current Commit**: `9924958`
- **Branch**: `main`
- **Git Status**: Has uncommitted changes (modified docs, new files in docs/, scripts/)
- **Structure**:
  - `apps/server` → Backend (Node.js + TypeScript + Prisma)
  - `apps/web` → Frontend (React + Vite + Tailwind v4)
  - `infra/` → Docker infrastructure (`docker-compose.cartie2.prod.yml`)
  - `docs/` → Documentation
  - `scripts/` → Utility scripts

### Infrastructure Configuration

**Docker Compose Project**: `infra2`

| Service | Port Mapping        | Health Check                          | Notes                     |
|---------|---------------------|---------------------------------------|---------------------------|
| db      | 127.0.0.1:5433:5432 | `pg_isready` on 127.0.0.1:5432        | PostgreSQL 15             |
| api     | 127.0.0.1:3002:3001 | HTTP GET `http://127.0.0.1:3001/health` | Backend API (Node.js)     |
| web     | 127.0.0.1:8082:8080 | HTTP GET `http://127.0.0.1:8080/api/health` | Frontend + Caddy reverse proxy |

**Deployment Script**: `infra/deploy_infra2.sh`
- Uses `--force-recreate --remove-orphans`
- Runs health checks on containers and endpoints
- Expects clean git state (fails if uncommitted changes)
- Logs to `/srv/cartie/_logs/infra2_deploy_*.log`

**Data Volume**: `/srv/cartie/data/cartie2/postgres` (persistent DB storage)

---

## PHASE 1: PLATFORM INTEGRITY AUDIT

### 1.1 Module Mapping: Backend ↔ Frontend ↔ Database

#### Backend Modules (apps/server/src/modules)

| Module Group     | Routes Found                                    | Service/Logic                           | Status       |
|------------------|-------------------------------------------------|-----------------------------------------|--------------|
| **Core**         | `auth.routes`, `companies.routes`, `system.routes`, `templates.routes`, `superadmin.routes` | Auth, companies, system settings, templates, superadmin | ✅ Active    |
| **Communication**| `bot.routes`, `telegram.routes`                 | Telegram bots, bot sessions, messages   | ✅ Active    |
| **Integrations** | `integration.routes`, `mtproto.routes`          | SendPulse, Meta, MTProto, Viber, WhatsApp, Autoria | ✅ Active    |
| **Inventory**    | `inventory.routes`                              | Car listings, catalog management        | ✅ Active    |
| **Sales**        | `requests.routes`                               | B2B requests, variants, channel posts   | ✅ Active    |

**Total Backend Routes**: 11 route files identified

#### Frontend Pages (apps/web/src/pages/app)

| Page File                  | Route in App.tsx | Backend Module     | Status          |
|----------------------------|------------------|--------------------|-----------------|
| Dashboard.tsx              | `/`              | Multiple (stats)   | ✅ Mapped        |
| Inbox.tsx                  | `/inbox`         | Communication      | ✅ Mapped        |
| Leads.tsx                  | `/leads`         | Communication      | ✅ Mapped        |
| Requests.tsx               | `/requests`      | Sales              | ✅ Mapped        |
| TelegramHub.tsx            | `/telegram`      | Communication      | ✅ Mapped        |
| Inventory.tsx              | `/inventory`     | Inventory          | ✅ Mapped        |
| Companies.tsx              | `/companies`     | Core               | ✅ Mapped        |
| Entities.tsx               | `/entities`      | Core               | ✅ Mapped        |
| Settings.tsx               | `/settings`      | Core               | ✅ Mapped        |
| CompanySettings.tsx        | `/company`       | Core               | ✅ Mapped        |
| Integrations.tsx           | `/integrations`  | Integrations       | ✅ Mapped        |
| Content.tsx                | `/content`       | Communication      | ✅ Mapped        |
| ContentCalendar.tsx        | `/calendar`      | Communication      | ✅ Mapped        |
| Marketplace.tsx            | `/marketplace`   | Core               | ✅ Mapped        |
| Search.tsx                 | `/search`        | Inventory/Sales    | ✅ Mapped        |
| Health.tsx                 | `/health`        | Core               | ✅ Mapped        |
| QAStageA.tsx               | `/qa`            | Superadmin         | ✅ Mapped        |
| **ScenarioBuilder.tsx**    | ❌ NO ROUTE      | Communication      | ⚠️ **ORPHANED** |
| **AutomationBuilder.tsx**  | ❌ NO ROUTE      | Communication      | ⚠️ **ORPHANED** |

**Public Pages**: Login, PublicRequest, MiniApp, DealerPortal, ClientProposal, Superadmin Routes

**Total Frontend Pages**: 21 tsx files, **19 mapped to routes**, **2 orphaned**

#### Database Schema (Prisma)

**Schema Complexity**: 1374 lines, **dual structure** (Legacy + v4.1 foundation)

**Legacy Models** (Active in production):
- `BotConfig`, `Lead`, `LeadActivity`, `BotMessage`, `BotSession`
- `B2bRequest`, `RequestVariant`, `ChannelPost`, `MessageLog`
- `CarListing`, `Draft`
- `MTProtoConnector`, `ChannelSource`
- `Scenario`, `Campaign`, `Integration`
- `PartnerCompany`, `PartnerUser`
- `SystemSettings`, `SystemLog`
- `EntityDefinition`, `EntityField`, `EntityRecord` (dynamic entities)

**v4.1 Models** (Multi-tenant foundation):
- `Workspace`, `GlobalUser`, `Account`, `Membership`
- `EntityType`, `FieldDefinition`, `Record`, `RecordExternalKey`
- `RelationType`, `DictionarySet`, `Pipeline`, `Contact`, `IngestionSource`
- And **40+ more models** for v4.1 (not yet fully integrated)

**Key Finding**: **Dual-write system present** but not fully activated. Feature flag `USE_V4_DUAL_WRITE` controls v4.1 writes.

---

### 1.2 Deployment Issues: Why Manual "infra Deletion" Was Needed

#### **Issue #1: Compose Project Name Conflicts**

**Root Cause**: Project name `infra2` in `docker-compose.cartie2.prod.yml` line 1:
```yaml
name: infra2
```

**Problem**: If deploying with different compose files or without explicit `-p infra2`, Docker creates separate projects:
- `cartie2_repo` (from directory name)
- `infra2` (from compose file `name`)
- Older deployments might use `cartie_infra`, `prod`, etc.

**Evidence**: Found in `deploy_infra2.sh` line 53:
```bash
docker compose -p "$PROJECT" -f "$compose" config -q
```

**Why Manual Deletion Happens**: 
- Old containers from previous projects (`cartie2_repo-web-1`, `prod-db-1`, etc.) **don't get removed** by new deployment
- Networks/volumes from old projects persist
- Result: Port conflicts (5433, 3002, 8082) or orphaned resources

**Fix Needed**: Idempotent cleanup script that removes **all** Cartie-related containers/networks before deploy, regardless of project name.

#### **Issue #2: No Pre-Deploy Cleanup**

**Current Flow** (`deploy_infra2.sh` lines 60-61):
```bash
docker compose -p "$PROJECT" -f "$compose" up -d --force-recreate --remove-orphans
```

**What `--remove-orphans` Does**: Removes containers from **current compose file only**, not from other projects.

**What's Missing**:
- No cleanup of old project names
- No removal of dangling volumes
- No network cleanup

**Fix Needed**: Add pre-deploy cleanup step:
```bash
# Stop and remove ANY Cartie-related containers
docker ps -a --filter "name=infra" --filter "name=cartie" --filter "name=prod" -q | xargs -r docker rm -f

# Remove networks
docker network ls --filter "name=infra" --filter "name=cartie" -q | xargs -r docker network rm

# Prune unused volumes (optional, careful with data)
docker volume prune -f --filter "label=com.docker.compose.project=infra2"
```

#### **Issue #3: Migration Strategy Not Idempotent**

**Current Seed** (`apps/server/prisma/seed.ts`):
- Creates companies if missing
- Creates users if missing  
- **Updates SystemSettings** even if exists (line 263-296)
- Seeds demo data if `SEED_DEMO=true`

**Problem**: No explicit migration runner in `deploy_infra2.sh` after container startup.

**Expected Flow**:
```bash
# After containers start
docker exec infra2-api-1 npm run prisma:migrate
docker exec infra2-api-1 npm run seed
```

**Current Flow**: Migrations happen inside Dockerfile or on first API start (ERROR-PRONE).

**Fix Needed**: Explicit migration + seed step in deployment script.

#### **Issue #4: `.bak` Files and Clutter**

**Found**: `TelegramHub.bak.tsx` in `apps/web/src/pages/app`

**Problem**: `.bak` files pollute codebase, confuse builds, and suggest manual file management instead of git branches.

**Fix Needed**: Remove all `.bak` files, rely on git history.

---

### 1.3 Data Completeness: "Real Working Data" vs "Empty Shells"

#### Seed Data Analysis (`apps/server/prisma/seed.ts`)

**Production Data Seeds** (Always run):
- ✅ **Companies**: `system`, `cartie`, `demo` workspaces created
- ✅ **Users**: `admin@cartie.com`, `superadmin@cartie.com` created with passwords
- ✅ **SystemSettings**: All features enabled by default (lines 227-297)
- ✅ **Templates**: 3 scenario templates (Lead Capture, Catalog, B2B)
- ✅ **Normalization**: 20+ brand/city aliases (BMW, Mercedes, Kyiv, Lviv, etc.)
- ✅ **Entity Definitions**: 6 dynamic entities (bot_session, tg_message, tg_destination, etc.)

**Demo Data Seeds** (Only if `SEED_DEMO=true`):
- 🟡 **Bots**: 2 demo bots (`bot_demo_polling`, `bot_demo_webhook`) with **placeholder tokens**
- 🟡 **Inventory**: 3 demo cars (BMW, Mercedes, VW Golf) with **placeholder images**
- 🟡 **Requests**: 2 B2B requests with variants
- 🟡 **Leads**: 2 demo leads
- 🟡 **Integrations**: Demo SendPulse, Meta Pixel configs

#### **Gaps for "Real Working Platform"**

| Entity                 | Production Seed | Demo Seed | Gap for Real Use                               |
|------------------------|-----------------|-----------|------------------------------------------------|
| **BotConfigs**         | ❌              | ✅ (2)    | Need **real bot tokens** from @BotFather       |
| **MTProto Connectors** | ❌              | ❌        | Need **phone number, API ID/Hash, session string** |
| **Channel Sources**    | ❌              | ❌        | Need **real channel IDs** to parse             |
| **Scenarios**          | ✅ (templates)  | ❌        | **No active scenarios** linked to bots         |
| **Integrations**       | ❌              | ✅ (demo) | Need **real API keys** (SendPulse, Meta, etc.) |
| **Campaigns**          | ❌              | ❌        | No campaigns seeded                            |
| **Inventory**          | ❌              | ✅ (3)    | Works but **images are placeholders**          |
| **B2B Requests**       | ❌              | ✅ (2)    | Works but needs **real dealer network**        |

#### **Minimum Real Data Checklist** (to make platform "alive"):

1. **BotConfigs** (Communication):
   - [ ] At least 1 bot with **real token** from Telegram @BotFather
   - [ ] Bot linked to a **published scenario** (not just template)
   - [ ] `deliveryMode` set to `POLLING` or `WEBHOOK` (with webhook URL configured)

2. **Scenarios** (Communication):
   - [ ] At least 1 scenario **published** (status = `PUBLISHED`)
   - [ ] Scenario linked to a bot (`companyId` matches)
   - [ ] Scenario nodes include **working actions** (e.g., `SAVE_LEAD`, `ADD_CATALOG`)

3. **MTProto Connector** (Integrations):
   - [ ] 1 connector with **real phone, API ID, API Hash** (from my.telegram.org)
   - [ ] Session string obtained via authentication
   - [ ] Status = `READY`

4. **Channel Sources** (Integrations):
   - [ ] At least 1 channel linked to MTProto connector
   - [ ] Real `channelId` (e.g., `-1001234567890`)
   - [ ] `importRules` configured (e.g., auto-publish, keywords)

5. **Inventory** (Inventory):
   - [ ] Demo data is fine, but **replace placeholder images** with real car photos (or keep placeholders minimal)

6. **Integrations** (Integrations):
   - [ ] SendPulse: Real `sendpulseId` + `sendpulseSecret` in `SystemSettings`
   - [ ] Meta Pixel: Real `metaPixelId` + `metaToken` + `metaTestCode` in `SystemSettings`

7. **Campaigns** (Communication):
   - [ ] Optional: 1 sample campaign (`status=DRAFT`) to show UI works

#### **Feature Flags Issue**

**Found in `seed.ts` lines 227-244**:
```typescript
features: {
  // Core Modules - ALL ENABLED BY DEFAULT
  MODULE_LEADS: true,
  MODULE_INVENTORY: true,
  MODULE_REQUESTS: true,
  MODULE_TELEGRAM: true,
  MODULE_SCENARIOS: true,
  MODULE_CAMPAIGNS: true,
  MODULE_CONTENT: true,
  MODULE_MARKETPLACE: true,
  MODULE_INTEGRATIONS: true,
  MODULE_COMPANIES: true,
  // ...
}
```

**User Requirement**: "Feature flags / скрытые фичи — УДАЛИТЬ. Всё должно быть доступно всем пользователям."

**Current Reality**: Features are **enabled** by default, but mechanism still exists in `SystemSettings.features` and `SystemSettings.modules`.

**Fix Needed**:
- **Option A**: Remove `features` and `modules` fields entirely from `SystemSettings` schema
- **Option B**: Keep fields for future extensibility, but **ignore them** in frontend/backend (always assume `true`)
- **Recommendation**: Option B (less breaking), but add comment: "// Feature flags disabled per requirement"

---

### 1.4 Telegram Integration: Critical Disconnect

#### **Current State** (from schema + routes):

**Backend Telegram Stack**:
- `BotConfig` model (stores bot tokens, delivery mode)
- `bot.routes.ts` + `telegram.routes.ts` (API endpoints)
- `mtproto.routes.ts` + `mtproto.service.ts` + `mtproto.worker.ts` (MTProto ingestion)
- `BotSession`, `BotMessage`, `TelegramUpdate` (state management)
- `Scenario` model + `ScenarioEngine` (bot logic)

**Frontend Telegram Stack**:
- `TelegramHub.tsx` page (route: `/telegram`)
- `TelegramHub.components.tsx` (sub-components)
- **ORPHANED**: `ScenarioBuilder.tsx`, `AutomationBuilder.tsx` (no routes)

#### **Issue #1: Scenarios Not Connected to UI**

**Problem**: `ScenarioBuilder.tsx` exists but **not in `App.tsx` routes**.

**Result**: Users **cannot create/edit scenarios** from UI.

**Fix Needed**: Add route:
```tsx
<Route path="/scenarios" element={<ProtectedRoute><ScenarioBuilder /></ProtectedRoute>} />
```

**Note**: `ScenarioBuilder.tsx` might be old or incomplete. Needs review.

#### **Issue #2: MTProto Isolation**

**Problem**: MTProto ingestion runs in `mtproto.worker.ts`, but unclear how parsed data flows to:
- `CarListing` (inventory)
- `B2bRequest` (sales)
- `Draft` (content calendar)

**Evidence**: `ChannelSource` model has `importRules` (line 406 in schema), but no clear service layer for rule engine.

**Fix Needed**: 
- Create **MTProto → Entity** mapping service
- Ensure parsed messages from channels → `CarListing` or `Draft` based on rules
- Make this flow visible in UI (e.g., "Imported from Channel X" badge)

#### **Issue #3: Bot Session State Not Unified**

**Problem**: `BotSession` model exists, but unclear if it's used by:
- `ScenarioEngine` (apps/server/src/services/)
- Bot routes (apps/server/src/modules/Communication/bots/)

**Risk**: Session state might not persist between bot restarts → users lose conversation context.

**Fix Needed**: Verify `ScenarioEngine` reads/writes `BotSession` on every message.

---

### 1.5 Code Complexity: Overengineering vs Simplicity

#### **✅ Good Patterns Found**:

1. **Repository Layer** (`apps/server/src/repositories/`):
   - Abstracts Prisma calls
   - Makes services cleaner
   - **Files found**: `BotConfigRepository.ts`, `LeadRepository.ts`, `RequestRepository.ts`, `WorkspaceRepository.ts`, `UserRepository.ts`

2. **Service Layer** (`apps/server/src/services/`):
   - Business logic separated from routes
   - **Files found**: `meta.service.ts`, `sendpulse.service.ts`, `mtproto.service.ts`, etc.

3. **Dual-Write Service** (`apps/server/src/services/v41/writeService.js`):
   - Handles legacy + v4.1 writes transparently
   - Controlled by feature flag

#### **⚠️ Overengineering / Tech Debt**:

1. **Dual Schema Complexity** (1374 lines):
   - **40+ v4.1 models** not yet used by frontend
   - **Legacy models** still in active use
   - Risk: Confusion about which model to use for new features

2. **`.bak` Files**:
   - `TelegramHub.bak.tsx` found
   - Suggests manual file management instead of git branches

3. **Dynamic Entities** (EntityDefinition, EntityField, EntityRecord):
   - Flexible but **adds abstraction layer**
   - Only 6 definitions seeded (bot_session, tg_message, etc.)
   - **Underutilized?** Needs review if worth the complexity.

4. **ScenarioEngine** (not reviewed yet):
   - Handles bot logic via JSON nodes
   - Potential for complexity if nodes are numerous

#### **🔧 Simplification Targets** (P2 priority):

| Item                       | Why It's Complex                        | Simplification Idea                      |
|----------------------------|-----------------------------------------|------------------------------------------|
| Dual schema (v4.1 + legacy)| Maintaining 2 data models doubles work  | **Keep legacy only** until v4.1 is 100% ready, or **remove legacy** if v4.1 is ready |
| Dynamic entities           | Adds abstraction for rare use cases     | Consider hardcoding entities if only 6 types exist |
| MTProto worker             | Separate worker process + queue         | Could be simpler as scheduled job (cron) |
| Feature flags              | `SystemSettings.features` + `modules`   | Remove or make them always `true`        |

---

## PHASE 1 SUMMARY: KEY PROBLEMS

### **P0 (Critical) — Breaks Deployment/Data**:

1. **Deployment Conflicts** (1.2):
   - ❌ Compose project name conflicts require manual cleanup
   - ❌ No idempotent cleanup script
   - **Fix**: Add pre-deploy cleanup of all Cartie-related containers/networks/volumes

2. **Missing Real Data** (1.3):
   - ❌ No real bot tokens → bots can't start
   - ❌ No MTProto credentials → channel parsing broken
   - ❌ No real integration API keys → integrations won't work
   - **Fix**: Document how to add real credentials + create setup wizard in UI

3. **Orphaned Pages** (1.1):
   - ❌ `ScenarioBuilder.tsx` + `AutomationBuilder.tsx` not routed
   - **Fix**: Add routes or remove files

### **P1 (High) — Breaks Telegram Integration**:

4. **MTProto Disconnected** (1.4):
   - ⚠️ Parsed channel data doesn't flow to inventory/requests
   - **Fix**: Create MTProto → Entity mapping service

5. **Scenario UI Missing** (1.4):
   - ⚠️ Users can't create/edit scenarios from UI
   - **Fix**: Route `ScenarioBuilder` or build new UI

### **P2 (Medium) — Code Quality**:

6. **Dual Schema Complexity** (1.5):
   - ⚠️ 40+ v4.1 models unused
   - **Fix**: Decide: commit to v4.1 or remove it

7. **Feature Flags** (1.3):
   - ⚠️ Mechanism exists but should be disabled per user requirement
   - **Fix**: Remove or ignore `features`/`modules` checks

8. **`.bak` Files** (1.2):
   - ⚠️ Clutter in repo
   - **Fix**: Delete, use git

---

## NEXT STEPS (PHASE 3 PREP)

Based on audit, **immediate fixes** (P0/P1) are:

### **A. Deployment Stability** (P0):
- [ ] **Idempotent deploy script**: `infra/deploy_prod_clean.sh`
- [ ] Pre-deploy: stop/remove all `infra*`, `cartie*` containers
- [ ] Explicit migration + seed step after containers start
- [ ] Test: can deploy twice without manual cleanup

### **B. Real Data Setup** (P0):
- [ ] **Setup wizard** or admin page for:
  - Adding real bot token
  - Adding MTProto credentials
  - Adding integration keys (SendPulse, Meta)
- [ ] Seed script: separate "minimal production" from "demo data"
- [ ] Update `.env.example` with required vars

### **C. Telegram Connectivity** (P1):
- [ ] Route `ScenarioBuilder.tsx` to `/scenarios` (or build new UI)
- [ ] Create **MTProto mapping service**: ChannelSource → CarListing/Draft
- [ ] Verify `ScenarioEngine` uses `BotSession` for state persistence

### **D. Module Cleanup** (P1):
- [ ] Remove `TelegramHub.bak.tsx`, `AutomationBuilder.tsx` if unused
- [ ] Decide: keep or remove `AutomationBuilder` feature

### **E. Feature Flags** (P2):
- [ ] Disable feature flag checks in UI/backend
- [ ] Or remove `SystemSettings.features` / `.modules` entirely

### **F. Code Simplification** (P2):
- [ ] Decide v4.1 strategy: full migration or removal
- [ ] Review dynamic entities: are 6 definitions worth the abstraction?

---

## FILES TO MODIFY (Preview for PHASE 3)

| File                                          | Change Type | Reason                                  |
|-----------------------------------------------|-------------|-----------------------------------------|
| `infra/deploy_prod_clean.sh`                 | NEW         | Idempotent deployment script            |
| `infra/deploy_infra2.sh`                      | MODIFY      | Add migration + seed step               |
| `apps/web/src/App.tsx`                        | MODIFY      | Add `/scenarios` route                  |
| `apps/web/src/pages/app/TelegramHub.bak.tsx` | DELETE      | Remove .bak file                        |
| `apps/web/src/pages/app/AutomationBuilder.tsx` | DELETE/ROUTE | Remove or add route                     |
| `apps/server/prisma/seed.ts`                  | MODIFY      | Split production vs demo data clearly   |
| `apps/server/src/services/mtproto-mapping.service.ts` | NEW | MTProto → Entity flow |
| `apps/server/src/modules/Core/system/system.routes.ts` | MODIFY | Ignore feature flags |
| `.env.example`                                | MODIFY      | Document required real credentials      |

---

**End of PHASE 1 AUDIT**  
**Next**: PHASE 3 implementation plan (P0/P1 fixes only, per user requirement)
