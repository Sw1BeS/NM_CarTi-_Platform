# Module Map

This document maps the Frontend Pages (User Experience) to the Backend Modules (Code & Data).

## 1. Core Modules

| Frontend Route | Page Component | Backend Module Path | Key API Endpoints | Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| `/login` | `Login.tsx` | `modules/Core/auth` | `POST /api/auth/login`, `GET /api/auth/me` | Authentication & Session Hydration. |
| `/` (Dashboard) | `Dashboard.tsx` | `modules/Core/auth`, `modules/Sales/requests` | `GET /api/stats` (needs creation/check) | High-level metrics (Leads, Requests, Revenue). |
| `/inbox` | `InboxPage.tsx` | `modules/Communication/telegram` | `GET /api/messages`, `POST /api/messages/send` | Chat interface, Lead creation from chat. |
| `/leads` | `Leads.tsx` | `modules/CRM/Leads` | `GET /api/leads` | List and manage raw contacts. |
| `/requests` | `RequestList.tsx` | `modules/Sales/requests` | `GET /api/requests` | Buy/Sell deal flow management. |
| `/inventory` | `InventoryPage.tsx` | `modules/Inventory/inventory` | `GET /api/inventory` | Vehicle database & ingestion. |
| `/content` | `ContentPage.tsx` | `modules/Communication/telegram` | `GET /api/drafts` | Social media post editor. |
| `/calendar` | `ContentCalendarPage.tsx` | `modules/Communication/telegram` | `GET /api/drafts` | Scheduled posts view. |
| `/telegram` | `TelegramHub.tsx` | `modules/Communication/bots` | `GET /api/bots` | Bot connection & Channel settings. |
| `/partners` | `PartnersPage.tsx` | `modules/Core/companies` | `GET /api/companies/partners` | B2B Dealer network management. |

## 2. Shared/Support Modules

| Module | Purpose | Location |
| :--- | :--- | :--- |
| **BotEngine** | Unified sending logic (text, photo, car card). | `apps/web/src/services/botEngine.ts` |
| **Parser** | HTML/Text parsing for inventory. | `apps/server/src/services/parser.ts` |
| **MTProto** | Telegram Client API (Userbot) for ingestion. | `apps/server/src/modules/Integrations/mtproto` |
| **Prisma** | Database ORM & Client. | `apps/server/src/services/prisma.ts` |

## 3. Intersections & Dependencies

*   **Inbox <-> Leads:** Inbox depends on `Lead` existence to show context. `enrichContext` middleware in backend ensures this link.
*   **Requests <-> Inventory:** Requests (Buy) need Inventory items as `RequestVariant`.
*   **Inventory <-> Content:** Inventory items can be converted to `Draft` for publishing.
*   **Partners <-> Requests:** Requests can be assigned to Partners (B2B).

## 4. Technical Debt Hotspots (To Fix)

*   **`apiRoutes.ts`**: The "God Router" currently handles `bots`, `messages`, `leads`, `drafts` directly. These should ideally be in their respective modules, but for Release, we will stabilize them in place or move critical parts if they break.
*   **Auth Context**: The frontend expects a rich User object, but `/me` returns a thin JWT payload. This causes white screens/errors on refresh.
