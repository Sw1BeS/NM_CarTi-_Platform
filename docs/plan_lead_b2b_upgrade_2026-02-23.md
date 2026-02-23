# Plan: Lead + B2B Bots & MiniApp Upgrade (2026-02-23)

## Target outcomes
1. Inventory-first architecture:
   - `CarListing` as source of truth
   - `Showcase` only view/filter layer
2. End-to-end UA user-facing language for both bots and MiniApp.
3. No contact leakage to public/B2B channel posts; contacts only in admin flows.
4. External search via HTML providers with policy guardrails.
5. B2B onboarding via two-branch registration with partner codes and invite/join handling.

## P0 (must complete)

### C01 docs(audit+plan)
- Create:
  - `docs/audit_lead_b2b_upgrade_2026-02-23.md`
  - `docs/plan_lead_b2b_upgrade_2026-02-23.md`

### C02 feat(prisma-core)
- Update `apps/server/prisma/schema.prisma`:
  - `CarListing`: `external`, `sourceProvider`, `partnerCompanyId` (+ relation/indexes)
  - `PartnerCompany`: `partnerCode`, `showcaseSlug`, `crmUrl`
  - `PartnerUser`: `role` (`OWNER|AGENT`)
  - new `SupportTicket` + `SupportTicketStatus` (`OPEN|CLOSED`)
- Add migration SQL:
  - `apps/server/prisma/migrations/<ts>_lead_b2b_upgrade_core/migration.sql`

### C03 feat(backfill)
- Add scripts:
  - `apps/server/scripts/backfill_partner_roles_codes_showcases.ts`
  - `apps/server/scripts/cleanup_external_hidden_listings.ts`
- Add npm scripts in `apps/server/package.json`.

### C04 feat(external-search-policy)
- Add module:
  - `apps/server/src/modules/Integrations/external-search/externalSearch.service.ts`
  - `.../providers/autoriaHtml.provider.ts`
  - `.../providers/olxHtml.provider.ts`
  - `.../policy/robotsPolicy.ts`
  - `.../policy/domainRateLimiter.ts`
  - `.../policy/backoff.ts`
  - `.../policy/cache.ts`
- Integrate in:
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-broadcast.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/session.actions.ts`

### C05 feat(form-primitives)
- Add universal form layer:
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/form.actions.ts` (new)
- Integrate in:
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-interaction.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/callback.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/session-flow.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/update-handler.ts`
- Behavior:
  - optional fields always expose `Пропустити`
  - before submit always show summary + `Підтвердити / Змінити / Скасувати`
  - `Змінити` shows `Змінити <поле>` for each summary row

### C06 feat(lead-menu-info-adminhelp)
- Update lead menu config:
  - `apps/server/src/services/templatePreset.service.ts`
- Update scenarios/info text (UA):
  - `apps/server/src/seeds/scenarioPack.ts`
- Register/admin command handling:
  - `apps/server/src/modules/Communication/bots/bot.service.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/update-handler.ts`
- Add bright prefixes to admin notifications:
  - `[LEAD BUY] [LEAD SELL] [SUPPORT] [B2B REG] [B2B AGENT] [B2B REQUEST] [B2B FIT] [EXTERNAL]`

### C07 feat(lead-buy-flow)
- Add:
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/client-buy.actions.ts`
- Update:
  - `apps/server/src/seeds/scenarioPack.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/callback.actions.ts`
- Behavior:
  - inventory-first search in `CarListing`
  - 1-3 batch cards
  - per-card inline: `✅ Цікавить це авто`, `⭐ Додати в обране`
  - post-batch controls: `Показати ще`, `Список обраних`, `Звʼязатися по обраних авто`, `Шукати ще`
  - admin-only partner/external annotations

### C08 feat(lead-sell-flow-admin-actions)
- Add:
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/client-sell.actions.ts`
- Update:
  - `apps/server/src/seeds/scenarioPack.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/callback.actions.ts`
- Idempotent admin actions via `IntegrationEventLog.idempotencyKey`.

### C09 feat(support-tickets)
- Add:
  - `apps/server/src/services/supportTicket.service.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/support.actions.ts`
- Update scenario definitions in `apps/server/src/seeds/scenarioPack.ts`.

### C10 feat(b2b-registration-v2)
- Add:
  - `apps/server/src/services/b2bRegistration.service.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/b2b-registration.actions.ts`
- Update gating/runtime:
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/update-handler.ts`

### C11 feat(telegram-invite-join)
- Add:
  - `apps/server/src/modules/Communication/telegram/core/telegramInvite.service.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeChatJoinRequest.ts`
- Update:
  - `apps/server/src/modules/Communication/telegram/core/telegramAdmin.service.ts` (`chat_join_request` in allowed updates)
  - pipeline wiring.

### C12 feat(b2b-core+inventory)
- Update:
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/b2b.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/dealer-flow.actions.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/callback.actions.ts`
  - `apps/server/src/modules/Marketing/showcase/showcase.service.ts`
  - `apps/server/src/modules/Inventory/inventory/inventory.routes.ts`
- Behavior:
  - partner showcase filtered by `partnerCompanyId`
  - owner-only partner inventory edit guards

### C13 feat(miniapp-multiselect)
- Update:
  - `apps/web/src/pages/public/MiniApp.tsx`
  - `apps/web/src/pages/public/miniapp/views/RequestView.tsx`
  - `apps/web/src/services/miniappApi.ts`
  - `apps/server/src/modules/Communication/telegram/core/utils/miniappPayload.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts`
  - `apps/server/src/routes/miniAppRoutes.ts`
  - `apps/server/src/services/miniapp.service.ts`
- Behavior:
  - favorite toggle (existing, keep)
  - multi-select cars
  - one request with multiple car IDs
  - stable BackButton + scroll container behavior

### C14 test+docs+qa+sync
- Tests:
  - unit: favorites batching, partnerCode gating, lead summary/edit, domain rate limiter policy
  - integration: webhook allowed updates, miniapp payload multi-request, B2B approve path
- Docs:
  - `docs/qa_lead_b2b_upgrade_2026-02-23.md`
- Sync:
  - run `npm --prefix apps/server run preset:sync`

## P1 (after P0 in same cycle)
1. Unify hard redaction policy for public/B2B channel renderers.
2. Add lightweight external parsing observability without PII.
3. Add ops runbook/cron guidance for TTL cleanup and join-request moderation fallback.

## Commit sequence (atomic)
1. `docs(audit+plan): add lead+b2b upgrade audit and implementation plan`
2. `feat(prisma-core): add external/support/partner ownership fields and enums`
3. `feat(backfill): partner roles/codes/showcases backfill and external TTL cleanup script`
4. `feat(external-search): add policy-compliant html providers and scenario integration`
5. `feat(forms): add summary-edit-skip form primitives with FORM callbacks`
6. `feat(lead-menu): update lead menu/info and admin help/prefixes`
7. `feat(lead-buy): add inventory-first batching favorites and admin lead aggregation`
8. `feat(lead-sell): add sell flow with idempotent admin actions`
9. `feat(support): add support ticket OPEN/new flow`
10. `feat(b2b-reg): add two-branch registration and partnerCode gating`
11. `feat(telegram-join): add invite link and chat join request routing`
12. `feat(b2b-core): add partner inventory ownership and showcase partner filtering`
13. `feat(miniapp): add multiselect and multi-request payload/api support`
14. `test(docs): add upgrade tests, QA checklist, preset sync`

## QA gates
- Server:
  - `npm --prefix apps/server run prisma:generate`
  - `npm --prefix apps/server run prisma:migrate`
  - `npm --prefix apps/server run backfill:partner-codes-showcases -- --apply`
  - `npm --prefix apps/server test`
- Web:
  - `npm --prefix apps/web run build`
- Manual:
  - Lead Buy full path (batch/favorites/admin)
  - Lead Sell full path (photos + idempotent admin actions)
  - Support OPEN/new
  - B2B registration both branches + approve/reject
  - Privacy checks (no public/B2B contact leakage)
  - MiniApp favorites/multi-select/request/back/scroll

## Non-negotiable constraints captured
- No mock data.
- Inventory-first architecture preserved.
- UA user-facing text in release behavior.
- Contacts exposed only to admins, not channel/public paths.
