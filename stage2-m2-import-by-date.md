# Stage-2 M2 — MTProto Import by Date Range + Preview

## Goal
Enable date-range imports (UTC, toDate exclusive), preview 5–10 messages with skip reasons, and run imports as jobs processed by the MTProto worker.

## Tasks
- [x] Align import semantics (fromDate inclusive, toDate exclusive, UTC) in preview + worker → Verify: boundary tests with mock dates.
- [x] Add preview skipReason (code + message) and mapped flag → Verify: preview response includes mapped + skipReason.
- [x] Update MTProto worker to process import jobs (single worker) → Verify: scheduler calls mtproto worker job loop.
- [x] Update UI form + payload (UTC, toDate exclusive) and preview rendering → Verify: UI shows UTC note and skipReason.
- [x] Update docs `docs/stage2/20_IMPORT_BY_DATE.md` + exec summary → Verify: DoD + checks reflect new semantics.
- [x] Run required validation scripts and minimal tests → Verify: lint/type checks succeed.
- [ ] Commit M2 with DoD report → Verify: git log shows commit and DoD summary file updated.

## Done When
- [x] Date-range import is deterministic (UTC, toDate exclusive) with idempotent re-runs.
- [x] Preview shows mapped=true/false + skipReason per message.
- [x] Jobs run through MTProto worker and status visible in UI.
