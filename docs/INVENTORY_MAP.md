# Artifact 1: Inventory Map

## 1. System Topology
- **Frontend App**: `apps/web` (React + Vite + Tailwind)
- **Backend API**: `apps/server` (Node.js + Express + Prisma)
- **Database**: PostgreSQL (Prisma Schema with Multi-tenancy)

## 2. Frontend Inventory (`apps/web/src/pages`)

| Module | Route | Component File | Status | Notes |
|--------|-------|================|========|-------|
| **Public** | `/login` | `public/Login.tsx` | OK | Auth entry point |
| | `/p/request` | `public/PublicRequest.tsx` | OK | Lead gen form |
| | `/p/dealer` | `public/DealerPortal.tsx` | OK | Dealer access |
| | `/p/proposal/:id`| `public/ClientProposal.tsx`| OK | Client review view |
| | `/p/app` | `public/MiniApp.tsx` | OK | Telegram Mini App |
| **Core** | `/` | `app/Dashboard.tsx` | OK | Main stats |
| | `/inbox` | `app/Inbox.tsx` | OK | Unified msg center |
| | `/settings` | `app/Settings.tsx` | OK | User prefs |
| | `/company` | `app/CompanySettings.tsx`| OK | Tenants/Workspace |
| | `/health` | `app/Health.tsx` | OK | System status |
| **Business**| `/requests` | `app/Requests.tsx` | OK | B2B Requests |
| | `/leads` | `app/Leads.tsx` | OK | CRM Leads |
| | `/inventory` | `app/Inventory.tsx` | OK | Car listings |
| | `/companies` | `app/Companies.tsx` | OK | Partners/Dealers |
| **Automation**| `/scenarios` | `app/ScenarioBuilder.tsx`| Complex| Visual flow builder |
| | `/telegram` | `app/TelegramHub.tsx` | OK | Bot management |
| | `/automation` | `app/AutomationBuilder.tsx`| OK | Triggers/Workflows |
| **Data** | `/search` | `app/Search.tsx` | OK | External parsing |
| | `/entities` | `app/Entities.tsx` | Beta | Dynamic entities |
| | `/content` | `app/Content.tsx` | OK | CMS |
| | `/calendar` | `app/ContentCalendar.tsx`| OK | Social scheduling |
| **Admin** | `/integrations`| `app/Integrations.tsx` | OK | 3rd party connections |
| | `/marketplace` | `app/Marketplace.tsx` | OK | Templates/Plugins |
| | `/superadmin` | `superadmin/*` | Secured| System-wide control |

## 3. Backend Inventory (`apps/server/src/modules`)

| Domain | Module | Service File | Key Responsibilities |
|--------|--------|--------------|----------------------|
| **Core** | `Core/system` | `systemLog.service.ts` | Logging, Auditing |
| **Integrations**| `Integrations`| `integration.service.ts`| Integration Manager |
| | | `meta/meta.service.ts` | Facebook Pixel/CAPI |
| | | `mtproto/*` | Telegram Client API |
| **Communication**| `Communication/bots`| `bot.service.ts` | Bot Orchestrator |
| | `Communication/telegram`| `telegram.service.ts`| Official Bot API |
| **Inventory** | `Inventory/inventory`| `inventory.service.ts`| Car CRUD |
| | `Inventory/normalization`| `normalization.service.ts`| Data cleanup |
| **Data** | `Prisma` | `schema.prisma` | DB Definition |

## 4. Integration Points
- **Meta (Facebook)**: `Integrations/meta` (Implemented, requires Env)
- **Telegram (Official)**: `Communication/telegram` (Implemented)
- **Telegram (MTProto)**: `Integrations/mtproto` (For scraping/user-bot)
- **SendPulse**: Defined in Enum but **Missing Implementation**
- **Autoria**: `Integrations/autoria.service.ts` (External car source)

## 5. Environment Variables & Config
- **Auth**: `JWT_SECRET`
- **Database**: `DATABASE_URL`
- **Meta**: `META_PIXEL_ID`, `META_ACCESS_TOKEN`
- **Telegram**: `BOT_TOKEN`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`
- **System**: `NODE_ENV`, `PORT`
