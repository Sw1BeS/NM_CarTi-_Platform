# 10 FOLDER AUDIT

Дата: **2026-02-19**  
Источник метрик: `docs/audit/release-20260218T152454Z/artifacts/folder_metrics_src.tsv`

## Сводная матрица по папкам

| Папка | Что проверено | Факт | Риск | Решение к релизу |
|---|---|---|---|---|
| `.agent` | локальные правила/скиллы/workflows | 206 файлов, много внутренних инструкций | рассинхрон между локальными правилами и реальным CI/process | зафиксировать `docs/` как источник истины, `.agent` считать инженерным инструментом |
| `.github` | CI workflow | 1 workflow (`ci.yml`): build backend/frontend, backend tests, docker build | нет lint/contract/e2e/smoke security gates | добавить release gates в CI (см. `90_RELEASE_GATES_AND_ROLLBACK.md`) |
| `_archive` | архивный контур | старые pre-audit артефакты + `prod.env.bak.*` | риск случайного использования устаревших env/doc | пометить read-only архив, исключить из активного SoT |
| `_logs` | full-content errors/PII/secrets/incidents | 64 файла, 20M; исторические 502 при рестартах; Authorization редактируется | шум логов, большой исторический хвост, incident observability частично ручная | ввести retention/rotation и incident-метрики (см. `60_DATA_CONTENT_AUDIT.md`) |
| `apps/server` | модули/роуты/сервисы/prisma/workers | 217 source файлов; route decl=192; сильная концентрация в `apiRoutes.ts` | god-router, mixed legacy/v41, tenant fallback complexity | декомпозиция роутера и tenant-контракта (P0) |
| `apps/web` | pages/modules/services/contexts | 142 source файла; API call-sites=209; BrowserRouter | data-layer дублируется (`serverAdapter`, `data.ts`, спец-сервисы) | унифицировать API layer + контрактные типы (P1/P0) |
| `data` | full-content PG data path | 1779 файлов, 73M; WAL + base pages | рост PG data-dir без явной политики вакуума/архивации | checklist по backup/retention/vacuum |
| `docs` | doc drift vs code | canonical индекс введён (`docs/CANONICAL_DOCS_INDEX.md`), конфликтные release docs переведены в frozen | риск снижен, но нужен регулярный doc sync process | canonical docs policy зафиксирована |
| `env` | env-контракт | отдельный `env/prod.env`; ключи не полностью совпадают с реально используемыми в коде | runtime surprises из-за missing vars | ввести единый env contract matrix |
| `infra` | compose/docker/caddy/deploy | active prod-контур + legacy stub вынесен в `infra/legacy/api-stub/*` | риск ошибочного deploy path закрыт | active/legacy infra контуры разведены |
| `scripts` | root smoke/verify SQL | часть smoke-checks с legacy endpoints | ложноположительные/ложноотрицательные smoke результаты | обновить маршруты и добавить safety guards |
| `services` | назначение | директория пустая | мертвый контур, шум в структуре | либо удалить, либо документировать назначение |
| `storage` | full-content media integrity | reconcile выполнен: `criticalMissingRefs=0`, `criticalOrphanFiles=0` | остаточный non-critical orphan `_smoke/ping.txt` | периодический reconcile job внедрён |
| `verification` | smoke/e2e контур | 6 файлов; часть проверок на старые порты/URL | coverage ограничен и частично устарел | привязать к текущему compose/profile, запускать в CI |
| root-файлы | планы/аудиты/чеклисты | много параллельных md-доков | конфликт source-of-truth | определить единый релизный индекс и архивировать legacy docs |

## Подробные наблюдения

### `.github`
- CI выполняет только:
  - backend build
  - frontend build
  - backend tests
  - docker images build metadata check
- Нет обязательных gates для:
  - smoke routes
  - script health
  - doc drift
  - security/static checks

Файл: `.github/workflows/ci.yml`.

### `_logs`
- Ключевые runtime-логи:
  - `_logs/infra2_api_current.log` (~19M)
  - `_logs/infra2_web_current.log` (~1M)
- Исторический паттерн ошибок web reverse proxy:
  - `dial tcp ... connect: connection refused`
  - `lookup api ... i/o timeout`
- На текущую дату (**2026-02-18**) найдено 2 web error события (в окно рестарта), API error в этот день не зафиксировано.

Источники: `docs/audit/release-20260218T152454Z/artifacts/web_errors_2026-02-18.txt`, `docs/audit/release-20260218T152454Z/artifacts/api_errors_2026-02-18.txt`.

### `docs`
Подтвержденные расхождения:
- `docs/MODULES/FRONTEND.md` заявляет `HashRouter`, фактически `BrowserRouter`.
- `docs/MODULES/INVENTORY.md` содержит `/api/inventory/cars`, в коде canonical `/api/inventory`.
- `docs/MODULES/CORE.md` содержит `POST /api/auth/register`, фактического route нет.
- `docs/MODULES/COMMUNICATION.md` ссылается на `bot.routes.ts`, которого нет в текущей структуре.

Источник: `docs/audit/release-20260218T152454Z/artifacts/docs_drift_hits.txt`.

### `env`
Используемые сервером env vars: 26 ключей, фронтендом: 2 ключа.  
Нужен единый контракт, так как фактические env-файлы не покрывают все runtime-переменные строго.

Источники:
- `docs/audit/release-20260218T152454Z/artifacts/server_env_vars_used.txt`
- `docs/audit/release-20260218T152454Z/artifacts/web_env_vars_used.txt`
- `docs/audit/release-20260218T152454Z/artifacts/env_keys_by_file.txt`

### `infra`
- Активный контур: compose + Dockerfile + Caddy + deploy scripts.
- Обнаружен legacy/заглушечный контур: `infra/api/index.mjs` (returns 501 на `/api/*`), не совпадает с основным backend.

Решение: пометить как legacy и исключить из боевого deploy path.

### `services`
- Папка пустая (`services is empty`).
- Рекомендация: удалить из корня либо формально описать будущую роль.

## Вывод по папочному аудиту
- Архитектурно активный контур: `apps/* + infra + data + storage + _logs`.
- Главные риски папочного уровня: doc drift, legacy infra files, устаревшие smoke scripts, отсутствие строгого env contract.
