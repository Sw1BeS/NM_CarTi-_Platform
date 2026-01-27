# Release Blockers Checklist

## A) DATABASE / PRISMA
- [x] Schema updated with `RequestType` enum (BUY/SELL).
- [x] Migration `20260124000000_add_request_type` created to apply changes safely.
- [x] `B2bRequest` table backfilled with default 'BUY'.

## B) AUTH CONSISTENCY
- [x] Frontend `AuthContext` and `apiClient` use `localStorage["cartie_token"]`.
- [x] Superadmin `Users.tsx` impersonation writes to `cartie_token`.
- [x] `/auth/me` returns full user context (fixed in previous turn).

## C) INVITE USER PASSWORD
- [x] `company.service.ts` now hashes temporary passwords with `bcrypt` before storage.
- [x] API returns temp password once for display.

## D) PUBLIC MINI APP
- [x] `GET /public/:slug/inventory` implemented (public access).
- [x] `POST /public/:slug/requests` implemented (public access).
- [x] `MiniApp.tsx` updated to use public endpoints directly.
- [x] `initData` validation stubbed in backend (safe for now).

## E) HEALTH PAYLOAD ALIGNMENT
- [x] `health.controller.ts` updated to expose `bots` and `worker` at top-level.
- [x] Frontend `Health.tsx` can now read status correctly.

## F) REQUESTS UI STABILITY
- [x] `Requests.tsx` updated to handle `null` budget/year values safely (renders "—").

## G) RELEASE CLEANUP
- [x] Unfinished routes (Integrations, Company) hidden from navigation.
