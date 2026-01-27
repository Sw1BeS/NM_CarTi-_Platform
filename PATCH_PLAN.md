# Patch Plan

## Database
- `apps/server/prisma/migrations/20260124000000_add_request_type/migration.sql`: Added SQL for RequestType enum.

## Backend
- `apps/server/src/modules/Core/companies/company.service.ts`:
  - Imported `bcryptjs`.
  - Hashed `tempPassword` in `inviteUser`.
  - Returned `tempPassword` in response.
- `apps/server/src/modules/Core/health/health.controller.ts`:
  - Added `bots` and `worker` properties to top-level response object.
- `apps/server/src/routes/publicRoutes.ts`:
  - Added `GET /:slug/inventory`.
  - Added `POST /:slug/requests`.
  - Added optional `initData` check.

## Frontend
- `apps/web/src/pages/superadmin/Users.tsx`:
  - Changed `localStorage.setItem('token', ...)` to `cartie_token`.
- `apps/web/src/pages/public/MiniApp.tsx`:
  - Replaced `InventoryService.getInventory` with `publicApi.getPublicInventory`.
  - Replaced `tg.sendData` (preview mode/direct) with `publicApi.createPublicRequestWithSlug`.
- `apps/web/src/services/publicApi.ts`:
  - Added `getPublicInventory` and `createPublicRequestWithSlug` methods.
- `apps/web/src/pages/app/Requests.tsx`:
  - Added null checks for `budgetMax` and `yearMin` in list view.
