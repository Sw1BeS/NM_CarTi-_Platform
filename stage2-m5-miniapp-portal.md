# Stage-2 M5 — Mini App Portal

## Goal
Ship a Mini App portal: inventory + listing + favorites + request create + request status + tracking meta.

## Tasks
- [x] Add Mini App favorites persistence (DB + API) → Verify: toggle persists across reloads.
- [x] Implement Mini App request create/status APIs (tracking + tg meta) → Verify: request stored with payload + status lookup works.
- [x] Update Mini App UI routing/flows (home/listing/favorites/request/status) → Verify: full flow PV → listing → favorite → request → status.
- [x] Add tracking meta end-to-end (start_param/utm/ref + tg identity) → Verify: payload stored in B2bRequest.
- [x] Update docs `docs/stage2/40_MINIAPP_PORTAL.md` + exec summary → Verify: DoD + checks updated.
- [x] Run required validation scripts and minimal tests (type_coverage) → Verify: checks green.
- [x] Commit M5 with DoD report → Verify: git log shows commit and DoD summary file updated.

## Done When
- [x] User can browse inventory, open listing, favorite, submit request, and check status.
- [x] Requests include tracking + tg identity in payload.
- [x] Favorites persist per tg user / visitor key.
