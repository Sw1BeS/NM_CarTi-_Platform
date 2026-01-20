# File Structure Analysis

## Root Directory (`/srv/cartie/apps/cartie2_repo`)
- `apps/`: Monorepo-style source code.
    - `server/`: Express + Prisma Backend.
    - `web/`: Vite + React Frontend.
- `infra/`: Docker production orchestration.
- `docs/`: Project documentation and plans.
- `.env`: Global environment variables (shared by Compose).

## Backend Structure (`apps/server`)
### `src/modules`
Distinct feature-based modules.
- **auth/**: `auth.routes.ts` (Login/Me). Logic embedded in routes.
- **bots/**: `bot.routes.ts`, `bot.service.ts`, `scenario.engine.ts`. Well layered.
- **companies/**: `company.routes.ts`, `company.service.ts`.
- **inventory/**: `inventory.routes.ts`. **MISSING SERVICE LAYER** (Logic in controller).
- **users/**: `user.service.ts` (Seeding).

### `src/services`
Shared utilities.
- `v41/readService.ts`: **Critical**. Abstraction over v4.1 DB tables (`workspaces`, `users`).
- `v41/writeService.ts`: Write abstraction.
- `prisma.ts`: DB Client.

## Frontend Structure (`apps/web`)
### `src/pages`
Flat structure containing all Route Components.
- `Login.tsx`: Entry point.
- `Dashboard.tsx`: Main view.
- `Content*.tsx`: CMS features.

### `src/services`
API Clients matching Backend modules.
- `inventory.ts`
- `requests.ts`
- `auth.ts`

## Integrity Findings
1.  **Inconsistent Layering**: `inventory` module uses direct Prisma calls in routes, while `companies` uses a Service layer.
2.  **Auth Complexity**: `auth.routes.ts` mixes legacy `bcrypt` checks with v4.1 `readService` lookups.
3.  **Type Duplication**: Frontend defines types in `types.ts` that mirror Backend Prisma models manually.
