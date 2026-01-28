# Cartie Platform Audit & Fix Plan (2025 Edition)

## A) Executive Summary

1.  **Critical Stability Risk:** Telegram clients (MTProto) are stored in-memory (`Map<string, TelegramClient>`). Server restarts kill all user sessions, requiring manual re-login or complex reconnect logic.
2.  **Deployment Downtime:** The current `deploy_prod.sh` script explicitly runs `docker compose down` before `up`, causing unnecessary 1-2 minute outages during every update. **(FIXED)**
3.  **Data Model Split:** The platform is in a "split brain" state between Legacy models (`Lead`, `CarListing`) and the new v4.1 Generic Model (`Record`, `EntityType`), confusing development and data integrity.
4.  **Security/Auth:** Feature flags (`FEATURE_FLAGS`) are technically present but force-enabled in seeds. They add noise and should be removed for a "feature-complete" product.
5.  **Marketplace:** The module exists in the codebase but is intentionally restricted/hidden from the user routes.
6.  **Infrastructure:** The project uses `node:22-bookworm-slim` (good) and Alpine for Postgres (good).
7.  **Best Practice Gap:** No separate "Worker" service for MTProto. Heavy Telegram operations run on the main API thread, risking blocking HTTP requests.
8.  **Logging:** `MTProtoService` uses `level: 'error'` logger, making production debugging of "lost messages" impossible.
9.  **Idempotency:** Telegram Webhook handlers lack explicit `update_id` deduplication, risking double-processing if Telegram retries events.
10. **Build Speed:** Dockerfiles copy `apps/server` *before* `npm install`, defeating layer caching and slowing down builds significantly. **(FIXED)**

---

## 0) Best Practices Research (2025 Snippet)

*   **Node/TS Backend:** Use **Vertical Slice Architecture** (by Feature) rather than horizontal (Controller/Service/Repo). Each module (e.g., `Communication/telegram`) should own its data access. Avoid global "God Services".
*   **Prisma in Prod:** Run `prisma migrate deploy` in the `CMD` entrypoint script or a specific "init container", *not* in the Dockerfile build (it requires DB access).
*   **Telegram Webhook:** Always check `X-Telegram-Bot-Api-Secret-Token`. Store processed `update_id` in Redis or DB with a 24h TTL to prevent replay attacks/retries.
*   **MTProto/GramJS:**
    *   **Storage:** Use `StringSession` stored in an encrypted DB field.
    *   **Lifecycle:** The client should be managed by a separate **Worker Process** (e.g., BullMQ worker) to avoid blocking the Express API.
    *   **Reconnect:** Implement an "Auto-Reconnect Manager" that loads all active sessions from DB on worker startup.
*   **Monorepo Deploy:** Do not tear down (`down`). Use `docker compose up -d --build --no-deps <service>` to perform rolling updates. Use Caddy/Nginx as a reverse proxy to hold connections during the switch.

---

## 1) Audit & Evidence Map

### 1.1 Repository Structure
*   **Root:** `/srv/cartie`
*   **Backend:** `apps/server` (Express/Prisma)
*   **Frontend:** `apps/web` (Vite/React)
*   **Infra:** `infra/` (Docker, Scripts)

### 1.2 Backend Issues
*   **Mixed Responsibility:** `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts` directly calls `telegramOutbox.sendMessage` and `prisma.lead.update`. It mixes routing, business logic, and DB access.
    *   *Evidence:* `import { telegramOutbox } from '../messaging/outbox/telegramOutbox.js';` inside routing file.
*   **In-Memory State:** `apps/server/src/modules/Integrations/mtproto/mtproto.service.ts`
    *   *Evidence:* `private static clients: Map<string, TelegramClient> = new Map();`
*   **Feature Flags:** `apps/server/src/utils/constants.ts` and usage in `apps/server/prisma/seed.ts`.
    *   *Evidence:* `if (FEATURE_FLAGS.USE_V4_DUAL_WRITE) ...`

### 1.3 Frontend Issues
*   **Restricted Modules:** `Marketplace.tsx` exists but is correctly hidden as per business requirements.
*   **Routing:** Uses `HashRouter` (Legacy). Should be `BrowserRouter`.

### 1.4 TG Integration
*   **Webhook:** Logic scattered across `apps/server/src/modules/Communication/telegram`. No central "WebhookService" ensuring idempotency.
*   **MTProto:**
    *   **Client Creation:** On-demand in `getClient()`.
    *   **Session Storage:** `StringSession` in `MTProtoConnector` table (Good).
    *   **Risk:** No mechanism to "Revive" connections on server restart.

### 1.5 Infra/Deploy
*   **Downtime Script:** `infra/deploy_prod.sh` (WAS broken, now FIXED).
    *   *Previous:* `docker compose ... down --remove-orphans`.
    *   *Current:* `docker compose ... up -d --build --remove-orphans`.
*   **Slow Builds:** `infra/Dockerfile.api` (WAS broken, now FIXED).
    *   *Previous:* `COPY apps/server ./` before install.
    *   *Current:* Optimized layer caching.

---

## 2) Root Causes

*   **Integrity:** The platform grew organically. Legacy "Leads" were never fully migrated to the new "Contacts/Deals" system, leaving two sources of truth. The code tries to write to both (Dual Write), doubling complexity.
*   **Deployment:** The script used `down` likely because of past issues with "orphaned containers" or network conflicts.
*   **Data:** The `seed.ts` is overly complex, trying to support both Legacy and v4 systems simultaneously via feature flags.

---

## 3) Fix Plan (Consolidated)

### Phase 1: Stabilization (Completed/In Progress)
1.  **Fix Deploy Script:** `infra/deploy_prod.sh` updated to remove `down`. **(DONE)**
2.  **Docker Optimization:** Dockerfiles optimized for caching. **(DONE)**

### Phase 2: Integrity & Cleanup (Days 4-7)
1.  **Remove Feature Flags:** Hardcode all features to `true` in logic, remove `FEATURE_FLAGS` constant usage.
2.  **Unified Data:** Run the migration scripts (created in previous task) to move all Leads to Contacts. Switch `LeadRepository` to read from `Record` table.

### Phase 3: Telegram Refactor (Days 8-10)
1.  **Implement `MTProtoConnectionManager`:** A service that runs on startup, fetches all "CONNECTED" connectors, and initializes clients.
2.  **Extract Worker:** Move `MTProtoService` to a separate `worker.ts` process (optional but recommended).

---

## 4) Telegram Integration Fix Plan

### 4.1 Bot API
*   **Action:** Create `TelegramWebhookService`.
*   **Mechanism:**
    *   Accept incoming POST.
    *   Calculate Hash of `body` + `update_id`.
    *   Check `Redis` (or `Prisma` cache table) for this Hash.
    *   If exists -> return 200 OK immediately.
    *   If new -> Process -> Store Hash -> Return 200 OK.
*   **Location:** `apps/server/src/modules/Communication/telegram/services/webhook.service.ts`

### 4.2 MTProto (GramJS) Architecture
*   **Problem:** Clients die on restart.
*   **Solution:** **"Always-On" Session Manager.**
    *   Create `MTProtoLifeCycle` class.
    *   Method `initAll()`: Query `DB.MTProtoConnector.findMany({ where: { status: 'CONNECTED' } })`.
    *   Loop -> `MTProtoService.connect(connector.id)`.
    *   Call `initAll()` in `apps/server/src/index.ts` after DB connection.

### 4.3 Architecture
*   **Adapter:** `TelegramBotAdapter` (wraps HTTP calls), `MTProtoAdapter` (wraps GramJS).
*   **Facade:** `CommunicationFacade`. The rest of the app calls `CommunicationFacade.sendMessage()`, not caring if it goes via Bot or Userbot.

---

## 5) Module-to-Page Coverage

| Module | UI Route (`App.tsx`) | API Route | DB Entity (Legacy/v4) | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | `/` | `/api/dashboard` | - | ✅ OK |
| **Inbox (Leads)** | `/inbox` | `/api/leads` | `Lead` / `Contact` | ✅ OK |
| **Inventory** | `/inventory` | `/api/inventory` | `CarListing` / `Record` | ✅ OK |
| **Requests (B2B)**| `/requests` | `/api/b2b/requests`| `B2BRequest` | ✅ OK |
| **Telegram Hub** | `/telegram` | `/api/telegram/*` | `BotConfig`, `BotSession` | ✅ OK |
| **Scenarios** | `/scenarios` | `/api/scenarios` | `Scenario`, `Template` | ✅ OK |
| **Content** | `/content` | `/api/content` | `Draft`, `ChannelPost` | ✅ OK |
| **Marketplace** | **N/A** | `/api/marketplace`| `ScenarioTemplate` | 🚫 **RESTRICTED** |
| **Integrations** | `/integrations` | `/api/integrations`| `Integration` | ✅ OK |
| **Companies** | `/companies` | `/api/companies` | `Workspace` | ✅ OK |

---

## 6) Ready-to-Use Improvements

1.  **Fast Deploy:**
    *   *What:* Update `deploy_prod.sh`.
    *   *Effect:* Reduces downtime from 60s to <5s.
    *   *Command:* `bash infra/deploy_prod.sh` (already updated).

2.  **Starter Pack Seeds:**
    *   *What:* A script to inject 5 Real Scenario Templates (Lead Gen, Catalog, Support) and 50 Real Car Models (BMW, Audi) into `NormalizationAlias`.
    *   *Effect:* System looks "live" immediately.

3.  **Liveness Probe:**
    *   *What:* Simple endpoint `/health/deep` that tries `prisma.$queryRaw('SELECT 1')`.
    *   *Effect:* Docker auto-restarts broken containers.

---

## 7) What to do RIGHT NOW (Top 10 Actions)

1.  **Fix Deploy Script:** **DONE.**
2.  **Optimize Backend Dockerfile:** **DONE.**
3.  **Optimize Frontend Dockerfile:** **DONE.**
4.  **Enable Persistent MTProto:**
    Edit `apps/server/src/index.ts`: Add `await MTProtoManager.initAll()` (need to create this simple loop).
5.  **Remove Feature Flags:**
    Edit `apps/server/src/utils/constants.ts`: Set all flags to `true` or remove the object entirely and fix imports.
6.  **Add Healthcheck Endpoint:**
    Verify `GET /health` in `apps/server/src/index.ts` checks DB connectivity.
7.  **Run Migration Scripts:**
    Run `npm run migrate:v4:inventory` on the server to normalize data.
8.  **Clear Old Images:**
    Run `docker image prune -a` to free up space from old builds.
9.  **Verify Logs:**
    Check `docker logs -f infra2-api-1` to ensure no startup errors.

---

## 8) Commands for Verification

**Audit:**
```bash
# Check for feature flags
grep -r "FEATURE_FLAGS" apps/server/src
```

**Deploy Verification:**
```bash
# Run the optimized deploy
bash infra/deploy_prod.sh

# Check uptime (should not reset)
docker ps
```

**Telegram Verification:**
```bash
# Check if clients are initialized (look for log)
docker logs infra2-api-1 | grep "MTProto"
```

---

## 9) 2026-01-28 Release Audit Plan (Updated)

### Order Requested (user override: “2, 1, 3, then everything else”)
1. **Bot Menu Editor** — stability/UX (black screen, menu editing)
2. **Dashboard navigation** — broken/illogical links
3. **Scenario module** — visual polish
4. **Remaining modules** — Inbox/Requests, Mini App, Integrations/Partners/Settings, Content/Calendar, Parser/Messenger

### Dashboard — Initial Findings
- Inbox KPI card routes to `/telegram` but should likely route to `/inbox`.
- Campaigns KPI routes to `/telegram` but doesn’t open Broadcasts tab; consider `?tab=CAMPAIGNS` + deep-link handling in TelegramHub.
- Content KPI routes to `/calendar` (ok). Requests/Inventory routes look correct.
  - **Fix applied in code**: `/inbox` and `/telegram?tab=CAMPAIGNS` + header “Broadcast” button adjusted.

### Bot Menu Editor — Initial Finding
- `BotMenuEditor` used `useRef` without importing it; runtime crash can cause a black screen.
  - **Fix applied in code**: added `useRef` import in `apps/web/src/modules/Telegram/components/BotMenuEditor.tsx`.

### Scenario Module — Visual Audit Notes (Initial)
- Nodes show very little summary for non‑text types (CONDITION/DELAY/SEARCH/CHANNEL_POST/BROADCAST), so the canvas feels “blank”.
- Selected node state isn’t visually obvious; quick highlight would improve readability.
- Long property panel is not grouped; heavy scrolling with mixed sections.

**Quick visual wins (low‑risk):**
- Show compact summaries in nodes:
  - CONDITION: `var op value`
  - DELAY: `ms`
  - SEARCH: `brand/model/budget/year`
  - CHANNEL_POST/BROADCAST/OFFER: destination/request vars
- Add selected‑node border/glow.
- Add placeholder text for empty message nodes (“No message”).

### Remaining Modules — Initial Findings & Customization Gaps
- **Mini App Manager**: actions are not editable (label/type/value/icon), only add/remove. Customization is limited to title/welcome/color/layout.
- **Public Mini App**: config always taken from first active bot; not tied to `slug` or bot’s default showcase. With multiple bots, config can mismatch showcase.
- **Audience Manager**: assumes `tags` exists; if missing/null from API, can crash when mapping.
- **Campaign Manager**: assumes `progress` object exists; missing progress can render NaN/throw.
- **Content vs Calendar**: templates stored in two places (server entity + localStorage); inconsistent UX and sharing.
- **Layout Nav**: integrations/partners/company routes exist but are hard‑hidden in nav; can feel “missing”.

### Inbox / Leads / Requests (Audit)
- Inbox loads messages per bot, but no loading state/error fallback; long fetch silently fails.
- Assign/select bot dropdown has no “All bots”; cross-bot chat history requires manual switching.
- Clear session button hard-reloads the page; UX rough.
- Request creation from chat sets `status: DRAFT` only; no modal for budget/year/priority; risk of incomplete requests.
- No pagination/virtualization for large chat lists; may lag with many chats.

### Inventory / Content / Calendar (Audit)
- Inventory page: filter button present, but panel not implemented (no filters UI); search only.
- Content vs Calendar: templates duplicated (entity `post_template` vs localStorage in calendar); risk of divergence.
- Content: posting uses first active bot/destination; no bot selector; could post to wrong bot.
- Content: no validation on scheduleDate timezone; uses `new Date(scheduleDate)` (local) — possible timezone drift.
- Calendar: bulk scheduler uses local storage templates; no server persistence; missing conflict detection (overwrites same time slot silently).

### Integrations / Settings / Entities / Company / Partners (Audit)
- IntegrationsLayout includes nav link to `/telegram` (cross-link) but main nav hides integrations entirely via feature flag override in Layout; discoverability low.
- Settings: several tabs are placeholders (DICT, BACKUP, API, VERSIONS). Users see empty content → confusing.
- Entities: no pagination; loads entire dataset; JSON render of object fields; no validation; delete has no undo.
- Company/Partners routes hidden in nav by override, though code exists.

---

## 10) New Requests & Gaps (2026-01-28)

- **Partners module:** keep visible in main layout; verify routes/components still functional and not gated by feature flags or roles. Ensure navigation entry stays in `MainLayout` alongside Integrations/Companies.
- **Parser for vehicle pages:** need a “URL-to-variables” extractor. Flow: user pastes a car detail URL → system scrapes/extracts fields (price, mileage, VIN, photos, specs) → presents detected variables with values → user maps or corrects fields → mapping cached per URL/domain so re-import skips the mapping step unless user re-runs it.
- **Messenger format coverage:** Telegram should support all native payloads (emoji, stickers, GIFs, voice/ogg, video, photos, documents). Audit both **Bot API** paths (`BotEngine.sendUnifiedMessage`) and UI (Inbox/Scenarios) to surface attach/send for these types. Avoid feature flags; expose in Settings where configuration is needed.
- **No feature flags / roles gating:** per request, do not hide modules behind flags; move any toggles into Settings where necessary.

---

## 11) Fix/Improvement Plan From Audit

1) **Bot Menu Editor (done in code)**  
   - Import fixes to prevent crash; keep testing for menu rendering edge cases.

2) **Dashboard navigation (done in code)**  
   - KPI cards route to `/inbox` and `/telegram?tab=CAMPAIGNS`; retain BrowserRouter deep links.

3) **Scenario module (done in code)**  
   - Node summaries, selected highlighting, message placeholders.

4) **Inbox/Requests (in progress)**  
   - Added loading/error + “All bots” selector + soft session clear. Next: request creation modal (budget/year), pagination/virtualization for large chat lists.

5) **Mini App + Showcase (done in code)**  
   - Public mini app picks config by `defaultShowcaseSlug`; action editor supports label/type/value/icon and scenario options.

6) **Integrations/Partners/Settings (done in code, needs verify)**  
   - Navigation unhidden; Settings tabs wired (Dictionaries/Backup/API/Versions). Verify Partners page functions without role/flag guards.

7) **Parser (planned)**  
   - Backend: add `/api/parser/preview` (fetch + extract via cheerio) and `/api/parser/mapping` (save mapping per domain + URL).  
   - Frontend: new Settings > Parser page to paste URL, view detected fields, map to entity schema, toggle “remember mapping”.  
   - Caching: store mapping keyed by domain/template; auto-apply on subsequent imports.

8) **Messenger format coverage (planned)**  
   - Backend: extend `BotEngine.sendUnifiedMessage` to accept `type: 'text' | 'photo' | 'video' | 'audio' | 'voice' | 'document' | 'animation' | 'sticker'`. Map to Telegram Bot API methods; add file-size guards.  
   - Frontend: Inbox composer attachments bar for file/photo/video/voice (record), GIF/sticker picker (use Tenor/Telegram sticker set), emoji already present.  
   - Storage: ensure uploads go through existing file service or TG file_id reuse to avoid storage bloat.

9) **Content/Calendar**  
   - Consolidate templates: single source (server). Calendar uses same templates; remove localStorage duplication; add conflict detection when scheduling overlapping times.

10) **Entities/Company**  
   - Add pagination + minimal validation; confirm delete confirms; keep Partners in main nav.

11) **Release hygiene**  
   - Keep `prisma validate`, web/server builds, routes smoke tests scripted; no feature flags introduced.

---

## 12) Immediate Next Actions (execution)

1. Verify Partners and Integrations pages render post-nav unhide; fix any missing imports/routes.  
2. Implement parser backend endpoints + Settings UI (minimal, no flags).  
3. Expand `BotEngine` + Inbox attachments UI for Telegram media types; reuse Telegram `file_id` when available.  
4. Add request creation modal + pagination to Inbox to finish in-progress item.  
5. Consolidate Content/Calendar templates to server source of truth.  
6. Run prisma validate/build/test + smoke scripts; update report with results.
