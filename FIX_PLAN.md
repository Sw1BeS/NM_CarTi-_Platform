# Fix Plan: Release 1.0

This plan outlines the critical fixes applied to reach a release-ready state.

## 1. Critical Blockers (Infrastructure)
*   [x] **Prisma Singleton:** Prevent "Too many DB connections" by enforcing a singleton pattern in `settings.service.ts` and `mtproto-mapping.service.ts`.
*   [x] **Auth Context:** Fix white-screen issues on refresh by ensuring `/auth/me` returns the full User + Workspace context (matching `/login`).
*   [x] **API Config:** Standardize frontend API base URL handling to respect `VITE_API_URL`.

## 2. Data Integrity & Flows
*   [x] **Request Types:** Introduce `BUY` vs `SELL` types for B2B Requests to support both workflows explicitly.
*   [x] **Inbox -> Lead:** Implement "Auto-Lead Creation" in the Telegram pipeline (`enrichContext`). New users messaging the bot now automatically become Leads, enabling the Inbox "Create Request" flow.
*   [x] **Frontend Inputs:** Update `RequestList` to allow selecting the Request Type.

## 3. Cleanup
*   [x] **Navigation:** Hide "Future" modules (Integrations, Company Settings) that are not ready for Release 1.0.
*   [x] **Documentation:** Create `RELEASE_BLUEPRINT.md` and `TEST_CHECKLIST.md`.

## 4. Known Issues / Next Steps
*   **Prisma Version:** Environment reports Prisma 7 compatibility issues with `schema.prisma`. Ensure the deployment pipeline uses the version defined in `package.json`.
*   **Public API:** The "Dealer Portal" currently relies on `apps/web` direct logic. Future update should expose a dedicated public API for better security.
