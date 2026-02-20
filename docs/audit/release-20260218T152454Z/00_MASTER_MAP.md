# 00 MASTER MAP — Cartie Release Audit

Дата фиксации: **2026-02-18** (UTC)  
Период релизного плана: **2026-02-18 → 2026-03-03**  
Контур: `/srv/cartie` (только текущий сервер)

Обновление статуса: **2026-02-19** — блоки `P0-1..P0-6` и `P1-1..P1-6` закрыты (см. `80_RELEASE_BACKLOG.md`).

## 1) Цель и охват
Сформирована единая карта системы Cartie по коду, инфраструктуре и runtime-данным:
- где какие модули и скрипты находятся;
- какие API/потоки данных работают между модулями;
- какие форматы данных используются;
- где есть конфликты, хардкод, legacy-долг и релизные риски.

Полный контент-аудит включал: `data`, `storage`, `_logs`.

## 2) Текущий baseline (факт)
- Backend: `apps/server` (Express + Prisma).
- Frontend: `apps/web` (React + Vite).
- Infra: `infra/docker-compose.cartie2.prod.yml`, `infra/Caddyfile`, `infra/deploy_prod.sh`.
- Runtime:
  - `data`: 73M
  - `storage`: 415M
  - `_logs`: 20M
- Крупные узлы кода:
  - `apps/server/src/routes/apiRoutes.ts` — 33 строки (compatibility shim)
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` — 127 строк (thin coordinator)
  - `apps/server/prisma/schema.prisma` — 1720 строк
  - `apps/web/src/pages/public/MiniApp.tsx` — 1626 строк

Источники: `docs/audit/release-20260218T152454Z/artifacts/large_files_baseline.txt`, `docs/audit/release-20260218T152454Z/artifacts/folder_metrics_src.tsv`.

## 3) Карта верхнего уровня

### Папки и назначение
- `.agent`: внутренние правила/агенты/скрипты автоматизации разработки.
- `.github`: CI workflow.
- `_archive`: архив старых артефактов и env backup.
- `_logs`: deploy/runtime логи.
- `apps/server`: backend приложение.
- `apps/web`: frontend приложение.
- `data`: postgres data-dir.
- `docs`: документация и прошлые аудиты.
- `env`: отдельный prod env-файл.
- `infra`: compose/docker/caddy/deploy/monitoring.
- `scripts`: root smoke/verify SQL/bash скрипты.
- `services`: пустая директория.
- `storage`: медиа и runtime файлы.
- `verification`: отдельные smoke/verify скрипты.

Источник: `docs/audit/release-20260218T152454Z/artifacts/folder_metrics_src.tsv`.

## 4) Backend карта (high-level)

### Модули
- `Core`: auth/companies/system/superadmin/templates/users/entities/health.
- `Communication`: bots + Telegram pipeline.
- `Integrations`: mtproto/parsing/telegram registry/meta/whatsapp/viber/sendpulse.
- `Inventory`: inventory + normalization.
- `Sales`: requests.
- `Marketing`: showcase.
- `Parser`.
- `v41`: legacy/definitions.

Источник: `docs/audit/release-20260218T152454Z/artifacts/backend_module_dirs.txt`.

### API слой и связность
- Всего route-declarations: **192** (GET 74, POST 74, PUT 21, DELETE 20, PATCH 3).
- Основная концентрация роутов:
  - `apps/server/src/routes/apiRoutes.ts` — 61
  - `apps/server/src/modules/Integrations/mtproto/mtproto.routes.ts` — 16
  - `apps/server/src/routes/publicRoutes.ts` — 12

Источники: `docs/audit/release-20260218T152454Z/artifacts/route_declarations_all.tsv`, `docs/audit/release-20260218T152454Z/artifacts/route_count_by_file_all.txt`.

### Mount topology
Основные mount points в `apps/server/src/index.ts`:
- `/api/webhooks/*` (public webhooks)
- `/api/public`, `/api/miniapp` (public)
- `/api/auth`
- `/api/system`, `/api/entities`, `/api/inventory`, `/api/requests`, `/api/companies`, `/api/templates`, `/api/integrations`, `/api/superadmin`, `/api/qa`
- `/api/v2/*` (versioned envelope API)
- `/api` (legacy compatibility)

## 5) Frontend карта (high-level)
- Router: `BrowserRouter` (не HashRouter).
- Route map: public (`/login`, `/p/*`) + protected app routes (`/`, `/requests`, `/inventory`, `/telegram`, `/settings`, ...).
- API-вызовы: 209 call-sites, максимальная концентрация в `apps/web/src/services/serverAdapter.ts` (53).

Источники: `apps/web/src/App.tsx`, `docs/audit/release-20260218T152454Z/artifacts/frontend_api_calls_by_file.txt`.

## 6) Runtime карта данных
- БД (основные объемы):
  - workspaces=3, users=11
  - BotConfig=1, Lead=64, B2bRequest=19, RequestVariant=39, CarListing=66, Draft=31
  - IntegrationEventLog=3085
- Целостность (orphans):
  - `orphan_car_company=1` (остальные ключевые orphan-check = 0)
- Media linkage:
  - refs в БД: 2287
  - файлов на диске: 2283
  - missing refs: 7
  - orphan files: 3

Источники: `docs/audit/release-20260218T152454Z/artifacts/db_audit.txt`, `docs/audit/release-20260218T152454Z/artifacts/media_integrity_summary.txt`.

## 7) Карта рисков (master)
- `P0` блок закрыт 2026-02-19:
  - router split завершён;
  - scenario runtime split завершён;
  - tenant contract normalised, implicit `company_system` fallback removed from user-facing API;
  - feature flags switched to server SoT;
  - security preflight added to deploy;
  - `/api/v2` envelope и deprecation policy включены.
- P1: дубли data-layer на фронте (`serverAdapter` + `data.ts` + специализированные сервисы).
- P1: doc drift (документация расходится с текущим кодом/роутами).
- P1: скрипты частично устарели/небезопасны для prod-ранов.
- P2: migration debt по v4.1 и смешанный legacy-контур.

## 8) Release готовность (текущее состояние)
- Build/test gates: PASS
  - `server build` = 0
  - `server test` = 0 (46 тестов)
  - `web build` = 0 (есть warning по chunk > 500kB)
- Runtime incidents в `_logs`: исторические 502 в web reverse_proxy при рестартах API; `Authorization` в логах редактирован (`REDACTED`).

Источники: `docs/audit/release-20260218T152454Z/artifacts/server_build.log`, `docs/audit/release-20260218T152454Z/artifacts/server_test.log`, `docs/audit/release-20260218T152454Z/artifacts/web_build.log`, `docs/audit/release-20260218T152454Z/artifacts/web_errors_2026-02-18.txt`.

## 9) Навигация по артефактам
- Папки: `10_FOLDER_AUDIT.md`
- Backend модули: `20_MODULE_AUDIT_BACKEND.md`
- Frontend модули: `30_MODULE_AUDIT_FRONTEND.md`
- Скрипты: `40_SCRIPT_AUDIT.md`
- Потоки данных: `50_DATA_FLOW_MAP.md`
- Runtime data/content: `60_DATA_CONTENT_AUDIT.md`
- Findings/reco: `70_FINDINGS_AND_RECOMMENDATIONS.md`
- Backlog: `80_RELEASE_BACKLOG.md`
- Gates/rollback: `90_RELEASE_GATES_AND_ROLLBACK.md`
