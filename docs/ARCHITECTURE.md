# CARTIE PLATFORM ARCHITECTURE

**Last Updated**: 2026-01-22  
**Repository**: `/srv/cartie/apps/cartie2_repo`

---

## SYSTEM OVERVIEW

Cartie is a multi-tenant B2B automotive platform with Telegram integration for lead generation, inventory management, and dealer collaboration.

### Tech Stack

| Layer       | Technology                              |
|-------------|-----------------------------------------|
| **Frontend**| React 19 + Vite + Tailwind CSS v4      |
| **Backend** | Node.js + Express + TypeScript          |
| **Database**| PostgreSQL 15 (via Prisma ORM)          |
| **Queue**   | None (future: BullMQ recommended)       |
| **Infra**   | Docker Compose + Caddy reverse proxy    |
| **Deployment** | Single VPS (127.0.0.1:5433/3002/8082)|
| **Production** | https://cartie2.umanoff-analytics.space/ |

---

## MODULE ARCHITECTURE

### Backend Modules (`apps/server/src/modules`)

```
modules/
├── Core/                  # Auth, Companies, System, Templates, Superadmin
│   ├── auth/              → JWT authentication
│   ├── companies/         → Workspace management
│   ├── system/            → Settings, navigation, feature flags (DISABLED)
│   ├── templates/         → Scenario templates (marketplace)
│   └── superadmin/        → Cross-workspace admin functions
│
├── Communication/         # Telegram bots, messaging, scenarios
│   ├── bots/              → BotConfig CRUD, bot management
│   ├── telegram/          → Telegram Bot API integration (polling/webhook)
│   └── (scenarios handled by ScenarioEngine in services/)
│
├── Integrations/          # External services
│   ├── integration/       → Generic integration CRUD
│   ├── mtproto/           → MTProto channel parsing (worker-based)
│   ├── meta/              → Meta Pixel / CAPI events
│   ├── sendpulse/         → SendPulse email/SMS
│   ├── viber/             → Viber messaging
│   ├── whatsapp/          → WhatsApp Business API
│   └── autoria/           → Autoria API (car listings)
│
├── Inventory/             # Car catalog
│   └── inventory/         → CarListing CRUD, search, filters
│
└── Sales/                 # B2B requests, variants, channel posts
    └── requests/          → B2bRequest CRUD, RequestVariant, ChannelPost
```

**Total Routes**: 11 (auth, companies, system, templates, superadmin, bot, telegram, integration, mtproto, inventory, requests)

---

### Frontend Pages (`apps/web/src/pages/app`)

| Page                | Route          | Backend Module    | Description                          |
|---------------------|----------------|-------------------|--------------------------------------|
| Dashboard.tsx       | `/`            | Multiple          | Analytics, KPIs, recent activity     |
| Login.tsx           | `/login`       | Core/auth         | JWT login                            |
| TelegramHub.tsx     | `/telegram`    | Communication     | Bots, campaigns, MTProto connectors  |
| **ScenarioBuilder.tsx** | `/scenarios` | Communication | Visual flow builder for bot logic |
| **AutomationBuilder.tsx** | `/automations` | Communication | ReactFlow-based automation (demo) |
| Leads.tsx           | `/leads`       | Communication     | Lead inbox, status management        |
| Inbox.tsx           | `/inbox`       | Communication     | Unified message inbox                |
| Requests.tsx        | `/requests`    | Sales             | B2B request tracking                 |
| Inventory.tsx       | `/inventory`   | Inventory         | Car catalog                          |
| Integrations.tsx    | `/integrations`| Integrations      | Meta, SendPulse, MTProto setup       |
| Content.tsx         | `/content`     | Communication     | Draft content management             |
| ContentCalendar.tsx | `/calendar`    | Communication     | Schedule posts                       |
| Companies.tsx       | `/companies`   | Core              | Workspace switcher (multi-tenant)    |
| Settings.tsx        | `/settings`    | Core              | User settings                        |
| CompanySettings.tsx | `/company`     | Core              | Workspace settings                   |
| Marketplace.tsx     | `/marketplace` | Core              | Scenario template library            |
| Search.tsx          | `/search`      | Inventory/Sales   | Global search                        |
| Health.tsx          | `/health`      | Core              | System health dashboard              |
| Entities.tsx        | `/entities`    | Core              | Dynamic entities (CRUD)              |
| QAStageA.tsx        | `/qa`          | Superadmin        | QA testing panel                     |

**Public Pages**: `/p/request`, `/p/app` (Mini App), `/p/dealer`, `/p/proposal/:id`

---

## DATA MODEL

### Multi-Tenant Foundation (v4.1 — IN PROGRESS)

**Purpose**: Planned multi-workspace, multi-account architecture with fine-grained permissions.

**Status**: ⚠️ **Dual-write enabled** but **not fully used by frontend**. Feature flag `USE_V4_DUAL_WRITE` controls writes.

**Models**:
- `Workspace` (tenant) → (legacy: `Company`)
- `GlobalUser` (cross-workspace user) → (legacy: `User`)
- `Account` (sub-workspace, e.g., dealer accounts)
- `Membership` (user-workspace-account roles/permissions)
- `EntityType`, `FieldDefinition`, `Record`, etc. (40+ models for flexible data)

**Legacy Models** (CURRENTLY IN USE):
- `BotConfig`, `Lead`, `BotMessage`, `BotSession`, `Scenario`, `Campaign`
- `B2bRequest`, `RequestVariant`, `ChannelPost`, `MessageLog`
- `CarListing`, `Draft`
- `MTProtoConnector`, `ChannelSource`
- `Integration`, `PartnerCompany`, `PartnerUser`
- `SystemSettings`, `SystemLog`
- `EntityDefinition`, `EntityField`, `EntityRecord` (dynamic entities)

**Decision Needed**: Commit to v4.1 migration OR remove dual-write and keep legacy only (see `docs/PLAN.md` P2.1).

---

## SERVICE LAYERS

### Repository Layer (`apps/server/src/repositories`)

**Purpose**: Abstract Prisma calls, make services testable.

**Files**:
- `BotConfigRepository.ts`
- `LeadRepository.ts`
- `RequestRepository.ts`
- `WorkspaceRepository.ts`
- `UserRepository.ts`

**Pattern**: Services call repositories instead of `prisma.*` directly (~80% adoption).

### Service Layer (`apps/server/src/services`)

**Key Services**:
- `ScenarioEngine`: Executes bot flows (nodes → actions)
- `meta.service`: Meta CAPI event tracking
- `sendpulse.service`: Email/SMS via SendPulse
- `mtproto.service`: MTProto client management
- `mtproto.worker`: Background channel parsing (⚠️ separate process)
- `v41/writeService`: Dual-write orchestrator (legacy + v4.1)

---

## TELEGRAM INTEGRATION

### Bot System

**Flow**:
1. User messages bot (@YourBot)
2. Telegram sends update → Polling worker OR Webhook endpoint
3. `ScenarioEngine` loads scenario, executes nodes
4. Bot responds via Telegram Bot API

**Components**:
- `BotConfig` (model): Stores token, delivery mode, channel ID
- `bot.routes.ts` + `telegram.routes.ts`: CRUD APIs
- `ScenarioEngine` (service): Interprets `Scenario.nodes` (JSON)
- `BotSession` (model): Persists user conversation state

**Node Types**: MESSAGE, QUESTION_TEXT, QUESTION_CHOICE, CONDITION, ACTION, SEARCH_CARS, GALLERY, CHANNEL_POST, etc.

### MTProto Channel Parsing

**Purpose**: Parse Telegram channels for car listings → auto-import to `CarListing`.

**Flow**:
1. Admin creates `MTProtoConnector` (phone, API ID/Hash, session string)
2. Admin adds `ChannelSource` (channel ID, import rules)
3. `mtproto.worker` polls channel messages
4. ⚠️ **TO ADD**: `mtproto-mapping.service` to convert messages → `CarListing` (see `docs/PLAN.md` P1.4)

**Current Gap**: Parsed data doesn't flow to inventory. Needs mapping service.

---

## DEPLOYMENT

### Infrastructure (`infra/`)

**Files**:
- `docker-compose.cartie2.prod.yml`: Defines 3 services (db, api, web)
- `deploy_prod.sh` (**NEW**, idempotent): Cleanup → Build → Migrate → Seed → Health checks
- `deploy_infra2.sh` (OLD): Fast-forward-only git pull + compose up
- `Dockerfile.api`, `Dockerfile.web`: Build images
- `Caddyfile`: Reverse proxy (web:8080 → api:3001)

**Services**:
- `infra2-db-1`: Postgres on 127.0.0.1:5433
- `infra2-api-1`: Node.js API on 127.0.0.1:3002
- `infra2-web-1`: Caddy + React build on 127.0.0.1:8082

**External**: Caddy on host proxies `cartie2.umanoff-analytics.space` → `127.0.0.1:8082`

### Deployment Flow (`deploy_prod.sh`)

1. **Cleanup**: Stop/remove all `infra*`, `cartie*`, `prod*` containers and networks
2. **Pull**: `git merge --ff-only origin/main`
3. **Build**: `docker compose build api web`
4. **Start**: `docker compose up -d`
5. **Migrate**: `docker exec infra2-api-1 npm run prisma:migrate`
6. **Seed**: `docker exec infra2-api-1 npm run seed` (idempotent)
7. **Health**: Curl `/health` endpoints
8. **Prune**: `docker image prune`

**Idempotency**: Can run multiple times without manual cleanup.

---

## FEATURE FLAGS (DISABLED)

**User Requirement**: "Feature flags — УДАЛИТЬ. Всё должно быть доступно всем пользователям."

**Current State**:
- `SystemSettings.features` field exists but **all values set to `true`**
- `SystemSettings.modules` field exists but **all modules enabled**
- ⚠️ **No code checks these fields** (should be ignored in UI/backend)
- **Purpose**: Kept for backward compatibility, but effectively disabled

**Recommendation**: Remove checks in frontend/backend or document as "always true".

---

## KEY GAPS & PRIORITIES

### P0 (Critical)
- ✅ **Deployment conflicts**: Fixed via `deploy_prod.sh` (idempotent cleanup)
- ✅ **Orphaned pages**: `/scenarios` and `/automations` now routed
- ⚠️ **Real data missing**: No real bot tokens, MTProto creds, integration keys (see `docs/SETUP_CREDENTIALS.md`)

### P1 (High Priority)
- ⚠️ **MTProto → Inventory flow**: Parsed channel messages don't create `CarListing` (need `mtproto-mapping.service`)
- ⚠️ **Scenario UI**: `/scenarios` route added, but UX may need polish

### P2 (Tech Debt)
- ⚠️ **Dual schema complexity**: 40+ v4.1 models unused. Decision needed: migrate or remove.
- ⚠️ **Dynamic entities**: `EntityDefinition` abstraction used for only 6 types. Consider simplification.

---

## RECOMMENDED ARCHITECTURE CHANGES

### Short-Term (Next Sprint)
1. **MTProto Mapping Service** (`apps/server/src/services/mtproto-mapping.service.ts`):
   - Parse Telegram messages → extract car data
   - Apply `ChannelSource.importRules` (filters, auto-publish)
   - Create `CarListing` entries → visible in inventory

2. **Seed Data Split** (`prisma/seed.production.ts` + `seed.demo.ts`):
   - Production: companies, users, templates, normalization (**no demo tokens**)
   - Demo: sample bots, inventory, requests (**only if `SEED_DEMO=true`**)

3. **Credentials Setup Wizard** (Admin UI):
   - Add BotConfig with real token
   - Add MTProto connector (phone, API ID/Hash)
   - Add integration keys (SendPulse, Meta)
   - Test connectivity

### Mid-Term (Next Month)
4. **Decide v4.1 Strategy**:
   - **Option A**: Remove v4.1 models, keep legacy
   - **Option B**: Full migration to v4.1 (rewrite services/UI)
   - **Option C**: Keep dual-write indefinitely (not recommended)

5. **Background Queue** (BullMQ + Redis):
   - Replace `mtproto.worker` with job queue
   - Handle long-running tasks (channel parsing, campaign sending)
   - Retry logic, failure tracking

6. **Event Bus** (Internal):
   - Publish events: `LeadCreated`, `RequestPublished`, `CarImported`
   - Subscribers: Meta CAPI, SendPulse, internal analytics

### Long-Term (Roadmap)
7. **API Gateway**: Unified REST/GraphQL API layer
8. **WebSocket**: Real-time updates for inbox, leads, requests
9. **Multi-Workspace UI**: Account switcher, cross-workspace analytics

---

## FILE STRUCTURE REFERENCE

```
apps/cartie2_repo/
├── apps/
│   ├── server/                   # Backend (Node.js + Express)
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point
│   │   │   ├── middleware/       # Auth, workspace, error handling
│   │   │   ├── modules/          # Core, Communication, Integrations, Inventory, Sales
│   │   │   ├── repositories/     # Data access layer
│   │   │   ├── services/         # Business logic, ScenarioEngine, mtproto
│   │   │   ├── routes/           # Express routers
│   │   │   ├── utils/            # Helpers, constants
│   │   │   ├── validation/       # Zod schemas
│   │   │   └── workers/          # Background workers (mtproto)
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # DB schema (1374 lines, dual structure)
│   │   │   ├── seed.ts           # Main seed orchestrator
│   │   │   └── seeds/            # Production scenarios, normalization
│   │   └── package.json
│   │
│   └── web/                      # Frontend (React + Vite)
│       ├── src/
│       │   ├── App.tsx           # Router, protected routes
│       │   ├── components/       # Layout, NotFound, shared UI
│       │   ├── pages/            # app/ (protected), public/ (open), superadmin/
│       │   ├── services/         # API client, data layer, telegram API
│       │   ├── contexts/         # Auth, Company, Language, Toast, Worker, Theme
│       │   ├── types/            # TypeScript interfaces
│       │   ├── translations.ts   # i18n strings
│       │   └── index.css         # Tailwind CSS v4
│       └── package.json
│
├── infra/                        # Docker infrastructure
│   ├── docker-compose.cartie2.prod.yml  # Project: infra2
│   ├── deploy_prod.sh            # Idempotent deployment (NEW)
│   ├── deploy_infra2.sh          # Legacy deployment
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── Caddyfile                 # Reverse proxy config
│
├── docs/                         # Documentation
│   ├── AUDIT.md                  # Platform audit (PHASE 1)
│   ├── PLAN.md                   # Implementation plan (P0/P1/P2)
│   └── ARCHITECTURE.md           # This file
│
├── scripts/                      # Utility scripts
│   ├── smoke_read.sh
│   └── smoke_write.sh
│
└── .env.example                  # Environment variables template
```

---

## CONTACT & DEPLOYMENT INFO

- **Production**: https://cartie2.umanoff-analytics.space/
- **API Health**: http://127.0.0.1:3002/health
- **Web Health**: http://127.0.0.1:8082/api/health
- **DB**: postgres://127.0.0.1:5433/cartie_db
- **Logs**: `/srv/cartie/_logs/`
- **Data**: `/srv/cartie/data/cartie2/postgres/`

---

**Last Review**: 2026-01-22  
**Next Review**: After P0/P1 fixes completed (see `docs/PLAN.md`)
