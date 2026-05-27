# Initial Cartie Baseline Snapshot

Date: 2026-05-27
Root: `/srv/cartie`
Basis: generated project knowledge dated 2026-05-26 plus targeted reads for Meta, SalesDrive, Telegram, MiniApp, Prisma, and QA docs.

## Project Structure

- `apps/server/` - Node/TypeScript API, Prisma, integrations, Telegram routing, MiniApp routes.
- `apps/web/` - React/Vite web app and public MiniApp.
- `docs/project-knowledge/` - current operator-facing knowledge base.
- `docs/code-map/` - generated workspace maps.
- `scripts/inspect/generate_code_map.mjs` - code-map generator and docs check.
- Protected runtime/state paths include `data/`, `storage/`, `_logs/`, `.deploy/`, `env/`, and secret-bearing files.

## Tech Stack

- TypeScript server and web.
- Prisma/Postgres persistence.
- Telegram Bot API and MiniApp flows.
- SalesDrive integration.
- Meta CAPI/Pixel integration.
- Vitest-based server tests.

## Ownership Mapping

| Area | Canonical owner |
| --- | --- |
| B2C Meta CRM CAPI | `apps/server/src/modules/Integrations/meta/metaCapi.service.ts` |
| Legacy generic Meta senders | `apps/server/src/modules/Integrations/meta/meta.service.ts`, `apps/server/src/modules/Integrations/meta.service.ts` |
| SalesDrive order sync | `apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.ts` |
| SalesDrive status webhook | `apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.ts` |
| Telegram private text routing | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts` |
| Lead and request creation from Telegram | `apps/server/src/modules/Communication/telegram/core/leadService.ts` |
| MiniApp request finalization | `apps/server/src/services/requestContract.service.ts` |
| MiniApp HTTP routes/events | `apps/server/src/routes/miniAppRoutes.ts` |
| MiniApp browser tracking capture | `apps/web/src/pages/public/MiniApp.tsx`, `apps/web/src/pages/public/miniapp/trackingEvents.ts` |
| Data model | `apps/server/prisma/schema.prisma` |

## Contract Inventory

- `MetaCapiService.trackB2CBotCrmLifecycleEvent(companyId, eventName, input)` sends B2C CRM events behind flags.
- `MetaCapiService.trackEvent(companyId, eventName, input)` sends generic company-scoped Meta events.
- `handleSalesDriveWebhook(request)` validates SalesDrive webhook secret and maps approved statuses to Meta CRM sends.
- `createOrMergeLead(input, botConfig)` owns lead creation, duplicate merge, initial B2C attribution payload, and initial Lead CAPI call.
- `RequestContractService` owns MiniApp pending intent finalization and contact-share CAPI events.
- `IntegrationEventLog.idempotencyKey` is unique and currently doubles as CAPI dedupe persistence.
- Telegram `/start <payload>` currently supports fixed aliases and does not generically persist attribution tokens.

## Dependency Direction

- Routes and Telegram handlers call services.
- Integration services own outbound calls and logging.
- Prisma schema defines persistence contracts.
- Web MiniApp collects browser context and sends sanitized tracking metadata to server.

## Test System

- Server tests exist for Meta CAPI, SalesDrive connector/webhook, MiniApp handoff, request contract, and tracking event helpers.
- Current QA docs list targeted commands:
  - `npm --prefix apps/server test -- <focused test files>`
  - `npx tsc --noEmit --pretty false`
  - `node scripts/inspect/generate_code_map.mjs && node scripts/inspect/generate_code_map.mjs --check`

## Build And Deploy

- Docker/Caddy/nginx are present in infra.
- Live service smoke uses `/health`.
- Deployment/runtime paths are protected and were not touched by this research/design task.

## Known Anti-Patterns

- Legacy Meta senders still use token query strings and are not canonical for B2C CRM.
- `routeMessage.ts` and `MiniApp.tsx` are high-attention large surfaces. Avoid adding new ownership there unless the change is strictly routing glue.
- Internal debug actions such as `miniapp.tracking_bound` must not be counted as real Meta CAPI sends.
- `event_time` drift is possible when send time is used instead of business event time.
- `IntegrationEventLog.idempotencyKey` can block retry logging after error if not handled deliberately.

## Compatibility Boundaries

- Do not break existing `/start sell`, `/start stock`, `/start available`, `/start catalog`, `/start transit`, `/start pending`.
- Do not send fake Meta `lead_id` for Telegram-origin leads.
- Do not expose raw token, phone, email, or secret-bearing payload in admin logs.
- Do not trigger production Meta or SalesDrive writes during design or QA without explicit approval.
- Do not touch runtime data, media, logs, deployment artifacts, or env secrets for this design work.
