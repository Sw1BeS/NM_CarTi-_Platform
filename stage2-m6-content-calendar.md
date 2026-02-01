# Stage-2 M6 — Content/Calendar

## Goal
Deliver templates + preview + schedule + status/retry for Telegram content publishing.

## Tasks
- [x] Templates CRUD + preview endpoint → Verify: preview renders {title}/{price}/{year}/{link}.
- [x] Publication jobs queue + retry + results → Verify: status/lastError/result visible.
- [x] Content UI: templates, variables, preview, schedule, status filter → Verify: jobs list shows status + result.
- [x] Update docs `docs/stage2/50_CONTENT_CALENDAR.md` + exec summary → Verify: DoD + checks updated.
- [x] Run required validation scripts and minimal tests (type_coverage) → Verify: checks green.
- [x] Commit M6 with DoD report → Verify: git log shows commit and DoD summary file updated.

## Done When
- [x] Templates support variables + preview.
- [x] Publication jobs show status/errors and retry in UI.
- [x] Content manager supports schedule/publish flow.
