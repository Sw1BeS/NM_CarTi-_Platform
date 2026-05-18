# CarTie Telegram CRM Connector Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring LeadBot, B2B Bot, MiniApp, CRM identity/history, admin chats, SalesDrive, and Meta tracking back into one coherent product contract without duplicating Inventory or CRM data.

**Architecture:** Inventory owns car records. Showcase owns saved views over Inventory. CRM owns contacts, leads, requests, assignments, dedupe, and timeline. Telegram owns Bot API, MiniApp launch/auth, channel/admin messaging, and callbacks. SalesDrive is a connector, read-only by default. Analytics owns browser/server tracking, CRM binding, and event dedupe.

**Tech Stack:** TypeScript, Express, Prisma/Postgres, Vitest, React/Vite, Telegram Bot API, Telegram Mini Apps, Meta Conversions API, SalesDrive API.

---

## Repo Discovery

### Telegram Bot API runtime

- `apps/server/src/index.ts` mounts `/api/telegram`, `/api/miniapp`, `/api/b2b`, `/api/integrations`, starts `botManager.startAll()`, content workers, scheduler, and MTProto sync.
- `apps/server/src/modules/Communication/bots/bot.service.ts` owns BotManager polling/webhook lifecycle, command registration, chat menu sync, and dispatch into the Telegram pipeline.
- `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts` handles Telegram webhook ingress and validates `X-Telegram-Bot-Api-Secret-Token`.
- `apps/server/src/modules/Communication/telegram/scenarios/pipeline.ts` runs tenant resolution, dedupe, context enrichment, normalization, message save, routing, and event emission.
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`, `routeCallback.ts`, `routeWebApp.ts`, `routeInline.ts`, `routeChannelPost.ts`, `routeChatJoinRequest.ts`, and `routeMyChatMember.ts` are the runtime update routers.
- `apps/server/src/modules/Communication/telegram/messaging/outbox/telegramOutbox.ts` and `telegramSender.ts` are delivery boundaries.
- `apps/server/src/modules/Communication/telegram/core/utils/miniappUrl.ts`, `clientLeadMiniAppMenu.ts`, `telegramReplyMarkup.ts`, `callbackUtils.ts`, `telegramChatId.ts`, `telegramText.ts`, `carMedia.ts`, and `inputValidators.ts` are the shared Telegram utility layer.

### LeadBot

- `routeMessage.ts` CLIENT_LEAD branches own `/start`, private menu, support, free-text capture, MiniApp contact handoff, and wizard routing.
- `apps/server/src/modules/Communication/telegram/core/utils/clientLeadMiniAppMenu.ts` builds the persistent MiniApp keyboard.
- `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts` owns bot-native pickup criteria, Inventory matching, request creation, favorites, and admin notification.
- `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts` owns sell-car intake.
- `apps/server/src/modules/Communication/telegram/core/leadService.ts`, `apps/server/src/services/leadIdentity.service.ts`, and `apps/server/src/services/requestContract.service.ts` own lead merge, identity, and MiniApp handoff/finalization.
- `apps/server/src/routes/miniAppRoutes.ts` owns Lead MiniApp `/lead-intents`, `/bot-flows`, `/events`, and read-only showcase/request endpoints.

### B2B Bot

- `routeMessage.ts` B2B branches own registered/unregistered menu, partner gate, request creation, variant deep links, and legacy B2B publication.
- `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts`, `b2bRequestWizard.ts`, `b2bVariantWizard.ts`, and `b2bSellWizard.ts` own partner registration, B2B requests, offers/variants, and partner inventory adds.
- `apps/server/src/services/b2bWhitelist.service.ts`, `b2bRegistration.service.ts`, and `b2bRouting.service.ts` own partner access, registration decisions, admin/partner queue routing, and contact redaction.
- `apps/server/src/routes/b2bV2.routes.ts` exposes B2B API surfaces.
- `apps/server/src/services/miniapp.service.ts` creates B2B MiniApp requests/offers without creating Lead duplicates.

### Mini App entry points/routes/screens

- Web routes are in `apps/web/src/App.tsx`: `/p/app`, `/p/app/:slug`, `/p/request`, `/p/proposal/:token`, plus admin routes.
- Main public shell is `apps/web/src/pages/public/MiniApp.tsx`.
- Smaller shell/views are `apps/web/src/pages/public/miniapp/MiniAppShell.tsx`, `views/CatalogView.tsx`, `views/RequestView.tsx`, `views/FavoritesView.tsx`, and `views/ProfileView.tsx`.
- Entry parsing is `apps/web/src/pages/public/miniapp/entryIntent.ts`.
- API client is `apps/web/src/services/miniappApi.ts`.

### CRM/Lead/Request/Contact/Customer

- Prisma models already present: `Lead`, `LeadIdentity`, `LeadActivity`, `B2bRequest`, `RequestVariant`, `Contact`, `Case`, `CaseContactLink`, `Channel`, `Identity`, `Conversation`, `Message`, and `MessageDelivery`.
- Services/routes: `leadService.ts`, `leadIdentity.service.ts`, `requestContract.service.ts`, `miniapp.service.ts`, `lead.repository.ts`, `request.repository.ts`, `legacyLeads.routes.ts`, `apps/server/src/modules/Sales/requests/requests.routes.ts`, and `entityRoutes.ts`.

### Inventory/Showcase

- Prisma models: `CarListing`, `Showcase`, `MiniAppFavorite`, `PartnerCompany`, and `PartnerUser`.
- Services/controllers: `apps/server/src/modules/Marketing/showcase/showcase.service.ts`, `showcase.controller.ts`, `apps/server/src/modules/Inventory/inventory/inventory.routes.ts`, `inventory.service.ts`, `dto.ts`, `vehiclePresentation.ts`, `vehicleState.service.ts`, `requestPresentation.ts`, `cardRenderer.ts`, `carCardRenderer.v2.ts`, and `publication.service.ts`.

### Admin chat/channel handlers

- Lead admin notifications: `apps/server/src/services/leadAdminNotification.ts`.
- Lead/B2B admin and channel dispatch: `routeMessage.ts`, B2B/Lead wizard files, `b2bRouting.service.ts`, and `telegramOutbox.ts`.
- Admin callbacks: `routeCallback.ts`, `routeCallback.b2bAccess.test.ts`, and `routeCallback.leadAdminActions.test.ts`.
- Admin test panels: `apps/server/src/modules/Communication/telegram/routing/testing`.

### Meta/analytics

- Prisma `Integration` supports `META_PIXEL`; `IntegrationEventLog` stores dispatch/idempotency logs.
- `apps/server/src/routes/miniAppRoutes.ts` `/events` captures MiniApp events, validates write events, stores platform events, and conditionally calls CAPI.
- `apps/server/src/modules/Integrations/integration.service.ts` delegates to `meta/metaCapi.service.ts`.
- `apps/server/src/modules/Integrations/meta/metaCapi.service.ts` hashes PII, builds stable `event_id`, logs idempotency, and redacts errors.
- Legacy paths remain in `apps/server/src/modules/Integrations/meta.service.ts` and `apps/server/src/modules/Integrations/meta/meta.service.ts`.
- Frontend tracking capture is in `apps/web/src/pages/public/MiniApp.tsx`.

### SalesDrive

- No current `SalesDrive`/`SALESDRIVE` code or config was present before this plan.
- Integration route scaffold exists at `apps/server/src/modules/Integrations/integration.routes.ts`.
- `IntegrationEventLog` can store connector audit logs without changing the Prisma enum because `integration` is a plain string.

## Current Gaps

### Shared bot gaps

- Admin chats are still not a full workbench everywhere: some messages lack assignment, status, comment, MiniApp admin view, CRM deep links, and idempotent short callback tokens.
- Callback payloads are mostly short, but several actions still encode semantic IDs directly instead of server-side action token records.
- Lead and B2B menus are runtime-owned, but the labels do not fully match the latest product funnel.
- MiniApp has improved portal behavior, but role-specific B2B team/settings screens are still thin.

### B2B gaps

- Partner access gate exists via `PartnerCompany`/`PartnerUser` and whitelist, but roles are still minimal (`OWNER`, `AGENT`) rather than owner/admin/manager/viewer.
- Requests, offers, and fit queue exist; richer partner portal management and team administration need a separate UI slice.
- Partner showcase uses Inventory metadata, which is correct, but permissions/customization need a controlled MVP.

### LeadBot gaps

- Lead buy wizard already searches Inventory before creating a manager request, but the top-level menu still over-emphasizes sell/support compared with the requested customer funnel.
- "My requests" is available through MiniApp status entry, not a full authenticated history dashboard yet.
- Old text aliases need to remain accepted to avoid breaking users who type previous button labels manually.

### Platform/CRM gaps

- `LeadIdentity` dedupe exists for Telegram/phone/web/meta, but SalesDrive external IDs are not populated yet.
- `Contact` v4.1 exists, but legacy Lead/B2bRequest are still the operational write path.
- Timeline/history is fragmented between `LeadActivity`, `IntegrationEventLog`, `MessageLog`, and B2B request status/variant fields.

### SalesDrive gaps

- Connector is absent.
- Owner permission for writes is not present, so the connector must remain read-only and dry-run only.
- External field mapping must be observed from real exports before any import/write sync is enabled.

### Meta gaps

- MiniApp browser/server tracking exists, but CRM binding is incomplete for every event type.
- Env examples still used `META_ACCESS_TOKEN`; the requested `META_CAPI_ACCESS_TOKEN` alias should be documented.
- CAPI dispatch is feature-flagged in MiniApp event route, but lead-service CAPI paths still depend on active company integration.

## Target Architecture

- `Inventory`: owns `CarListing`, publication state, vehicle specs, media, partner ownership/source metadata.
- `Showcase`: owns saved views/presets: filters, ordering, constraints, and rendering rules over Inventory.
- `CRM`: owns identity resolution, contacts, leads/requests, duplicate candidates, timeline, assignment, and external sync state.
- `Telegram connector`: owns Bot API runtime, BotConfig, MiniApp launch URLs, initData validation, webhook/polling, channel/admin chat outputs, short callbacks, and message logs.
- `SalesDrive connector`: owns env/config validation, read-only export, mapping, health, retries, idempotency by external order/customer ID, and logs. Writes stay disabled unless both owner permission and `SALESDRIVE_WRITE_ENABLED=true` exist.
- `Analytics connector`: owns event validation, `event_id`, browser/server dedupe, Meta CAPI dispatch behind flags, CRM binding, and dispatch logs.

Do not create separate Inventories for Lead/B2B, separate CRM for SalesDrive, one-off scripts outside connector/service layers, or new entities where existing models can be extended.

## MVP Vertical Slices

- [x] Discovery and plan: document current code ownership, gaps, and target architecture.
- [x] LeadBot runtime funnel alignment: update persistent menu labels/entries while keeping old commands accepted.
- [x] B2B runtime funnel alignment: update registered partner menu labels/entries while keeping existing MiniApp routes.
- [x] SalesDrive connector skeleton: add read-only env config, health check, order export fetch, dry-run import preview, idempotency keys, routes, and tests.
- [ ] Admin workbench v2: add server-side action token records for assignment/status/comment/reply/sync actions and replace semantic callback payloads.
- [ ] CRM identity v2: bind `Contact`, `LeadIdentity`, `B2bRequest`, `MessageLog`, and `IntegrationEventLog` into a single timeline endpoint.
- [ ] B2B partner portal v2: render active requests, offers, team, partner showcase management, and fit feedback in MiniApp.
- [ ] Tracking binding v2: bind all tracking events to contact/request IDs after lead finalization and expose debug counters.

## Safe Implementation Notes

- LeadBot sell flow remains available through bot-native `/sell` and old typed labels, but no longer occupies primary persistent menu space.
- B2B "Команда" and "Налаштування" can open the current profile/status-support surfaces until dedicated screens exist.
- SalesDrive routes must never write remote data in this slice. `SALESDRIVE_SYNC_ENABLED` and `SALESDRIVE_WRITE_ENABLED` default to `false`.
- SalesDrive preview maps exported orders to contact/request candidates only. It does not create contacts, requests, or external CRM records.
- SalesDrive official read list endpoint uses `GET https://yourdomain.salesdrive.me/api/order/list/?page=1&limit=50` with `Form-Api-Key`; the connector should make base URL and path configurable.

## QA Gates

- `npm --prefix apps/server test -- salesdrive.connector.test.ts clientLeadMiniAppMenu.test.ts routeMessage.clientLeadMenu.test.ts routeMessage.b2bMenu.test.ts`
- `npm --prefix apps/server run build`
- Manual smoke:
  - Lead `/start` shows Inventory, Transit, Pickup, Favorites/Viewed, My requests, Manager contact.
  - B2B approved partner `/start` shows request list, create request, offer car, showcase, team, activity/statuses, settings.
  - B2B unapproved user still sees restricted request-access flow and no persistent partner keyboard.
  - `GET /api/integrations/salesdrive/health` returns config-missing or disabled without exposing API keys.
  - `GET /api/integrations/salesdrive/preview?limit=5` is dry-run and does not write CRM/SalesDrive data.
