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
🔘 Moved tracked archive `docs/_archive/2026-01-22_pre-audit` out of git to `/srv/cartie/_archive/2026-01-22_pre-audit`
🔘 Added .gitignore patterns for backups/dumps/tmp and `_archive`
🔘 Untracked `env/*.bak*` moved to `/srv/cartie/_archive/env/`

## Phase 1 — Audit Against User Remarks (A–F)

### A) Mini App black screen
📌 Root cause
🔘 No explicit empty-config state; config could be missing and render path was ambiguous
🔘 No server log to trace config request
📌 Fixes
🔘 Server log added for `/miniapp/config` requests: `apps/server/src/routes/miniAppRoutes.ts`
🔘 UI warning banner when config is missing (fallback config still loads): `apps/web/src/pages/public/MiniApp.tsx`
📌 QA
🔘 Open `/p/app/:slug` in browser and Telegram WebApp; verify visible content and no black screen
🔘 If bot has no miniapp config, see warning banner

### B) Scenarios/menus mismatch
📌 Root cause
🔘 B2B flow is hard-coded and did not respect ScenarioEngine menu toggles
📌 Fixes
🔘 Routing bypass for B2B to keep hard flow active: `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
🔘 B2B menu stays consistent with built-in template (Variant 1 chosen for release)
📌 QA
🔘 `/start` shows B2B menu and “Є авто” flow works without ScenarioEngine config

### C) Рассылки через бота не работают
📌 Root cause
🔘 Telegram Bot API does not fetch relative media URLs
📌 Fixes
🔘 Normalize media URLs with `PUBLIC_BASE_URL` or bot config in:
🔘 `apps/server/src/modules/Integrations/integration.service.ts`
🔘 `apps/server/src/workers/content.worker.ts`
📌 QA
🔘 Publication job posts with photo succeed; on failure job is marked FAILED and logged

### D) MTProto parsing issues
📌 Root cause
🔘 DRAFT_ONLY mode still attempted media downloads
🔘 Year/price/currency parsing had regex cross-line contamination and unit edge cases
📌 Fixes
🔘 DRAFT_ONLY uses `refs_only` media policy: `apps/server/src/modules/Integrations/mtproto/mtproto.import.worker.ts`
🔘 Robust line-by-line parsing, year fix, currency map (incl. `у.е.`), mileage and price fixes: `apps/server/src/services/enhanced-parsing.utils.ts`
🔘 QA script updated to use enhanced parser: `apps/server/src/scripts/mtproto_qa.ts`
📌 QA
🔘 `npx tsx src/scripts/mtproto_qa.ts` → 7/7 passed

### E) Inventory cards (единый формат)
📌 Root cause
🔘 Multiple rendering paths with inconsistent formatting and contact leakage risk
📌 Fixes
🔘 Unified card renderer with optional contact visibility: `apps/server/src/services/cardRenderer.ts`
🔘 Admin-only includes contact/company: `apps/server/src/modules/Communication/bots/scenario.engine.ts`
🔘 DTOs support contact only when explicitly requested: `apps/server/src/services/dto.ts`
📌 QA
🔘 Channel/public responses do not include contacts
🔘 Admin receives full card with contact/company

### F) Third-party parsing “не работает”
📌 Root cause
🔘 Parsing UI visible, backend connector not production-ready
📌 Fixes
🔘 UI gated behind `VITE_PARSER_ENABLED`: `apps/web/src/services/parserClient.ts`, `apps/web/src/pages/app/Inventory.tsx`, `apps/web/src/pages/app/Search.tsx`
📌 QA
🔘 If `VITE_PARSER_ENABLED=false`, parser UI is disabled and shows a clear message

## Phase 2 — Data Model + Migrations
📌 Added fields for B2B variants (contact/company/media/status history)
🔘 Prisma: `apps/server/prisma/schema.prisma`
🔘 Migration: `apps/server/prisma/migrations/20260210170000_add_variant_contact_media/migration.sql`
🔘 Repository + DTO updates: `apps/server/src/repositories/request.repository.ts`, `apps/server/src/services/dto.ts`

## Phase 3 — Repo Hygiene
📌 Removed tracked archives from repo and updated ignore rules
📌 No duplicate app modules detected; backup patterns added to `.gitignore`

## Phase 4 — QA Checklist (see docs/QA_RELEASE_CHECKLIST.md)
📌 MTProto parser QA run stored in `_logs/mtproto_qa_2026-02-10.txt`

## Release Summary (Required Output Protocol)
1️⃣ ✅ What is already accounted for
✅ B2B flow works end-to-end with admin-only contacts, unified card rendering, and persisted variant metadata
✅ Mini App config endpoint logged; UI shows warning when config missing
✅ MTProto parsing now passes QA cases; DRAFT_ONLY avoids media download
✅ Publishing pipeline normalizes media URLs for Telegram

2️⃣ 📌 Gaps / missing coverage
📌 Third-party parser connector not implemented (UI now gated)
📌 Full E2E Telegram QA requires live bot/channel execution

3️⃣ 📌 Overbuild / premature work
📌 ScenarioEngine for B2B kept out of release (hard flow retained)

4️⃣ 📌 Next steps (priority order) + DoD
1️⃣ Add live bot QA run in production channel
🔘 DoD: request → offer → author fit → admin receives contact verified in logs
2️⃣ Confirm Mini App config for each bot
🔘 DoD: `/miniapp/config` log appears and warning banner absent

5️⃣ 📌 Assumptions + how to verify
📌 Assumption: `PUBLIC_BASE_URL` is set for Telegram media fetch
🔘 Verify: publish a post with image and confirm it renders in channel
