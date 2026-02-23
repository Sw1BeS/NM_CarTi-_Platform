# Plan: Telegram Bots + MiniApp Stabilization (2026-02-23)

## Objectives
1. Нормализовать TG chat IDs и устранить маршрутные ошибки.
2. Исправить group/admin UX (кнопки в группах + menu button consistency).
3. Завершить B2B multi-tenant routing и whitelist onboarding.
4. Вернуть identity-поля в Inbox/Leads DTO/UI.
5. Довести MiniApp scroll/back/visual consistency до стабильного состояния.

## P0/P1 Roadmap (ordered)

### Commit 01 — Audit + Plan docs
- Files:
  - `docs/audit_telegram_bots_2026-02-23.md`
  - `docs/plan_telegram_bots_2026-02-23.md`
- Migrations: none
- API changes: none
- QA: сверка с live Bot API/DB фактами

### Commit 02 — Chat ID normalization + channel URL consistency
- Files:
  - `apps/server/src/modules/Communication/telegram/core/utils/telegramChatId.ts` (new)
  - `apps/server/src/modules/Communication/telegram/core/utils/telegramChatId.test.ts` (new)
  - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts`
  - `apps/server/src/services/mtproto-mapping.service.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/setup.actions.ts`
  - `apps/server/src/routes/legacyBots.routes.ts`
  - `apps/server/scripts/telegram_normalize_chat_ids.ts` (new)
  - `apps/server/package.json`
- Migrations:
  - data migration script only (no Prisma schema changes yet)
  - updates `BotConfig.channelId/adminChatId` only for live-verified IDs
  - recalculates `channelPostUrl`
- API changes:
  - none (backward-compatible)
- Tests:
  - unit ID conversion + URL generation
- QA:
  - run script `--dry-run`, then `--apply`
  - verify `getChat` and generated `t.me/c/...` links

### Commit 03 — Group/admin UX
- Files:
  - `apps/server/src/modules/Communication/telegram/core/types.ts`
  - `apps/server/src/modules/Communication/telegram/scenarios/middlewares/enrichContext.ts`
  - `apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts` (new)
  - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/adapters/telegram.adapter.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/update-handler.ts`
  - `apps/server/src/modules/Communication/bots/bot.service.ts`
  - `apps/server/src/routes/legacyBots.routes.ts`
- Migrations: none
- API changes:
  - none, deterministic keyboard behavior by chat type
- Tests:
  - private => reply keyboard
  - group/supergroup => inline keyboard with bot deeplink + miniapp action
- QA:
  - `/start` in DM and admin groups
  - verify buttons visible
  - verify `setChatMenuButton` updates

### Commit 04 — B2B multi-tenant routing + whitelist approve/reject
- Files:
  - `apps/server/prisma/schema.prisma`
  - `apps/server/prisma/migrations/<timestamp>_partner_admin_group_chat_id/*` (new)
  - `apps/server/src/services/b2bRouting.service.ts` (new)
  - `apps/server/src/services/b2bRouting.service.test.ts` (new)
  - `apps/server/src/services/b2bWhitelist.service.ts`
  - `apps/server/src/services/b2bWhitelist.service.test.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/b2b.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/dealer-flow.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/callback.actions.ts`
- Migrations:
  - add `PartnerCompany.adminGroupChatId String?` + index
  - backfill partner chat mapping where possible
- API changes:
  - callback actions: `b2b_access_approve`, `b2b_access_reject`
  - bot config keys: `config.b2b.centralQueueChatId`, `config.b2b.centralRelayBotId`
- Tests:
  - routing decisions (partner-only + central relay)
  - whitelist approve auto-create partner/user
  - contact redaction checks
- QA:
  - request -> channel -> variant -> FIT/NOT_FIT -> partner+central queues
  - unauthorized -> request access -> approve/reject

### Commit 05 — Identity restore in Inbox/Leads DTO/UI
- Files:
  - `apps/server/src/services/dto.ts`
  - `apps/server/src/routes/legacyMessaging.routes.ts`
  - `apps/server/src/modules/Communication/telegram/core/leadService.test.ts`
  - `apps/server/src/modules/Communication/telegram/core/leadIdentity.test.ts`
  - `apps/web/src/types/bot.types.ts`
  - `apps/web/src/types/entities.types.ts`
  - `apps/web/src/pages/app/Inbox.tsx`
  - `apps/web/src/pages/app/Leads.tsx`
- Migrations: none
- API changes:
  - `/messages` and `/leads` return optional identity fields:
    - `telegramUserId`, `telegramUsername`, `telegramName`, `telegramChatId`
    - `username`, `firstName`, `lastName`, `fromId`
- Tests:
  - enrichment keeps single lead when username appears later
- QA:
  - Inbox and Leads display identity values

### Commit 06 — MiniApp polish (scroll/back/premium)
- Files:
  - `apps/web/src/pages/public/MiniApp.tsx`
  - `apps/web/src/pages/public/miniapp/telegramViewport.ts` (new)
  - `apps/web/src/pages/public/miniapp/navigation.ts` (new)
  - `apps/web/src/index.css`
- Migrations: none
- API changes: none
- Tests:
  - web has no unit runner; use build smoke + manual QA
- QA:
  - stable viewport variable `--tg-viewport-height`
  - correct inner scroll container
  - unified `goBack()` + Telegram BackButton
  - mobile/desktop validation in Telegram context

### Commit 07 — QA checklist docs
- Files:
  - `docs/qa_telegram_bots_2026-02-23.md`
  - update `docs/plan_telegram_bots_2026-02-23.md`
- Migrations: none
- API changes: none
- Tests: checklist + run commands

## Execution commands
1. `cd apps/server && npm run prisma:generate && npm run prisma:migrate`
2. `cd apps/server && npm test`
3. `cd apps/web && npm run build`
4. `cd apps/server && npm run telegram:normalize-chat-ids -- --dry-run`
5. `cd apps/server && npm run telegram:normalize-chat-ids -- --apply`

## Execution status (2026-02-23)
1. Commit 01: `8d5cb06` (done)
2. Commit 02: `da70f42` (done)
3. Commit 03: `ed567fa` (done)
4. Commit 04: `ac87680` (done)
5. Commit 05: `b3f8584` (done)
6. Commit 06: `0b5d50e` (done)
7. Commit 07: done (this commit)

Verification runs in this workspace:
1. `npm run prisma:generate && npm run prisma:migrate` — PASS (`No pending migrations to apply`)
2. `npm test` — PASS (`27` files, `67` tests)
3. `npm run telegram:normalize-chat-ids -- --dry-run` — PASS (idempotent)
4. `npm run telegram:normalize-chat-ids -- --apply` — PASS (idempotent)
5. `cd apps/web && npm run build` — PASS

## Constraints / defaults
1. Canonical IDs only from live verification (`getChat` + updates).
2. Webhook contract preserved; no forced mode switch from polling.
3. Central queue uses relay via `@Cartie_Client_Bot` because B2B bot lacks access to `-1003785260526`.
4. Contacts never posted to channel/group, admin-only where required.
5. Minimal architecture changes only.

---

## Recheck Implementation Status (2026-02-23)

### C01 — Re-audit docs + runtime evidence
- Added: `docs/audit_telegram_bots_recheck_2026-02-23.md`
- Status: done

### C02 — Deploy gate hardening
- Updated:
  - `infra/deploy_prod.sh` (post-migrate sync + live verify gates)
  - `infra/prod_verify.sh` (all enabled bots + live verify chaining)
  - `infra/verify_telegram_live.sh` (new hard gate script)
  - `docs/qa_telegram_release_gates_2026-02-23.md`
- Status: done

### C03 — B2B hard cut (remove dual-mode runtime path)
- Updated:
  - `apps/server/src/config/env.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/update-handler.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/entry.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/helpers.ts`
  - `apps/server/src/modules/Communication/bots/bot.service.ts`
- Status: done

### C04 — B2B routing/privacy enforcement
- Updated:
  - `apps/server/src/services/b2bRouting.service.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/b2b.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/dealer-flow.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/callback.actions.ts`
  - Tests:
    - `apps/server/src/services/b2bRouting.service.test.ts`
    - `apps/server/src/services/cardRenderer.test.ts`
- Status: done

### C05 — Identity quality + backfill
- Updated:
  - `apps/server/src/services/dto.ts`
  - `apps/server/src/routes/legacyMessaging.routes.ts`
  - `apps/server/scripts/backfill_telegram_identity.ts` (new)
  - `apps/server/package.json` script: `telegram:backfill-identity`
- Runtime:
  - executed `npm run telegram:backfill-identity -- --apply`
  - last 14 days `missing telegramName` reduced to `0`
- Status: done

### C06 — MiniApp wave 1 (raw cleanup + UX polish)
- Updated:
  - `apps/web/src/pages/public/MiniApp.tsx` (removed `alert`/debug logs/mock profile activity)
  - `apps/web/src/pages/public/DealerPortal.tsx` (removed `alert` + event/toast feedback)
  - `apps/web/src/pages/public/miniapp/telegramViewport.ts`
  - `apps/web/src/index.css`
  - `apps/web/src/components/ui/Toast.tsx` (new)
- Status: done

### C07 — MiniApp wave 2 (structure)
- Added:
  - `apps/web/src/pages/public/miniapp/MiniAppShell.tsx`
  - `apps/web/src/pages/public/miniapp/views/ProfileView.tsx`
  - `apps/web/src/pages/public/miniapp/views/RequestView.tsx`
- Updated:
  - `apps/web/src/pages/public/MiniApp.tsx` as orchestrator + composed views/shell
- Status: done

### C08 — Final QA + release report
- Added:
  - `docs/qa_telegram_bots_2026-02-23-recheck.md`
- Status: done

## Recheck command results
1. `cd apps/server && npm test` — PASS (`28` files, `70` tests)
2. `cd apps/web && npm run build` — PASS
3. `bash infra/verify_telegram_live.sh` — PASS
4. `bash infra/prod_verify.sh` — PASS
5. `cd apps/server && npm run telegram:backfill-identity -- --dry-run` — PASS
6. `cd apps/server && npm run telegram:backfill-identity -- --apply` — PASS
