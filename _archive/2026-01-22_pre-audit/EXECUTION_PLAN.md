# Artifact 3: Execution Plan

## Phase 1: Foundation Clean-up (P0)
- [ ] **Data Seeding Refactor**
    - Modify `apps/server/prisma/seed.ts` to make "Demo" data optional (env flag `SEED_DEMO=true`).
    - Ensure `System` and `Cartie Auto` companies are created with correct "Production" settings.
- [ ] **I18n Wrapper**
    - Add `LanguageSwitcher` component to `apps/web/src/components/Layout.tsx` or `Settings.tsx`.
    - Verify `translations.ts` covers all new keys.
- [ ] **Meta Integration Wiring**
    - Update `MetaService` to read config from DB (`Integration` model) instead of just Env (or support both).
    - Add Event Triggers in `LeadService` -> `MetaService.sendEvent('Lead')`.
    - Add Event Triggers in `RequestService` -> `MetaService.sendEvent('SubmitApplication')`.

## Phase 2: Missing Modules (P0/P1)
- [ ] **SendPulse Service**
    - Create `apps/server/src/modules/Integrations/sendpulse/sendpulse.service.ts`.
    - Implement `syncContact`, `sendEvent`.
    - Create API routes in `integration.routes.ts`.
    - Add UI in `Settings.tsx` (Integrations Tab).
- [ ] **Content Planner Verification**
    - Verify `ContentPage` and `ContentCalendarPage` api connections.

## Phase 3: UX & Visuals (P1)
- [ ] **Empty States**
    - Create reusable `EmptyState` component.
    - Apply to `Leads.tsx`, `Requests.tsx`, `Inventory.tsx`.
- [ ] **Navigation Cleanup**
    - Rename/Merge overlapping settings routes if needed.

## Phase 4: Verification (Final)
- [ ] **Browser Proof**
    - Deploy to Production.
    - Login as Admin.
    - Check all routes.
    - Verify "No Demo Data" (Clean dashboard).
    - Test "Meta" event trigger (via logs).

## Definition of Done
- System boots with `npm run start`.
- No `Demo Motors` data visible in `Cartie Auto` workspace.
- Language toggle works (EN/RU/UK).
- Meta events log to console/DB.
- SendPulse settings visible in UI.
