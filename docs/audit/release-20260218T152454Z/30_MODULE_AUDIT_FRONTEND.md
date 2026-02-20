# 30 MODULE AUDIT — FRONTEND

Дата: **2026-02-19**  
База: `apps/web/src`

## 1) Структура фронта

### Каталоги
- `pages/app` — основное приложение (protected routes).
- `pages/public` — login + public miniapp/public forms.
- `pages/superadmin` — superadmin контур.
- `modules/Telegram/*` — Telegram/MTProto UI блоки.
- `services/*` — API/data access layer.
- `contexts/*` — auth/company/lang/worker/toast/superadmin-company.
- `config/permissions.ts` — route permission matrix.

Источники:
- `docs/audit/release-20260218T152454Z/artifacts/frontend_pages_files.txt`
- `docs/audit/release-20260218T152454Z/artifacts/frontend_modules_files.txt`
- `docs/audit/release-20260218T152454Z/artifacts/frontend_services_files.txt`
- `docs/audit/release-20260218T152454Z/artifacts/frontend_contexts_files.txt`

## 2) Routing карта
- Router: `BrowserRouter` в `apps/web/src/App.tsx`.
- Public: `/login`, `/p/request`, `/p/dealer`, `/p/proposal/:id`, `/p/app`, `/p/app/:slug`.
- Protected: `/`, `/requests`, `/inventory`, `/telegram`, `/integrations`, `/settings`, `/superadmin/*`, ...

Ролевой контроль:
- `ProtectedRoute` + `canAccessRoute/firstAllowedRoute`.
- Route policy централизована в `apps/web/src/config/permissions.ts`.

## 3) Data layer и API

### Фактическая картина
- Active transport: `apps/web/src/services/apiClient.ts` (единый HTTP-контракт).
- Compatibility facade: `apps/web/src/services/data.ts`.
- Legacy adapter path (`serverAdapter`/`dataAdapter`) переведён в frozen/deprecated и не используется в active flow.

Источник: `apps/web/src/services/data.ts`, `apps/web/src/services/apiClient.ts`.

### Дублирование и пересечения
- После P1-1 active-path унифицирован:
  - generic `Data` facade работает поверх единого `ApiClient`;
  - специализированные сервисы также используют `ApiClient`;
  - `serverAdapter`/`dataAdapter` оставлены только как frozen legacy reference.

### API transport
- `ApiClient` поверх `fetch` в `apps/web/src/services/apiClient.ts`.
- Токен из `localStorage` (`cartie_token`), авто-logout на 401.
- Response envelope частично унифицирован, но в коде сохраняются разные форматы (`array` vs `{items}` fallback).

## 4) UI → API матрица (критические потоки)

| UI слой | Основные сервисы | API поверхность |
|---|---|---|
| `pages/app/Requests.tsx` | `requestsService`, `Data` | `/api/requests`, `/api/requests/:id/variants`, publish/close channel |
| `pages/app/Inventory.tsx` | `inventoryService`, `Data` | `/api/inventory` |
| `pages/app/TelegramHub.tsx` + `modules/Telegram/*` | `botEngine`, `mtproto.service`, `Data` | `/api/bots`, `/api/scenarios`, `/api/integrations/mtproto/*`, `/api/destinations` |
| `pages/app/Inbox.tsx` | `Data`, `messages/logs` | `/api/messages`, `/api/messages/logs`, `/api/inbox/*` |
| `pages/public/MiniApp.tsx` | `miniappApi`, `publicApi` | `/api/miniapp/*`, `/api/public/*` |
| `pages/app/Settings.tsx` | `systemApi`, `Data` | `/api/system/settings`, health checks |
| `pages/superadmin/*` | `superadminApi` | `/api/superadmin/*` |

## 5) Fallback логика и риски

### MiniApp/public fallback
- В `MiniApp.tsx` есть fallback slug (`system`) и fallback surface mode.
- На backend в `publicRoutes.ts`/`miniAppRoutes.ts` также есть fallback механики.
- Риск: неявное поведение при частично валидных payload/initData.

### Feature flags и defaults
- P0-4/P1-1: frontend больше не держит hardcoded production defaults в active-path.
- Feature defaults/resolution приходят с backend resolver (`/api/system/features/resolve`).

### Tenant scope
- Front работает с superadmin-company параметрами и fallback path, backend ждёт смешанный `companyId/workspaceId`.
- Риск: несогласованные tenant filters и неожиданный доступ/пустые списки.

## 6) Док-дрейф (frontend)
- `docs/MODULES/FRONTEND.md` описывает `HashRouter`, а код использует `BrowserRouter`.
- `docs/AUDIT.md` содержит старый тезис про HashRouter.

Источник: `docs/audit/release-20260218T152454Z/artifacts/docs_drift_hits.txt`.

## 7) Findings по фронту
1. Основной data-layer унифицирован, но остаётся legacy frozen код, который должен быть удалён в post-release cleanup.
2. Response contracts для legacy endpoints всё ещё имеют mixed-form (`array` vs `{items}`) и требуют полного `/api/v2` перехода.
3. `MiniApp.tsx` остаётся крупным и требует decomposition (P2-3 + tech debt track).
4. Нужен регулярный doc sync процесс, чтобы избежать повторного drift.

## 8) Что нужно к релизу
- P1 выполнен: единый transport/compat-layer + doc sync закрыты.
- P2: планомерно удалить frozen legacy adapter файлы после стабилизации релиза.
- P2: оптимизировать крупные web chunks и декомпозировать крупные страницы.
