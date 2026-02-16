# RELEASE AUDIT REPORT — CarTié / CarDealer Lviv (2026-02-16, rev2)

## Scope
📌 End-to-end release hardening for B2B Telegram runtime, Mini App stability, MTProto parsing quality, publication pipeline, scheduler migration drift, and deterministic bot template presets.

## Phase 0 — Repo Map + Hygiene Snapshot
📌 Repo map (module → responsibility → intersections)
🔘 `apps/server` → Telegram runtime, MTProto import, B2B requests/variants, MiniApp API, workers, Prisma
🔘 `apps/web` → Admin UI + MiniApp public UI
🔘 `infra` → Caddy/compose/deploy scripts for production runtime
🔘 `storage` → media artifacts used by inventory/publication
🔘 `docs`, `scripts`, `verification` → release docs + smoke tooling

📌 Hygiene snapshot
🔘 No tracked backup/dump artifacts found in Git index
🔘 Ignore rules already cover `_archive`, `_logs`, `data`, `tmp`, backups, dumps
🔘 No duplicate app roots under `apps/*`

## Phase 1 — Audit Against A–F

### NEW) Template presets and scenario auto-binding (P0/P1)
📌 Root cause
🔘 Bot templates existed in UI but server-side auto-binding was incomplete and non-deterministic for new bots.

📌 Fixes
🔘 Added `TemplatePresetService` to apply presets on bot create/update (non-breaking)
🔘 Added additive API controls:
☑️ `applyPreset` (default `true`)
☑️ `forcePreset` (default `false`)
🔘 `CLIENT_LEAD` preset now ensures company scenarios (`buy/sell/status/lang`) and links menu buttons to actual scenario IDs
🔘 `B2B` preset now ensures hard-flow menu commands + B2B miniapp defaults
🔘 Added additive status fields in bot responses:
☑️ `presetStatus: ready|partial|missing`
☑️ `presetVersion`
🔘 Added "Reapply Preset" action in Telegram Hub bot settings UI

📌 Changed files
🔘 `apps/server/src/services/templatePreset.service.ts`
🔘 `apps/server/src/routes/apiRoutes.ts`
🔘 `apps/server/src/modules/Communication/bots/botDto.ts`
🔘 `apps/web/src/pages/app/TelegramHub.components.tsx`
🔘 `apps/web/src/types/bot.types.ts`

### A) Mini App black screen/errors
📌 Root causes
🔘 Browser preview executed write actions (`favorites`, `requests`) without Telegram `initData` and got `401`
🔘 Invalid Prisma lookup contracts in MiniApp bot resolution (`findUnique` with non-unique filters)
🔘 Hook-order violation in MiniApp component caused runtime crash in lead bot (`Minified React error #310`)

📌 Fixes
🔘 Preview mode made safe/read-only in MiniApp client: no write calls without Telegram context
🔘 Clear UI guidance for preview mode submission limits
🔘 Robust miniapp config parsing wrapper on client
🔘 Server-side MiniApp request logging added for config/favorites/requests
🔘 Prisma lookups corrected to valid contracts (`findFirst` for multi-filter checks)
🔘 Reordered hooks/conditional returns in `MiniApp.tsx` so hooks are always called consistently
🔘 Removed dynamic import race for config API call; now static import path
🔘 Added deterministic `isConfigLoading` flow and explicit unavailable state
🔘 Added fallback warning behavior instead of silent failure

📌 Changed files
🔘 `apps/web/src/pages/public/MiniApp.tsx`
🔘 `apps/web/src/services/miniappApi.ts`
🔘 `apps/server/src/routes/miniAppRoutes.ts`
🔘 `apps/server/src/services/miniapp.service.ts`

### B) Scenarios/menus mismatch
📌 Root cause
🔘 B2B is runtime hard-flow; menu/scenario editor is not source-of-truth for this specific flow

📌 Fixes
🔘 Explicit B2B runtime block added in Requests UI (visibility + operational counters)
🔘 Existing menu editor warning retained for B2B bots
🔘 Bot creation/settings now support two explicit templates: `CLIENT_LEAD` and `B2B`
🔘 Added default menu + MiniApp presets per template for fast setup

📌 Changed files
🔘 `apps/web/src/pages/app/Requests.tsx`
🔘 `apps/web/src/pages/app/TelegramHub.components.tsx`
🔘 `apps/web/src/services/defaults.ts`
🔘 `apps/web/src/types/bot.types.ts`

### C) Bot publications with media
📌 Root cause
🔘 Relative media URLs were passed to Telegram when public base URL was not resolvable

📌 Fixes
🔘 Media normalization hardened: relative URLs require `PUBLIC_BASE_URL`/bot `publicBaseUrl`
🔘 Clear deterministic error path for invalid relative media URLs
🔘 Jobs are explicitly marked `FAILED` with readable reason

📌 Changed files
🔘 `apps/server/src/modules/Integrations/integration.service.ts`
🔘 `apps/server/src/workers/content.worker.ts`

### D) MTProto parsing quality
📌 Root causes
🔘 Currency markers like `у.е.` were not consistently matched in price extraction
🔘 Thousand separators like `10.000` could be parsed as `10`
🔘 Year shorthand like `2019/20` in bot input could degrade into wrong range parsing

📌 Fixes
🔘 Enhanced parser regex + currency map expanded (`у.е.`, `уе`)
🔘 Number normalization fixed for dot/comma thousands cases
🔘 Added year range parser for Telegram bot flow (`2019/20` handled correctly)
🔘 Added tests for parsing + refs-only MTProto policy

📌 Changed files
🔘 `apps/server/src/services/enhanced-parsing.utils.ts`
🔘 `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
🔘 `apps/server/src/__tests__/enhanced-parsing.utils.test.ts`
🔘 `apps/server/src/modules/Integrations/mtproto/mtproto.service.test.ts`

### E) Inventory cards + contact privacy
📌 Root cause
🔘 Dealer contact/company could leak to requester in one B2B variant message path

📌 Fixes
🔘 Requester-facing variant message now strips both `contact` and `companyName`
🔘 Admin path keeps full card with contacts

📌 Changed files
🔘 `apps/server/src/modules/Communication/bots/scenario.engine.ts`

### F) Third-party parsing “dead feature”
📌 Current release decision
🔘 Keep feature gated by `VITE_PARSER_ENABLED` (disabled by default when env is absent)
🔘 Do not expose as guaranteed production-ready capability

## Phase 2 — Data Model + Migrations
📌 P0 fixed
🔘 Added missing migration for `ScheduledJob` table to resolve runtime scheduler drift

📌 Changed files
🔘 `apps/server/prisma/migrations/20260216133000_add_scheduled_job_table/migration.sql`
🔘 `apps/server/src/workers/scheduler.ts` (table-missing guard + graceful disable)

## Phase 3 — Repo Hygiene
📌 Completed in this cycle
🔘 Verified tracked tree for backup/dump artifacts: none found
🔘 Kept cleanup policy in `.gitignore` unchanged (already adequate)
🔘 Added release snapshot doc: `docs/RELEASE_BASELINE.md`

## Phase 4 — QA and Verification
📌 Executed checks
🔘 `npm --prefix apps/server run build` ✅
🔘 `npm --prefix apps/web run build` ✅
🔘 `npm --prefix apps/server run prisma:generate` ✅
🔘 `npm --prefix apps/server test -- src/__tests__/enhanced-parsing.utils.test.ts src/modules/Integrations/mtproto/mtproto.service.test.ts` ✅
🔘 `npm --prefix apps/server test` ✅ (31/31 passed)

📌 Deployment logic verification
🔘 `infra/deploy_prod.sh` kept as single source of truth
🔘 `infra/deploy_infra2.sh` and `infra/deploy_manual.sh` now delegate to canonical script
🔘 Flags added: `BRANCH`, `SKIP_PULL`, `RUN_SEED`, `ALLOW_DIRTY`
🔘 Added anti-stale asset routing check to deploy script (`/assets/*` missing file must not return `200`)
🔘 Production smoke passed (health + Telegram webhook verify)

## Release Protocol Summary
1️⃣ ✅ What is already accounted for
✅ MiniApp no longer throws runtime write errors in browser preview mode
✅ MiniApp server route logging improved and lookup contract fixed
✅ B2B UI now explicitly reflects hard-flow runtime behavior
✅ Publication worker/service fail clearly on unresolved relative media URLs
✅ MTProto parsing improved for `у.е.` and thousand separators
✅ Requester privacy fixed for dealer contact/company leakage
✅ ScheduledJob migration drift closed with migration + runtime guard
✅ MiniApp lead-bot crash (`#310`) fixed
✅ Template presets prepared for both bot types (Lead/B2B)
✅ Deploy entrypoints unified to remove infra script drift

2️⃣ 📌 Gaps / missing coverage
📌 Live production E2E (real bot/channel chats) still requires operator run-through
📌 Third-party parser remains feature-gated (not promoted to production feature)
📌 Production currently has one configured bot (`CLIENT_LEAD`); second bot (`B2B`) still needs real token + channel IDs

3️⃣ 📌 Overbuild / premature work
📌 No full ScenarioEngine migration for B2B in this release
📌 No monetization implementation in this release
📌 No broad architecture refactor; only P0/P1 stability edits

4️⃣ 📌 Next steps (priority order) + DoD
1️⃣ Apply migration + restart API/worker
🔘 DoD: scheduler logs no longer show `P2021` for `ScheduledJob`
2️⃣ Run live B2B Telegram E2E on production bot/channel
🔘 DoD: request → channel → offer → requester decision → admin routing works with no contact leak
3️⃣ Run MiniApp smoke in Telegram and browser preview
🔘 DoD: Telegram mode can submit/favorite; browser mode shows read-only guidance and no 401 UI errors
4️⃣ Validate publication job with relative `/media/...` source
🔘 DoD: either absolute URL normalization succeeds or job fails with explicit media-base-url error

5️⃣ 📌 Assumptions + verification
📌 ASSUMPTION: release path is direct on `main` with production deploy
🔘 Verification: smoke against production URL + build SHA + migration status

📌 ASSUMPTION: B2B remains hard-flow in runtime for this release
🔘 Verification: `/start` + `request` runtime behavior and channel button flow

📌 ASSUMPTION: parser stays gated
🔘 Verification: no active parser UI when `VITE_PARSER_ENABLED` is unset/false

## Prompt #1 — Data Collection for Next Iteration
```text
ЦЕЛЬ: релизная стабильность B2B Telegram + Mini App

1) ДАННЫЕ КАНАЛОВ/БОТОВ
- @bot_username:
- bot_id:
- admin_chat_id:
- request_channel_id:
- offer_channel_id (если есть):
- публичный домен Mini App:

2) ПРИМЕРЫ СООБЩЕНИЙ (5–10)
- примеры запросов
- примеры офферов “Є авто”
- эталон карточки
- скрины/логи ошибок

3) ПРАВИЛА ФОРМ
- обязательные поля request
- обязательные поля offer
- что скрывать от участников
- что показывать админу

4) ОГРАНИЧЕНИЯ
- что нельзя менять
- что можно упростить
- P0/P1 приоритеты

5) ОКРУЖЕНИЕ
- production URL
- доступ к логам
```
