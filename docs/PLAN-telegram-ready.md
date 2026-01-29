# Telegram-Ready Release (Stage 1) - Execution Plan

## Goal
Urgent delivery of CarTié to a "product works" state with maximum focus on Telegram module (Bots/Channels/MTProto) and production-like data population.

## Work Method
- **Sequential Execution**: Work in phases A -> H in order.
- **Continuous QA**: Run quick TG flow QA after each phase.
- **Minimalism**: Keep changes minimal, safe, and directly impactful. No architectural redesigns.
- **Reproducibility**: Produce copy-paste commands labeled `[LOCAL]` or `[SERVER]` with explicit paths.
- **Idempotency**: Prefer idempotent scripts and repeatable steps.

## Phases

### Phase A: Telegram Reality Inventory (No Code Changes)
- [x] Map current Telegram-related code:
    - [x] Bots/Scenario Engine (Flow definition, state, validation)
    - [x] Channel Publishing (Request -> TG Post generation)
    - [x] MTProto Connector (Sessions, parsing, mapping)
    - [x] Web UI (Settings/Integrations)
- [x] List all TG-dependent environment variables and configs.
- [x] Identify 3 highest-risk TG failure points:
    - [x] Auth/Session expiration
    - [x] Rate limits/Retries
    - [x] Mapping/Deduplication (Post <-> Inventory/Lead/Request)
- [x] **Deliverable**: Phase-A Inventory + Risk Map.

### Phase B: End-to-End TG Flow Definition (Product Scenarios)
- [x] **Customer Lead Capture (Bot)**: Start -> Consent -> Q/A -> Submit -> Confirmation -> Admin Summary + Lead Record.
- [x] **Lead -> Request**: Admin converts Lead to Request (prefilled) OR Bot creates Request.
- [x] **Request Broadcast**: Request posted to Dealer Channel (Clean format + CTA).
- [x] **Dealer Offer**: Dealer submits offer (Bot/Link) -> Variant created -> Request marked "Has offers".
- [x] **Close & Resolve**: Admin selects offer -> Close Request -> Notifications (Contact reveal policy).
- [x] **Acceptance**: Manual simulation of these flows without dead ends.

### Phase C: MTProto Channel Parsing -> Inventory
- [x] **Parsing Logic**: Implement date range & incremental "since last sync".
- [x] **Deduplication**: Message ID + Media Hash + VIN/Price heuristics.
- [x] **Mapping**: Extract Make, Model, Year, Price, Location, Description, Photos -> Inventory.
- [x] **Provenance**: Store Channel ID, Message ID, Post URL, Parsed At.
- [x] **Admin Controls**:
    - [x] Parse range (from-to)
    - [x] Sync latest
    - [x] Last sync status + Errors
- [x] **Media**: ensure images/media handling works with existing UI.

### Phase D: "Real Data Ready" Seed (Production-Like)
- [x] **Dataset Generator**: Create idempotent seed script.
- [x] **Entities**:
    - [x] 50 Cars (Mix of brands, prices, locations).
    - [x] 20 Leads (Telegram source, various stages).
    - [x] 10 Request Drafts (Simulated from leads).
    - [x] 5 Offers (Simulated dealer responses).
- [x] **Execution**: Run seed on dev/staging.

### Phase E: TG Admin UX (Operations Panel)
- [x] **Dashboard**:
    - [x] "Bot Settings" Tab -> Add "Channel ID" & "Admin ID" fields.
    - [x] "Channel Sources" Tab -> Add "Sync Now" button per source.
    - [x] "Requests" List -> Show "Broadcasted" status icon. (Skipped: Request list not in Hub, but Status is in DB).Last Parsed).
- [ ] **Actions**:
- [x] **Actions**:
    - [x] Parse Range.
    - [ ] Sync Latest.
    - [ ] Test Message.
    - [ ] Dry-Run Parse.

### Phase F: Reliability Minimums for TG
- [ ] **Documentation**: Rollback note, Final Report.

## Final Report Format
1. Stage-1 TG Readiness Summary (Pass/Fail)
2. E2E Flows Evidence
3. Seed Dataset Summary
4. Files Changed List
5. Commands Used
6. QA Checklist Results
7. Remaining Risks + Stage-2 Backlog
