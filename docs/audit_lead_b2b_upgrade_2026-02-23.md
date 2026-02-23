# Audit: Lead + B2B Bots & MiniApp Upgrade (2026-02-23)

## Scope
- Bots:
  - `@Cartie_Client_Bot` (Lead)
  - `@CarDealer_Lviv_Bot` (B2B)
- MiniApp surfaces:
  - Public Lead MiniApp
  - B2B MiniApp
- Inventory rule:
  - `CarListing` is source of truth
  - `Showcase` is filtered view/preset over `CarListing`

## Code/DB Facts (current state)

### Runtime and flows
- Primary Telegram runtime path is `ScenarioEngine`:
  - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
  - `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts`
- Active scenario execution uses node types from:
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/node-executor.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/session-flow.ts`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/update-handler.ts`
- Template preset sync exists and is central for menu/scenario provisioning:
  - `apps/server/src/services/templatePreset.service.ts`
  - `apps/server/scripts/sync_bot_presets.ts`

### Data model
- `CarListing` exists and is used as inventory source.
- `Showcase` exists and is used as public inventory view with rules JSON.
- `MiniAppFavorite` exists.
- `PartnerCompany`/`PartnerUser` exist, but currently without required `partnerCode/showcaseSlug/crmUrl/role` fields.
- `SupportTicket` model does not exist.
- `CarListing` currently does not have explicit `external`, `sourceProvider`, `partnerCompanyId` fields.

### External parsing
- Legacy AUTORIA integration in active scenario actions currently imports:
  - `apps/server/src/modules/Integrations/autoria.service.ts` (API-key/mock style, not compliant with requested HTML policy)
- HTML parsing helpers exist in:
  - `apps/server/src/services/urlParser.ts`
- No unified provider policy layer (robots/rate-limit/backoff/cache) for external search pipeline.

### Telegram platform
- `setChatMenuButton` already used in bot manager/routes:
  - `apps/server/src/modules/Communication/bots/bot.service.ts`
  - `apps/server/src/routes/legacyBots.routes.ts`
- Webhook admin service currently sets allowed updates without `chat_join_request`:
  - `apps/server/src/modules/Communication/telegram/core/telegramAdmin.service.ts`
- `chat_join_request` route is absent from pipeline wiring.
- Dedicated invite-link/join-request service is absent.

### MiniApp
- Favorites toggle exists on FE/BE:
  - FE: `apps/web/src/pages/public/MiniApp.tsx`, `apps/web/src/services/miniappApi.ts`
  - BE: `apps/server/src/routes/miniAppRoutes.ts`, `apps/server/src/services/miniapp.service.ts`
- Payload parser currently supports only:
  - `lead_submit | interest_click | sell_submit`
  - file: `apps/server/src/modules/Communication/telegram/core/utils/miniappPayload.ts`
- `/api/miniapp/requests` currently supports only single `carListingId`.

### Privacy/contact leakage
- Redaction exists in legacy renderer (`cardRenderer.ts`) but V2 renderer can expose contact-like blocks:
  - `apps/server/src/services/cardRenderer.ts`
  - `apps/server/src/services/carCardRenderer.v2.ts`
- Hard guard for public/B2B channel audiences is incomplete.

## Requirement → Status → Files/Models

| Requirement Area | Status | Files/Models |
|---|---|---|
| Lead Bot меню (5 пунктів з “Інформація”) | Partial | `apps/server/src/services/templatePreset.service.ts`, `apps/server/src/seeds/scenarioPack.ts` |
| Lead Buy форма (optional + “Пропустити”, summary/edit/cancel) | Missing | `apps/server/src/modules/Communication/bots/scenario-engine/*`, `Scenario.nodes` |
| Lead Buy підбір/батчі/favorites | Missing | `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-broadcast.actions.ts`, `callback.actions.ts`, `session.actions.ts` |
| External HTML Search (AUTO.RIA+OLX) з policy | Missing | `apps/server/src/modules/Integrations/autoria.service.ts`, `apps/server/src/services/urlParser.ts` |
| Lead Sell + admin actions idempotent | Partial | `apps/server/src/seeds/scenarioPack.ts`, `callback.actions.ts`, `inventory.routes.ts` |
| Support ticket OPEN/new | Missing | `Lead` only exists; new `SupportTicket` model required |
| B2B registration 2-гілки + partnerCode | Missing | `b2bWhitelist.service.ts`, `routeCallback.ts`, `schema.prisma` |
| B2B partner inventory (owner-only edits) | Missing | `CarListing` lacks partner ownership field |
| MiniApp multi-select + multi-request payload | Missing | `apps/web/src/pages/public/MiniApp.tsx`, `miniappPayload.ts`, `routeWebApp.ts` |
| Telegram invite link/join request approve | Missing | `telegramAdmin.service.ts`, pipeline routes |
| Admin prefixes + `/help_admin` | Missing | routing/actions/services |
| Contact leak policy hard guard | Partial | `cardRenderer.ts` redaction partial, V2 renderer still risky in public |

## Gap summary
- No unified form primitive layer for required `Пропустити` + `summary/edit/cancel` behavior.
- No callback namespace contracts for `FORM:*`, `LEADBUY:*`, `LEADSELL:*`, `B2BREG:*`, `B2BINV:*`.
- B2B registration/gating today is whitelist-centric, not partnerCode-centric two-branch onboarding.
- External search is not policy-compliant and not centralized.
- MiniApp request API/payload is not multi-car capable.

## External parsing embedding point (single entrypoint)
- Chosen single entrypoint: scenario-engine search actions:
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-broadcast.actions.ts`
  - backed by session helpers in `apps/server/src/modules/Communication/bots/scenario-engine/actions/session.actions.ts`
- Requirement: no duplicated external-search logic in legacy flows (`routeMessage.ts` or older integrations).

## DB snapshot notes used for audit
- Existing bot templates and inventory/favorites tables are active in DB.
- Existing partner records exist and are migratable in-place (no forced re-registration required).
