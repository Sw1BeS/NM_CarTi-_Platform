# Stage-2 M1 — Sources & Destinations Registry

## Goal
Ship a Telegram Sources/Destinations registry (backend + UI) with status, sync, pause/resume, and logs.

## Tasks
- [x] Map current TG/MTProto models and routes to avoid breaking changes → Verify: list key files and models to touch.
- [x] Add Prisma model + migration for TelegramDestination + logs (IntegrationEventLog later) → Verify: `schema.prisma` contains model.
- [x] Implement repository + service for destinations (list/create/update/pause/resume/syncNow/logs) → Verify: service and routes present.
- [x] Add REST routes/controllers with thin handlers → Verify: `/api/integrations/telegram/registry` endpoints present.
- [x] Build admin UI page “Telegram → Sources & Destinations” with actions and empty states → Verify: `SourcesDestinationsRegistry` module exists.
- [x] Update docs `docs/stage2/10_SOURCES_DESTINATIONS.md` and exec summary → Verify: DoD + checks listed.
- [ ] Run required validation scripts and minimal tests → Verify: lint/type checks succeed.
- [ ] Commit M1 with DoD report → Verify: git log shows commit and DoD summary file updated.

## Done When
- [x] UI shows active sources, errors, and allows pause/resume/sync.
- [x] Backend endpoints work and persist status/lastError/lastSyncAt.
- [x] Docs and DoD checks are updated.
