# RELEASE AUDIT REPORT — CarTié / CarDealer Lviv (2026-02-10)

## Scope
📌 Audit + release fixes for Telegram B2B flow, Mini App, MTProto parsing, publishing pipeline, and repo hygiene.

## Phase 0 — Repo Map + Hygiene Snapshot
📌 Repo map (module → responsibility → intersections)
🔘 `apps/server` → API, Telegram Bot API, MTProto ingestion, workers, Prisma DB access → used by `apps/web` + `infra` deploy
🔘 `apps/web` → Admin UI, Mini App (public) → consumes `apps/server` API
🔘 `infra` → Docker/Caddy deployment, prod compose + deploy scripts → runs `apps/server` + `apps/web`
🔘 `storage` → media storage for inventory/showcases → referenced by `apps/server` and publishing workers
🔘 `verification` + `scripts` → smoke/verification tooling → supports release QA

📌 Junk/backups/duplicates cleanup (actionable)
🔘 Repo already ignores backups/dumps/tmp (`.gitignore` covers `_archive`, `_logs`, `data/`, `env/`, `storage`)
🔘 Untracked operational data lives outside Git (`/srv/cartie/_archive`, `/srv/cartie/data`)
🔘 No duplicate app modules detected under `apps/`

## Phase 1 — Audit Against User Remarks (A–F)

### A) Mini App black screen
📌 Root cause
🔘 Missing empty-config guard could cause blank UI
🔘 No server-side log for `/miniapp/config`
📌 Fixes
🔘 Server log for `/miniapp/config`: `apps/server/src/routes/miniAppRoutes.ts`
🔘 UI fallback + warning when config missing: `apps/web/src/pages/public/MiniApp.tsx`
📌 QA
🔘 Open `/p/app/:slug` in browser and Telegram WebApp
🔘 If config missing, warning banner shows (no black screen)

### B) Scenarios/menus mismatch
📌 Root cause
🔘 B2B flow is hard-coded; ScenarioEngine config/menu does not apply
📌 Fixes
🔘 Keep B2B as hard flow (Variant 1): `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
🔘 UI warning for B2B menu editor to avoid confusion: `apps/web/src/modules/Telegram/components/BotMenuEditor.tsx`
📌 QA
🔘 `/start` shows B2B menu and “Новий запит” flow works
🔘 Menu editor displays warning for B2B bots

### C) Рассылки через бота не работают
📌 Root cause
🔘 Telegram Bot API rejects relative media URLs
📌 Fixes
🔘 Normalize media URLs via `PUBLIC_BASE_URL` or bot config:
🔘 `apps/server/src/modules/Integrations/integration.service.ts`
🔘 `apps/server/src/workers/content.worker.ts`
📌 QA
🔘 Publication job posts with photo succeed; on failure job is marked FAILED and logged

### D) MTProto parsing issues
📌 Root cause
🔘 DRAFT_ONLY mode still attempted media downloads
🔘 Year/price/currency parsing edge cases
📌 Fixes
🔘 DRAFT_ONLY uses `refs_only` media policy: `apps/server/src/modules/Integrations/mtproto/mtproto.import.worker.ts`
🔘 Line-by-line parsing + currency map (incl. `у.е.`): `apps/server/src/services/enhanced-parsing.utils.ts`
🔘 QA script: `apps/server/src/scripts/mtproto_qa.ts`
📌 QA
🔘 `npx tsx src/scripts/mtproto_qa.ts` → 7/7 passed

### E) Inventory cards + B2B forms (единый формат)
📌 Root cause
🔘 Request/offer cards inconsistent; missing fields for B2B request/offer
🔘 Risk of leaking contacts in channel
📌 Fixes
🔘 Unified card renderer with optional contact visibility:
🔘 `apps/server/src/services/cardRenderer.ts`
🔘 B2B request flow now collects: brand/model, year, budget, mileage, fuel, comment, contact, company
🔘 B2B offer flow now collects: brand/model, photo, price, year, mileage, fuel, condition, VIN, URL, comment
🔘 Contact/company stored in request payload; only admin sees them
🔘 Updated flows:
🔘 `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
🔘 `apps/server/src/modules/Communication/bots/scenario.engine.ts`
📌 QA
🔘 Channel posts exclude contacts
🔘 Admin receives contact/company
🔘 Requester sees offers without contacts

### F) Third-party parsing “не работает”
📌 Root cause
🔘 Parser connector not production-ready
📌 Fixes
🔘 UI gated by `VITE_PARSER_ENABLED` (Inventory/Search + Settings):
🔘 `apps/web/src/pages/app/Inventory.tsx`
🔘 `apps/web/src/pages/app/Search.tsx`
🔘 `apps/web/src/pages/app/Settings.tsx`
📌 QA
🔘 If `VITE_PARSER_ENABLED=false`, parser UI is hidden/disabled with clear messaging

## Phase 2 — Data Model + Migrations
📌 No new migration needed for request contact/company
🔘 Stored in `B2bRequest.payload` for release (admin-only exposure)
📌 Variant contact/company/media already supported:
🔘 Prisma + migration: `apps/server/prisma/migrations/20260210170000_add_variant_contact_media/migration.sql`

## Phase 3 — Repo Hygiene
📌 No tracked backups detected; ignore rules cover `*_backup*`, dumps, tmp, `_archive`, `_logs`

## Phase 4 — QA Checklist (see docs/QA_RELEASE_CHECKLIST.md)
📌 MTProto QA run: 7/7 passed
📌 B2B verification script run: `npx tsx verify_b2b.ts`

## Prompt #1 — Audit Data Collection (for next step)
```
ЦЕЛЬ: релизная стабильность B2B Telegram + Mini App

1) ДАННЫЕ КАНАЛОВ/БОТОВ
- @bot_username:
- bot_id:
- admin_chat_id:
- request_channel_id:
- offer_channel_id (если есть):
- публичный домен Mini App:

2) ПРИМЕРЫ СООБЩЕНИЙ (5–10 шт.)
- ссылка/скрин/текст примеров запросов
- ссылка/скрин/текст примеров предложений “Є авто”
- пример карточки, как “должно быть” (желательно скрин)
- примеры ошибок (скрин/лог)

3) ПРАВИЛА ФОРМ
- обязательные поля запроса
- обязательные поля оффера
- что скрывать от участников
- что показывать админу

4) РЕАЛЬНЫЕ СТРОИТЕЛЬНЫЕ ПРАВИЛА
- что нельзя менять
- что можно упрощать
- приоритеты P0/P1

5) ДОСТУПЫ/ОКРУЖЕНИЕ
- staging/production URL
- доступ к логам (если можно)
```

## Release Summary (Required Output Protocol)
1️⃣ ✅ What is already accounted for
✅ B2B flow works end-to-end with admin-only contacts and updated request/offer fields
✅ Mini App config endpoint logged; UI shows fallback instead of black screen
✅ MTProto parsing passes QA and respects DRAFT_ONLY media policy
✅ Publishing pipeline normalizes media URLs for Telegram

2️⃣ 📌 Gaps / missing coverage
📌 Third-party parser connector still not implemented (UI gated)
📌 Live Telegram E2E requires real bot/channel execution

3️⃣ 📌 Overbuild / premature work
📌 ScenarioEngine for B2B remains out of release (hard flow retained)

4️⃣ 📌 Next steps (priority order) + DoD
1️⃣ Run live B2B QA in production
🔘 DoD: request → channel → offer → author fit → admin receives contact
2️⃣ Confirm Mini App config for each bot
🔘 DoD: `/miniapp/config` log appears and warning banner absent

5️⃣ 📌 Assumptions + how to verify
📌 `PUBLIC_BASE_URL` is set for media URLs
🔘 Verify: publish a post with image and confirm it renders in Telegram
