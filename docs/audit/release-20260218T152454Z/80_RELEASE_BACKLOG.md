# 80 RELEASE BACKLOG

Период: **2026-02-18 → 2026-03-03**  
Формат: приоритет, владелец, ETA, риск, критерий готовности

## 0) Execution Log (2026-02-19)

- `P0-1` — `In Progress`:
  - вынесены 8 legacy-admin route handlers (`/settings`, `/users`, `/logs`, `/storage/upload`) из `apiRoutes.ts` в `apps/server/src/routes/legacyAdmin.routes.ts` с mount через `router.use('/', legacyAdminRouter)`;
  - `apiRoutes.ts` сокращён с 61 до 53 direct route declarations.
- `P1-3` — `In Progress`:
  - исправлен `apps/server/scripts/qa_smoke.ts` (актуальные import paths);
  - исправлен `apps/server/scripts/verify_routes.ts` (актуальный prefix `/api/entities`, strict exit on critical failure);
  - переписан `verification/smoke_test_basic.sh` (strict mode, параметризованные URL, корректный non-zero exit).
- `P0-1` — `In Progress` (итерация 2):
  - вынесен блок `messages/inbox` в `apps/server/src/routes/legacyMessaging.routes.ts` (11 route handlers, включая `/messages/send`);
  - в `apiRoutes.ts` удалены дубли и подключён `legacyMessagingRouter`;
  - `apiRoutes.ts` сокращён до 42 direct route declarations (с 53 на предыдущей итерации).
- `P1-3` — `In Progress` (итерация 2):
  - `apps/server/scripts/debug_orphans.ts`: исправлен import path, введён default DRY-RUN и `--execute` для destructive режима;
  - `scripts/smoke.sh`: ужесточён статус-check, актуализированы endpoints/порты, добавлен auth-aware режим;
  - `scripts/verify-deployment.sh`: обновлён на strict режим, актуальный runtime (`:3002`), auth/write gating.
- `P0-1` — `In Progress` (итерация 3):
  - вынесен analytics/search блок в `apps/server/src/routes/legacyAnalytics.routes.ts` (`/events`, `/metrics/*`, `/search/*`);
  - `apps/server/src/routes/apiRoutes.ts` сокращён до 37 direct route declarations;
  - новый срез распределения роутов сохранён в `artifacts/route_count_by_file_after_p01_iter3_2026-02-19.txt`.
- `P0-1` — `In Progress` (итерация 4):
  - вынесен Telegram proxy/file блок в `apps/server/src/routes/legacyTelegramProxy.routes.ts` (`/telegram/call`, `/telegram/file`, `/telegram/file/cache`);
  - добавлен shared helper `apps/server/src/routes/legacyTelegramProxy.shared.ts` для `callTelegram/resolveBot/allowedMethods`;
  - `apps/server/src/routes/apiRoutes.ts` сокращён до 34 direct route declarations;
  - новый срез распределения роутов сохранён в `artifacts/route_count_by_file_after_p01_iter4_2026-02-19.txt`.
- `P0-1` — `In Progress` (итерация 5):
  - вынесен scenarios блок в `apps/server/src/routes/legacyScenarios.routes.ts` (`/scenarios/templates`, `/scenarios`, `POST /scenarios`, `DELETE /scenarios/:id`);
  - `apps/server/src/routes/apiRoutes.ts` сокращён до 30 direct route declarations;
  - новый срез распределения роутов сохранён в `artifacts/route_count_by_file_after_p01_iter5_2026-02-19.txt`.
- `P0-1` — `In Progress` (итерация 6):
  - вынесены broadcast/destination/proxy handlers в `apps/server/src/routes/legacyCampaigns.routes.ts` (`/campaigns`, `/destinations`, `/proxy`);
  - вынесен drafts блок в `apps/server/src/routes/legacyDrafts.routes.ts` (`/drafts/import`, `/drafts`, `POST/PUT/DELETE /drafts/:id`);
  - `apps/server/src/routes/apiRoutes.ts` сокращён до 21 direct route declarations;
  - новый срез распределения роутов сохранён в `artifacts/route_count_by_file_after_p01_iter6_2026-02-19.txt`.
- `P0-1` — `In Progress` (итерация 7):
  - вынесен leads блок в `apps/server/src/routes/legacyLeads.routes.ts` (`/leads`, `POST /leads`, `PUT /leads/:id`, `/leads/merge`, `DELETE /leads/:id`);
  - обновлён `apps/server/scripts/verify_routes.ts` (добавлен `Legacy Leads Routes`);
  - `apps/server/src/routes/apiRoutes.ts` сокращён до 16 direct route declarations;
  - новый срез распределения роутов сохранён в `artifacts/route_count_by_file_after_p01_iter7_2026-02-19.txt`.
- `P0-1` — `In Progress` (итерация 8):
  - вынесен bot-management блок в `apps/server/src/routes/legacyBots.routes.ts` (`/bots*`, `/bots/:id/webhook`);
  - вынесен content/publication блок в `apps/server/src/routes/legacyContent.routes.ts` (`/content/templates*`, `/content/publication-jobs*`);
  - `apps/server/src/routes/apiRoutes.ts` переведён в compatibility shim (0 direct route declarations, только `router.use(...)`);
  - обновлён `apps/server/scripts/verify_routes.ts` (добавлены `Legacy Bots Routes` и `Legacy Content Routes`);
  - новый срез распределения роутов сохранён в `artifacts/route_count_by_file_after_p01_iter8_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 1):
  - начата декомпозиция `apps/server/src/modules/Communication/bots/scenario.engine.ts` на runtime/actions/adapters;
  - добавлены модули `scenario-engine/types.ts`, `scenario-engine/adapters/telegram.adapter.ts`, `scenario-engine/runtime/helpers.ts`, `scenario-engine/actions/b2b.actions.ts`;
  - `scenario.engine.ts` переведён на импорт вынесенных хелперов/адаптеров без изменения публичного контракта `ScenarioEngine`;
  - метрики split и exported symbols зафиксированы в `artifacts/scenario_engine_split_iter1_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 2):
  - вынесены action-методы `ScenarioEngine` в `apps/server/src/modules/Communication/bots/scenario-engine/actions/session.actions.ts`;
  - `ScenarioEngine` оставлен как coordinator: методы `handleCarSelection/resolveRequestId/handleAddToRequest/handleAddToCatalog/handleManagerRequestAction` стали thin wrappers (delegate-only);
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 2121 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter2_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 3):
  - вынесен legacy dealer flow state-machine в `apps/server/src/modules/Communication/bots/scenario-engine/actions/dealer-flow.actions.ts`;
  - вынесен callback query processing в `apps/server/src/modules/Communication/bots/scenario-engine/actions/callback.actions.ts`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на delegate вызовы `handleDealerFlowAction`/`handleCallbackQueryAction` и сокращён до 1654 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter3_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 4):
  - вынесены entrypoint-ветки `web_app_data` и `/start` в `apps/server/src/modules/Communication/bots/scenario-engine/actions/entry.actions.ts`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на delegate вызовы `handleWebAppDataAction`/`handleStartCommandAction` и сокращён до 1505 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter4_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 5):
  - удалён дублирующий legacy-блок `TASK D` (`/setup_admin`, `/setup_channel`) в `handleUpdate`, оставлен единый активный setup flow (`setup_mode`);
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` дополнительно сокращён до 1458 строк;
  - метрики split/cleanup зафиксированы в `artifacts/scenario_engine_split_iter5_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 6):
  - вынесен активный setup flow (`/setup_admin`, `/setup_channel`, `setup_mode=CHANNEL`) в `apps/server/src/modules/Communication/bots/scenario-engine/actions/setup.actions.ts`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на delegate вызов `handleSetupCommandsAction` и сокращён до 1424 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter6_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 7):
  - вынесен `executeNode` блок `case 'ACTION'` в `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-action.actions.ts`;
  - сохранена семантика раннего выхода (`break`) через контракт `ActionExecutionResult` (`halt/continue`);
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 1066 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter7_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 8):
  - вынесены node-handlers `SEARCH_CARS`, `SEARCH_FALLBACK`, `CHANNEL_POST`, `REQUEST_BROADCAST`, `OFFER_COLLECT` в `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-broadcast.actions.ts`;
  - для канал/бродкаст веток сохранена семантика раннего выхода через `NodeExecutionResult` (`halt/continue`);
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 932 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter8_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 9):
  - добавлен lifecycle runtime helper `apps/server/src/modules/Communication/bots/scenario-engine/runtime/lifecycle.ts` (`clearActiveScenario`, `completeScenarioFlow`);
  - удалены дубли end-of-scenario блоков в `goBack`, `handleInput`, `executeNode` с единым `completeScenarioFlow` путём;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 895 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter9_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 10):
  - вынесены interaction node-handlers `QUESTION_TEXT`, `QUESTION_CHOICE`, `MENU_REPLY`, `REQUEST_CONTACT`, `QUESTION_PHOTO` в `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-interaction.actions.ts`;
  - логика `CONDITION` вынесена в helper `resolveConditionNextNodeId` (тот же модуль);
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на delegate вызовы interaction-actions; текущий размер 906 строк (рост за счёт wiring/import, при выносе switch-логики);
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter10_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 11):
  - вынесены node-handlers `DELAY` и `GALLERY` в `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-runtime.actions.ts`;
  - сохранён long-delay scheduler handoff (`scheduledJob`) и текущий gallery rendering cadence/keyboard behavior;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 882 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter11_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 12):
  - вынесены orchestration-ветки `handleInput` и `startScenario` в `apps/server/src/modules/Communication/bots/scenario-engine/runtime/session-flow.ts`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на delegate-only вызовы `handleInputRuntime`/`startScenarioRuntime` для session lifecycle;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 800 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter12_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 13):
  - вынесена session-navigation ветка `goBack` в `apps/server/src/modules/Communication/bots/scenario-engine/runtime/navigation.ts`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на thin-wrapper делегирование `goBackRuntime`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 786 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter13_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 14):
  - вынесен orchestration-dispatch `executeNode` в `apps/server/src/modules/Communication/bots/scenario-engine/runtime/node-executor.ts`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на delegate-only wrapper `executeNodeRuntime` (рекурсивная навигация через callback-контракт);
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 540 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter14_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 15):
  - вынесена registry-логика загрузки/дедупликации опубликованных сценариев в `apps/server/src/modules/Communication/bots/scenario-engine/runtime/scenario-registry.ts`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на `loadPublishedScenarios(bot)` без inline DB/select logic;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 499 строк;
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter15_2026-02-19.txt`.
- `P0-2` — `In Progress` (итерация 16):
  - вынесен orchestration-dispatch `handleUpdate` в `apps/server/src/modules/Communication/bots/scenario-engine/runtime/update-handler.ts`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` переведён на delegate-only wrapper `handleUpdateRuntime`;
  - `apps/server/src/modules/Communication/bots/scenario.engine.ts` сокращён до 127 строк (thin coordinator);
  - метрики split зафиксированы в `artifacts/scenario_engine_split_iter16_2026-02-19.txt`.
- `P0-1` — `Done`:
  - `apps/server/src/routes/apiRoutes.ts` завершён как compatibility shim (0 direct `router.get/post/put/delete/patch` handlers);
  - feature handlers вынесены в `legacy*.routes.ts` и feature routers;
  - route ownership/registry smoke подтверждён (`apps/server/scripts/verify_routes.ts` -> 90 visible root routes);
  - доказательство отсутствия direct handlers: `artifacts/apiRoutes_direct_handlers_after_p01_final_2026-02-19.txt`.
- `P0-2` — `Done`:
  - `ScenarioEngine` приведён к coordinator-only модели (`apps/server/src/modules/Communication/bots/scenario.engine.ts` = 127 строк);
  - runtime/actions/adapters разделены на `scenario-engine/runtime/*`, `scenario-engine/actions/*`, `scenario-engine/adapters/*`;
  - unit/regression валидация зелёная (`npm --prefix apps/server test` 20 files / 46 tests).
- `P0-3` — `Done`:
  - удалены implicit `company_system` fallback-ветки в user-facing auth/superadmin/requests/inventory/drafts/bots;
  - нормализован JWT tenant contract: `companyId/workspaceId` должны совпадать, mismatch-токены отклоняются (`apps/server/src/middleware/auth.ts`);
  - endpoint compatibility matrix зафиксирован в `artifacts/tenant_contract_matrix_2026-02-19.md`;
  - residual `company_system` usage audit: `artifacts/company_system_hits_after_p03_2026-02-19.txt`.
- `P0-4` — `Done`:
  - введён единый server-side feature resolver (`apps/server/src/modules/Core/system/features.resolver.ts`);
  - `settings.service` нормализует features через resolver на read/write;
  - frontend убран от hardcoded production defaults и тянет resolved flags с сервера (`apps/web/src/services/data.ts`);
  - parity evidence: `artifacts/feature_flags_parity_2026-02-19.txt`.
- `P0-5` — `Done`:
  - добавлен deploy preflight gate `infra/security_preflight.sh` (JWT/seed/webhook secret policy);
  - `infra/deploy_prod.sh` теперь hard-fail при провале security preflight;
  - `apps/server/src/config/jwt.ts` убран dev fallback вне test-среды, усилены production checks;
  - evidence: `artifacts/security_preflight_2026-02-19.txt`.
- `P0-6` — `Done`:
  - введён versioned API слой `/api/v2` с единым envelope (`apps/server/src/middleware/apiV2Envelope.ts`);
  - добавлены deprecation headers на legacy `/api/*` (`Deprecation`, `Sunset`, `Link rel=\"successor-version\"`);
  - compatibility table + deprecation schedule зафиксированы в `artifacts/api_v2_compatibility_matrix_2026-02-19.md`;
  - contract tests добавлены: `apps/server/src/__tests__/api.v2.envelope.test.ts`.
- `P1-1` — `Done (2026-02-19)`:
  - active frontend data-layer переведён на единый transport `apps/web/src/services/apiClient.ts` (query/params/patch + typed request options);
  - `apps/web/src/services/data.ts` отвязан от `ServerAdapter/DataAdapter` и оставлен как compatibility facade поверх единого клиента;
  - `apps/web/src/services/systemApi.ts` и `apps/web/src/services/showcaseService.ts` убраны с `axios` и переведены на `ApiClient`;
  - legacy adapters помечены frozen/deprecated (`apps/web/src/services/serverAdapter.ts`, `apps/web/src/services/dataAdapter.ts`).
- `P1-2` — `Done (2026-02-19)`:
  - введён canonical docs index: `docs/CANONICAL_DOCS_INDEX.md`;
  - `docs/README.md` обновлён на single source-of-truth модель;
  - конфликтные release docs переведены в frozen pointers: `docs/BACKLOG_NEXT.md`, `docs/QA_RELEASE_CHECKLIST.md`, `docs/RELEASE_AUDIT_REPORT.md`, `docs/RELEASE_BASELINE.md`.
- `P1-3` — `Done (2026-02-19)`:
  - внедрён единый script status manifest: `scripts/script_status_manifest.json`;
  - добавлена автоматическая проверка `scripts/audit_scripts.sh` (`OK/Deprecated`, syntax checks for active scripts);
  - CI дополнен этапами `Script Status Audit` и `Route Registry Smoke` в `.github/workflows/ci.yml`;
  - `Needs Fix` переведён в `0`, итоговая матрица: `OK=25`, `Deprecated=10`.
- `P1-4` — `Done (2026-02-19)`:
  - legacy infra-заглушка вынесена из active path: `infra/api/*` -> `infra/legacy/api-stub/*`;
  - добавлен `infra/legacy/README.md` с политикой использования;
  - активный deploy path подтверждён через `infra/deploy_prod.sh` + `infra/docker-compose.cartie2.prod.yml`.
- `P1-5` — `Done (2026-02-19)`:
  - добавлен reconcile job `apps/server/scripts/reconcile_media.ts` (`--execute`, `--clear-missing-refs`, `--delete-orphans`);
  - execute-проход очистил `7` missing refs и `2` orphan файла;
  - пост-проверка: `criticalMissingRefs=0`, `criticalOrphanFiles=0` (`artifacts/media_reconcile_post_2026-02-19.json`).
- `P1-6` — `Done (2026-02-19)`:
  - `infra/Caddyfile` усилен active health/retry/timeout policy для upstream `api:3001`;
  - `infra/deploy_prod.sh` переведён на phased rolling update (`api` readiness -> `web`) с явным wait-for-ready;
  - `infra/monitor.sh` переписан в controlled mode (lockfile + cooldown + health wait).
  - caddy config validation: `artifacts/caddy_validate_2026-02-19.txt`.
- `P1 verification sweep` — `Done (2026-02-20)`:
  - повторный прогон gate-проверок: `npm --prefix apps/server test`, `npm --prefix apps/server run build`, `npm --prefix apps/web run build`, `bash scripts/audit_scripts.sh`, `npx tsx scripts/verify_routes.ts`;
  - runtime smoke подтверждён: `bash scripts/smoke_read.sh`, `bash verification/smoke_test_basic.sh`, `bash verification/routes_smoke_test.sh`;
  - устранён mismatch default ports в smoke scripts для текущего runtime (`scripts/smoke_read.sh`, `verification/routes_smoke_test.sh`);
  - media reconcile dry-run подтверждён (`artifacts/media_reconcile_verify_2026-02-20.json`): `criticalMissingRefs=0`, `criticalOrphanFiles=0`.
- итоговое сводное подтверждение закрытия P0: `artifacts/p0_closure_summary_2026-02-19.md`.
 - итоговое подтверждение закрытия P1: `docs/CANONICAL_DOCS_INDEX.md`, `docs/audit/release-20260218T152454Z/40_SCRIPT_AUDIT.md`, `docs/audit/release-20260218T152454Z/60_DATA_CONTENT_AUDIT.md`.

## 1) P0 backlog (обязательно до релиза)

| ID | Задача | Owner | ETA (дата) | Риск при незакрытии | Done-критерий |
|---|---|---|---|---|---|
| P0-1 | `Done (2026-02-19)` Разбить `apps/server/src/routes/apiRoutes.ts` на feature routers + compatibility shim | Backend Lead | 2026-02-23 | регрессии API и блок релиза | route ownership 100%, `apiRoutes.ts` без новых feature-handlers |
| P0-2 | `Done (2026-02-19)` Разделить `scenario.engine.ts` на runtime/actions/adapters | Backend Lead | 2026-02-24 | нестабильный bot-runtime, трудно чинить инциденты | unit tests по слоям, coordinator-only orchestration |
| P0-3 | `Done (2026-02-19)` Нормализовать tenant contract (`companyId/workspaceId`) и убрать implicit `company_system` fallback | Backend + Architecture | 2026-02-24 | tenant leakage/403 drift | единый `TenantContext`, compatibility matrix endpoint-by-endpoint |
| P0-4 | `Done (2026-02-19)` Единая стратегия feature flags (server SoT, без front hardcoded defaults) | Backend + Frontend | 2026-02-25 | рассинхрон UI/API поведения | один resolver, integration tests на flags parity |
| P0-5 | `Done (2026-02-19)` Security preflight: strict secrets policy (JWT/seed/webhook) | Backend + DevOps | 2026-02-25 | unsafe prod start | deploy preflight hard-fail без критичных env |
| P0-6 | `Done (2026-02-19)` Ввести `/api/v2` envelope и deprecation план для legacy contract | Architecture + Backend + Frontend | 2026-02-27 | breaking без контролируемой миграции клиентов | published compatibility table + contract tests |

## 2) P1 backlog (желательно до релиза)

| ID | Задача | Owner | ETA (дата) | Риск при незакрытии | Done-критерий |
|---|---|---|---|---|---|
| P1-1 | `Done (2026-02-19)` Убрать дубли data-layer на фронте (`Data`/`serverAdapter`/domain services) | Frontend Lead | 2026-02-27 | рост дефектов API интеграции | единый typed client, legacy adapters удалены/заморожены |
| P1-2 | `Done (2026-02-19)` Обновить docs и закрыть doc drift | Tech Writer + Leads | 2026-02-26 | ошибочные инженерные решения | canonical docs index + удалённые конфликтные docs |
| P1-3 | `Done (2026-02-19)` Починить/нормализовать скрипты и включить в CI smoke-контур | Backend + QA | 2026-02-27 | ложные PASS, небезопасные операции | 100% script status OK/Deprecated, strict exits |
| P1-4 | `Done (2026-02-19)` Развести active/legacy infra файлы (`infra/api/*` и др.) | DevOps | 2026-02-26 | ошибочный deploy path | legacy помечен/вынесен, deploy использует только active stack |
| P1-5 | `Done (2026-02-19)` Закрыть runtime media/data drift (missing refs/orphan files) | Backend + Data Ops | 2026-02-27 | деградация контента и инциденты | reconcile job + отчёт нулевых критичных mismatches |
| P1-6 | `Done (2026-02-19)` Стабилизировать reverse-proxy restart behavior | DevOps | 2026-02-28 | окна 502 при релизе | снижены error spikes, readiness tuning зафиксирован |

## 3) P2 backlog (можно post-release при formal sign-off)

| ID | Задача | Owner | ETA (дата) | Риск | Done-критерий |
|---|---|---|---|---|---|
| P2-1 | Закрыть migration debt по `v41` или formal freeze legacy paths | Architecture + Backend | 2026-03-03 | долг сопровождения | принято ADR-решение с target датой |
| P2-2 | JSON schema validators для критичных JSON полей | Backend | 2026-03-03 | silent schema drift | validators + migration checks для priority entities |
| P2-3 | Оптимизировать web bundle (chunks >500kB) | Frontend | 2026-03-03 | UX/perf деградация | chunk split strategy + build warning закрыт |

## 4) Дневной план исполнения (2 недели)

| Дата | Фокус | Целевой результат |
|---|---|---|
| 2026-02-18 | baseline freeze | подтверждены evidence и scope |
| 2026-02-19 | папки/модули карта | ownership matrix готова |
| 2026-02-20 | backend core/communication | P0 дизайн по router/runtime split |
| 2026-02-21 | backend integrations/inventory/sales/v41 | dependency map и риски |
| 2026-02-22 | frontend + UI→API | план унификации data-layer |
| 2026-02-23 | data/storage/logs | integrity + retention план |
| 2026-02-24 | scripts + hardening | script status матрица закрыта |
| 2026-02-25 | data-flow contracts | `/api/v2` transition draft |
| 2026-02-26 | P0 fix wave-1 | tenant/flags/security preflight |
| 2026-02-27 | P0 fix wave-2 + P1 scripts/docs | release candidate build |
| 2026-02-28 | full verify + rollback rehearsal | gate rehearsal протокол |
| 2026-03-01 | bugfix reserve | закрытие критических дефектов |
| 2026-03-02 | freeze + go/no-go prep | финальный пакет релиза |
| 2026-03-03 | release window | решение go/no-go и релиз |

## 5) Dependency graph (критические зависимости)

1. `P0-3 tenant contract` -> `Resolved (2026-02-19)`.
2. `P0-4 feature flags` -> `Resolved (2026-02-19)`, `P1-1` можно продолжать без блокера.
3. `P0-5 security preflight` -> `Resolved (2026-02-19)`, финальный deploy gate обеспечен.
4. `P0-6 /api/v2 compatibility` -> `Resolved (2026-02-19)` после `P0-3`.
5. `P1-3 script hardening` -> `Resolved (2026-02-19)`; trusted verify stage переведён на manifest+CI gate.

## 6) Статус-модель исполнения

- `Todo`: задача создана, работа не начата.
- `In Progress`: есть PR/changeset и evidence.
- `Blocked`: внешний блокер или dependency.
- `Done`: прошёл соответствующий release gate.
- `Deferred`: перенесено в post-release с формальным обоснованием.

## 7) KPI закрытия релизного backlog

1. Все `P0` в статусе `Done`.
2. `P1` закрыт на 100% (`Done=6/6`).
3. Script coverage 100% (`OK/Deprecated`, без `Needs Fix`).
4. Route coverage 100% (owner/auth/contract/smoke).
5. Data integrity: нет критичных orphan/mismatch без mitigation.
