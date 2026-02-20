# 20 MODULE AUDIT — BACKEND

Дата: **2026-02-18**  
База: `apps/server`

## 1) Слои и entrypoints

### Глобальные mount points (`apps/server/src/index.ts`)
- Public webhooks: `/api/webhooks/whatsapp`, `/api/webhooks/viber`, `/api/telegram`
- Public API: `/api/public`, `/api/miniapp`
- Auth: `/api/auth`
- App API: `/api/system`, `/api/entities`, `/api/inventory`, `/api/requests`, `/api/companies`, `/api/templates`, `/api/integrations`, `/api/superadmin`, `/api/qa`
- Legacy: `/api` (`apiRoutes.ts`)

### Route-концентрация
- Всего route declarations: **192**.
- Главный hotspot: `apps/server/src/routes/apiRoutes.ts` (**61** route).

Источники: `docs/audit/release-20260218T152454Z/artifacts/route_declarations_all.tsv`, `docs/audit/release-20260218T152454Z/artifacts/route_count_by_file_all.txt`.

## 2) Аудит модулей `apps/server/src/modules`

## Core

### `Core/auth`
- Entrypoints: `apps/server/src/modules/Core/auth/auth.routes.ts` (`/api/auth/login`, `/api/auth/me`).
- Контракты:
  - JWT payload уже canonical (`userId`, `globalUserId`, `companyId`, `workspaceId`, `role`).
  - Есть fallback на `company_system` при отсутствии workspace.
- Риски:
  - fallback `company_system` сохраняет неявную multi-tenant семантику.

### `Core/companies`
- Entrypoint: `apps/server/src/modules/Core/companies/company.routes.ts`.
- Auth/tenant: `authenticateToken + companyContext + requireRole`.
- Риски: дублирование tenant context через `companyId/workspaceId` в разных слоях.

### `Core/entities`
- Entrypoint: `apps/server/src/routes/entityRoutes.ts` (вне `modules/Core/entities`, но функционально сюда относится).
- Назначение: generic entity records (`EntityDefinition/EntityField/EntityRecord`).
- Риски: generic слой и доменные endpoints живут параллельно, контракты частично дублируются.

### `Core/health`
- Entrypoint: `apps/server/src/modules/Core/health/health.controller.ts` (`/health`, `/api/health`).
- Риски: нет.

### `Core/superadmin`
- Entrypoint: `apps/server/src/modules/Core/superadmin/superadmin.routes.ts` (12 routes).
- Auth/tenant: строгие `authenticateToken + companyContext + requireRole(['SUPER_ADMIN'])`.
- Риски:
  - в impersonation/tenant resolution встречаются `company_system` fallback ветки.

### `Core/system`
- Entrypoint: `apps/server/src/modules/Core/system/system.routes.ts`.
- Контракты: public settings + protected settings update.
- Риски:
  - default features конфликтуют с frontend fallback defaults (`MODULE_COMPANIES/MODULE_INTEGRATIONS`).

### `Core/templates`
- Entrypoint: `apps/server/src/modules/Core/templates/template.routes.ts`.
- Риски: часть шаблонной логики пересекается с `templatePreset.service.ts` в service-слое; источники истины размазаны.

### `Core/users`
- Entrypoint по сути сервисный (`seedAdmin`): `apps/server/src/modules/Core/users/user.service.ts`.
- Риски:
  - non-production defaults (`admin/admin`, `superadmin/superadmin`) при неправильной конфигурации.

## Communication

### `Communication/bots`
- Hotspot: `apps/server/src/modules/Communication/bots/scenario.engine.ts` (2697 строк).
- Назначение: runtime сценариев, fallback-ветки, start payload parsing, event emission.
- Риски:
  - слишком много обязанностей в одном файле (runtime + actions + integrations + fallback).
  - сложные ветки legacy behavior behind env flags.

### `Communication/telegram/*`
- Webhook entry: `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts`.
- Pipeline: `runTelegramPipeline` -> routing/scenarios.
- Data: `TelegramUpdate`, `Lead`, `B2bRequest`, `PlatformEvent`, `IntegrationEventLog`.
- Риски:
  - поведение зависит от бот- и env-secret fallback.
  - высокий coupling с `apiRoutes.ts` и `scenario.engine.ts`.

## Integrations

### `Integrations/mtproto`
- Entrypoint: `apps/server/src/modules/Integrations/mtproto/mtproto.routes.ts` (16 routes).
- Поток: connector -> channel source -> import job -> parsing/mapping -> inventory/drafts.
- Data models: `MTProtoConnector`, `ChannelSource`, `TelegramImportJob`, `IntegrationEventLog`, `CarListing/Draft`.
- Риски:
  - сложная асинхронность (manual sync + import worker + scheduler jobs).
  - исторические ошибки scheduled jobs в логах (`P2021`) требуют formal readiness check по migration state.

### `Integrations/parsing`
- Entrypoint: `apps/server/src/modules/Integrations/parsing/parsing.routes.ts` (`/preview`).
- Риски: ограниченный API surface, но сильно зависит от quality mapping в downstream.

### `Integrations/telegram registry`
- Entrypoint: `apps/server/src/modules/Integrations/telegram/telegramRegistry.routes.ts`.
- Риски: overlap с telegram destination/bot flows (несколько мест управления telegram state).

### `Integrations/whatsapp`, `Integrations/viber`, `Integrations/meta`, `Integrations/sendpulse`, `Integrations/autoria`
- Часть entrypoints сервисные, часть router-level.
- Риски:
  - интеграции смешаны в одном модуле с разной зрелостью и разными контрактами конфигов.

## Inventory

### `Inventory/inventory`
- Entrypoint: `apps/server/src/modules/Inventory/inventory/inventory.routes.ts`.
- Data: `CarListing`, `Draft`.
- Риски:
  - legacy-ветки с `company_system` permission check.

### `Inventory/normalization`
- Нормализация brand/model/city/phone, storage `NormalizationAlias`.
- Риски: не все normalization paths одинаково используются по pipeline.

## Sales

### `Sales/requests`
- Entrypoint: `apps/server/src/modules/Sales/requests/requests.routes.ts` (11 routes).
- Data: `B2bRequest`, `RequestVariant`, `CarListing`, `BotConfig`.
- Риски:
  - много permission branch на `company_system`; высокая ветвистость.

## Marketing

### `Marketing/showcase`
- Entrypoint: `apps/server/src/modules/Marketing/showcase/showcase.controller.ts`.
- Data: `Showcase`, `CarListing`.
- Риски: overlap public inventory between showcase path и legacy fallback path.

## Parser

### `Parser`
- Entrypoint: `apps/server/src/modules/Parser/parser.controller.ts`.
- Назначение: parser mapping/settings.
- Риски: часть parser config идёт через `SystemSettings.modules`, что усложняет ownership.

## v4.1

### `v41/definitions`
- Legacy bridge слой, связанный с `services/v41/*`.
- Риски:
  - mixed model (new + v4.1 read/write abstractions).
  - migration debt и неоднозначность при ownership данных.

## 3) Storage/model coupling по модулям
Ключевое Prisma-использование (агрегировано):
- `Communication`: `Lead`, `B2bRequest`, `Scenario`, `TelegramUpdate`, `BotSession`, `PlatformEvent`, ...
- `Core`: `SystemSettings`, `Workspace`, `Membership`, `ScenarioTemplate`, ...
- `Integrations`: `MTProtoConnector`, `ChannelSource`, `TelegramImportJob`, `Integration`, `IntegrationEventLog`.
- `Inventory`: `CarListing`, `Draft`, `NormalizationAlias`.
- `Sales`: `B2bRequest/RequestVariant` смежно через bot/inventory.

Источник: `docs/audit/release-20260218T152454Z/artifacts/module_to_prisma_models.tsv`.

## 4) Backend слой вне модулей

### `apps/server/src/routes/*`
- `apiRoutes.ts` — god-router, legacy + mixed domain handlers.
- `publicRoutes.ts`, `miniAppRoutes.ts` — public контракты и miniapp surface.
- `entityRoutes.ts`, `qaRoutes.ts` — отдельные контуры.

### `apps/server/src/services/*`
- Ключевые сервисы контракта/данных:
  - `dto.ts`, `templatePreset.service.ts`, `miniapp.service.ts`, `channel-ingestion.service.ts`, `integrationEventLog.service.ts`.
- Риски:
  - cross-domain logic в service-слое без явного bounded context.

### `apps/server/src/repositories/*`
- Используются точечно, но есть mix: часть доступа через репозитории, часть напрямую через Prisma.

### `apps/server/src/middleware/*`
- `auth.ts`, `companyContext.ts`, `workspaceContext.ts`.
- Ключевой риск: множественные способы извлечения tenant context.

### `apps/server/src/workers/*`
- `content.worker.ts`, `scheduler.ts`, `parsing.worker.ts`, mtproto workers.
- Риски: job orchestration без единого статуса readiness для всех job-таблиц и миграций.

### `apps/server/prisma/*`
- Модельный слой широкий (72 models), json-heavy (54 json/jsonb fields).
- Риск: высокая гибкость payload полей усложняет контрактную совместимость и миграции.

## 5) Ключевые backend findings
1. `apiRoutes.ts` остаётся центральной точкой связности и регрессионного риска.
2. `scenario.engine.ts` смешивает runtime, интеграции и legacy fallback ветки.
3. Tenant-context не унифицирован (`companyId/workspaceId/company_system`) во многих маршрутах.
4. Feature flags раскиданы по env + system settings + frontend defaults.
5. Часть legacy/v4.1 перехода формально не завершена.

Подробный приоритетный список: `70_FINDINGS_AND_RECOMMENDATIONS.md`.
