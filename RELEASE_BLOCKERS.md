# Release Blockers Checklist

## A) DATABASE / PRISMA
- [x] Schema updated with `RequestType` enum (BUY/SELL).
- [x] Migration `20260124000000_add_request_type` verified.
- [x] `B2bRequest` table backfilled with default 'BUY'.

## B) AUTH CONSISTENCY
- [x] Frontend `AuthContext` and `apiClient` use `localStorage["cartie_token"]`.
- [x] Superadmin `Users.tsx` impersonation writes to `cartie_token`.
- [x] `client-manager.service.ts` hashes passwords for new companies.

## C) PUBLIC MINI APP
- [x] `GET /public/:slug/inventory` implemented with filters.
- [x] `POST /public/:slug/requests` implemented.
- [x] `MiniApp.tsx` updated to use public endpoints and re-fetch on filter change.

## D) HEALTH PAYLOAD ALIGNMENT
- [x] `health.controller.ts` includes top-level `bots`/`worker`.
- [x] Frontend `Health.tsx` reads correctly.

## E) SCOPE HARDENING
- [x] `seed.ts` (stub) and `settings.service.ts` updated with default feature flags.
- [x] `Layout.tsx` filters navigation based on `SystemSettings.features`.
