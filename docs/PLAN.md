# Production Readiness Execution Plan

## Phase 1: Foundations & Security (P0)
**Goal**: Secure the application and ensure critical integrations are safe and functional.

1.  **Meta Pixel Fix**
    - [ ] Update `apps/server/src/modules/Integrations/meta.service.ts` to use `crypto` for SHA256 hashing of user data.
    - [ ] Verify `sendMetaEvent` is called in relevant flows (Leads, Requests).

2.  **SendPulse Implementation**
    - [ ] Implement `syncToMailingList` in `apps/server/src/modules/Integrations/sendpulse/sendpulse.service.ts`.
    - [ ] Connect `integration.service.ts` to call SendPulse service on lead creation/update (if active).
    - [ ] Ensure `Test Connection` validates actual API connectivity.

3.  **Env & Configuration**
    - [ ] Audit `.env.example` to include `META_PIXEL_ID`, `META_ACCESS_TOKEN`, `SENDPULSE_ID`, `SENDPULSE_SECRET` (as defaults or documentation).
    - [ ] Ensure `systemApi` exposes safe configuration to frontend.

## Phase 2: Core Functionality & Integrations (P1)
**Goal**: Ensure all main modules work with real data and external services.

1.  **Autoria/Inventory**
    - [ ] Review `autoria.service.ts`. If real API is not available, ensure the mock is clearly labeled or replaced with a "Manual Mode" if appropriate.
    - [ ] Verify `Inventory` page CRUD operations.
    - [ ] **Crucial**: Ensure every sub-module (Normalization, etc.) has a visible UI or Modal.

2.  **WhatsApp & Unified Inbox**
    - [ ] Address `TODO: Route to Unified Inbox` in `whatsapp.service.ts`.
    - [ ] Verify message flow from WhatsApp -> Inbox.
    - [ ] Verify "Reply", "Archive", and "Delete" buttons work in UI.

3.  **UI Completeness (Mandatory)**
    - [ ] **Audit**: Verify every registered module has a corresponding Page or Working Modal. No backend-only "ghost" modules allowed without admin interface.
    - [ ] **Functional Smoke Test**: Click every button in the core flows (Create, Edit, Delete, Connect, Save).


## Phase 3: UX Polish & Empty States (P2)
**Goal**: Remove "under construction" feel.

1.  **Empty States Audit**
    - [ ] Walk through `Leads`, `Inbox`, `Inventory`. If empty, show "Create New" or helper text.
    - [ ] check `translations.empty-states.ts` usage.

2.  **Dashboard**
    - [ ] Ensure Dashboard widgets use `requestsService` and `leadsService` for counts, not hardcoded numbers.

## Phase 4: Final Verification
1.  **End-to-End Test**
    - [ ] Visitor -> Lead -> CRM -> SendPulse/Meta Event.
    - [ ] Admin -> Inventory -> Edit -> Save.

2.  **Browser Proof**
    - [ ] Screenshots of Settings -> Integrations (Connected).
    - [ ] Screenshot of Lead in CRM.
