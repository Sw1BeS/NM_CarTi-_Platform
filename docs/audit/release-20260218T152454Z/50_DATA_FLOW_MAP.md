# 50 DATA FLOW MAP

Дата: **2026-02-18**  
Формат: `producer → transport → consumer → storage`

## 1) Сквозная карта (обязательные потоки)

## 1.1 Web UI → API
- Producer: `apps/web/src/pages/app/*`, `apps/web/src/modules/*`
- Transport: HTTP(S), `ApiClient` (`fetch`), Bearer JWT
- Consumer: backend routes (`/api/*`, включая модульные и legacy)
- Storage: Prisma models (`Lead`, `B2bRequest`, `RequestVariant`, `CarListing`, `BotConfig`, `SystemSettings`, ...)

Контрактные точки:
- Endpoint surface распределен по `index.ts` mounts + `apiRoutes.ts`.
- Front вызывает API через несколько слоев (`serverAdapter`, `data.ts`, domain services).

Auth/tenant:
- JWT обязателен для protected endpoints.
- Tenant контекст смешанный: `companyId/workspaceId`, дополнительно legacy fallback.

## 1.2 Public/MiniApp → API
- Producer: `pages/public/*`, Telegram MiniApp client
- Transport: HTTP, `initData`, query/body params
- Consumer: `apps/server/src/routes/publicRoutes.ts`, `apps/server/src/routes/miniAppRoutes.ts`
- Storage: `B2bRequest`, `Lead`, `MiniAppFavorite`, `CarListing`, `BotConfig`

Ключевые endpoint’ы:
- `/api/public/:slug/inventory`
- `/api/public/:slug/requests`
- `/api/public/:slug/request-status`
- `/api/miniapp/config`, `/api/miniapp/favorites`, `/api/miniapp/requests`

Fallback/hardcode:
- fallback slug/tenant paths присутствуют (legacy showcase fallback и `system`-ориентированный путь).

## 1.3 Telegram Webhook → Pipeline → Bot/Lead/Request
- Producer: Telegram Bot API (webhook update)
- Transport: POST webhook (`/api/telegram/webhook/:botId`) + secret header
- Consumer: `runTelegramPipeline` -> `routeMessage`/scenario runtime
- Storage:
  - `TelegramUpdate`
  - `Lead` / `LeadActivity`
  - `B2bRequest` / `RequestVariant`
  - `PlatformEvent`
  - `IntegrationEventLog`

Entry/contract:
- `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts`
- Валидация: bot enabled + webhook secret check.

## 1.4 MTProto Import → Mapping → Inventory/Drafts
- Producer: Telegram MTProto connector/channel sources
- Transport: scheduler/manual sync/import-job API
- Consumer:
  - `mtproto.routes.ts`
  - `mtproto.import.service.ts`
  - `mtproto.import.worker.ts`
  - mapping services (`mtproto-mapping.service.ts`)
- Storage:
  - `MTProtoConnector`, `ChannelSource`, `TelegramImportJob`
  - target: `CarListing` (inventory mode) или `Draft` (draft mode)
  - audit: `IntegrationEventLog`

Entry endpoints:
- `/api/integrations/mtproto/*` (connectors/channels/import-jobs/sync)

## 1.5 Content Worker/Scheduler → Publication/Channel
- Producer: Scheduled jobs + drafts/publication queue
- Transport: cron workers (`scheduler.ts`, `content.worker.ts`)
- Consumer: telegram outbox + publication processors
- Storage:
  - `PublicationJob`, `PublicationResult`
  - `Draft`
  - `ChannelPost`
  - `ScheduledJob`
  - `IntegrationEventLog`

Примечание:
- Исторически в логах фиксировались ошибки scheduled_jobs (`P2021`), сейчас требуется явный migration/readiness контроль.

## 1.6 Integrations → IntegrationEventLog
- Producer: все интеграционные сервисы/воркеры
- Transport: internal service call
- Consumer: `logIntegrationEvent`
- Storage: `IntegrationEventLog`

Роль:
- единый технический аудит-сигнал интеграционных операций.

## 2) Таблица потоков (контрактная)

| Поток | Entrypoint | Входной формат | Выходной формат | DB модели | Обязательные поля | Fallback/hardcode | Auth/Tenant |
|---|---|---|---|---|---|---|---|
| Web UI → API | `/api/*` | JSON body/query + JWT | mixed (`array`/`{items}`/custom) | Lead/Request/Inventory/... | `Authorization` для protected | legacy in `apiRoutes.ts` | JWT + mixed tenant context |
| Public/MiniApp → API | `/api/public/*`, `/api/miniapp/*` | JSON + `initData` + slug | JSON (`ok`, data) | Lead/Request/Favorite/... | `initData`, `slug` | showcase/system fallback | mostly public + initData verify |
| Telegram Webhook | `/api/telegram/webhook/:botId` | Telegram Update JSON + secret header | `{ok:true}` immediate ack | TelegramUpdate/Lead/Request/... | `botId`, secret, update payload | bot/env secret fallback | secret-based (no bearer) |
| MTProto Import | `/api/integrations/mtproto/*` + workers | connector/channel/import payloads | job/result JSON | MTProtoConnector/ChannelSource/TelegramImportJob + CarListing/Draft | connectorId/sourceId/date range | mode fallback (`INVENTORY`) | requireRole + company scope |
| Content Publish | workers cron | PublicationJob/Draft payload | publication result | PublicationJob/Result/ChannelPost | bot token, destination, text | media URL base fallback | internal worker context |
| Integration Audit | service call | typed log input | none | IntegrationEventLog | integration/action/status | none | companyId optional |

## 3) Канонические форматы (инвентаризация JSON полей)

Обязательные для контроля контракта:
- `BotConfig.config` (JSON)
- `Scenario.nodes` (JSON)
- `Integration.config` (JSON)
- `B2bRequest.payload` (JSON)
- `CarListing.mediaItems` (JSON)
- `SystemSettings.navigation/features/modules` (JSON)
- `EntityRecord.data` (JSON)

Источник: `docs/audit/release-20260218T152454Z/artifacts/prisma_json_fields.txt`.

## 4) Места контрактной нестабильности
1. Response envelope неоднороден между endpoint’ами.
2. Tenant контракт не унифицирован (`companyId/workspaceId/company_system`).
3. Fallback-поведение присутствует одновременно во front и back (особенно miniapp/public).
4. JSON payload-heavy модели позволяют быструю эволюцию, но увеличивают риск silent schema drift.

## 5) Нормализация к релизу (цель)
- Ввести versioned API (`/api/v2`) с единым envelope.
- Зафиксировать единый tenant-context интерфейс.
- Убрать implicit fallback на `company_system`.
- Синхронизировать front/back contract types через общий пакет типов.
