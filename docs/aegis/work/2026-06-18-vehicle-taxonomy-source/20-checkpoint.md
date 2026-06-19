# Vehicle Taxonomy Source Checkpoint

Date: 2026-06-18
Status: implementation, UI/UX, compatibility, and controlled vocabulary slice verified

## TodoCheckpointDraft

- Active slice: Tasks 1-4 baseline implementation.
- Continuation slice: Task 5 candidate quarantine, Task 6 parser helper extraction, Task 7 ADR.
- Rollout slice: safe operator CLI and staging runbook.
- UI/UX slice: MiniApp request form scalability and Pro Max mobile interaction pass.
- Full-source operator slice: explicit full model fan-out and richer Ukraine place import.
- Compatibility slice: local vehicle rules overlay for impossible fuel/body choices.
- Controlled vocabulary slice: backend canonicalization for MiniApp requests and inventory writes.
- Candidate moderation slice: review queue API and alias-safe approval path.
- Current todo:
  1. Apply migration on verified staging/dev DB.
  2. Run `vehicle-taxonomy:sync` dry-run on staging/dev.
  3. Review provider counts for `AUTO_RIA --all-models` and `KATOTTG --include-settlements`.
  4. Run public MiniApp smoke.
  5. Apply the reviewed snapshot on staging/dev using the write gate.
  6. Decide live provider credentials/limits for AUTO.RIA and KATOTTG/GeoNames URLs before production.
- Completed todos:
  - Approved spec copied into isolated worktree.
  - Implementation plan copied into isolated worktree.
  - Aegis index updated in isolated worktree.
  - Server dependencies installed.
  - Task 1 RED repository test recorded.
  - Additive taxonomy Prisma models and migration added.
  - Repository/types implemented.
  - Task 1 GREEN repository verification passed.
  - Task 2 RED service tests recorded.
  - Public mapper implemented with local snapshot first, emergency fallback second.
  - Observed inventory removed as a public taxonomy source.
  - Compatibility wrapper preserved at `apps/server/src/services/vehicleTaxonomy.service.ts`.
  - Task 3 route tests recorded and implemented for public/admin endpoints.
  - `apps/server/src/index.ts` mounts `/api/vehicle-taxonomy` and `/api/v2/vehicle-taxonomy`.
  - Task 4 provider adapters implemented for AUTO.RIA, NHTSA vPIC, KATOTTG CSV, and GeoNames TSV.
  - Sync service supports injected providers, dry-run counts, and non-dry-run upserts into local taxonomy tables.
  - Frontend MiniApp API type accepts optional taxonomy metadata.
  - Candidate quarantine service added for rejected observed-inventory model labels.
  - Admin route added: `POST /api/vehicle-taxonomy/candidates/scan-observed`.
  - `detectMakeFromKnownList` extracted for synchronous parser compatibility.
  - ADR added for vehicle taxonomy local snapshot ownership.
  - Safe operator CLI added: `npm --prefix apps/server run vehicle-taxonomy:sync`.
  - Write-mode gate added: `ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1`.
  - Rollout runbook added under `docs/aegis/work/2026-06-18-vehicle-taxonomy-rollout/`.
  - MiniApp city selection changed from chip grid to searchable combobox.
  - `SearchableSelect` and `MultiSelectCombobox` updated for 48px touch targets, visible focus states, capped result lists, and overscroll containment.
  - City combobox supports a typed fallback when taxonomy has no match; make/model selection remains dictionary-bound.
  - Request form numeric fields use mobile numeric keyboard hints.
  - `prefers-reduced-motion` handling added globally.
  - MiniApp request flow design rules recorded in `apps/web/docs/DESIGN_SYSTEM.md`.
  - Combobox search matching extracted to `searchableOptions.ts` and shared by single/multi select controls.
  - Search now covers compact punctuation-free queries, aliases, and Kyiv/Kiev/Киев matching for Ukrainian city labels.
  - Focused web-helper regression test added for combobox search behavior.
  - Sync API/CLI now supports explicit full model fan-out via `--all-models` or `modelMakeLimit: null`.
  - KATOTTG import now supports `--include-settlements` for richer Ukraine city selector coverage.
  - KATOTTG and GeoNames providers can read local file paths as well as HTTP URLs.
  - KATOTTG provider supports `KATOTTG_AUTHORIZATION`/`KATOTTG_API_TOKEN` for authenticated CSV sources.
  - Rollout runbook now includes full AUTO.RIA/KATOTTG dry-run/apply commands and source notes.
  - Public taxonomy contract now supports optional `constraints` on brands and models.
  - Rules overlay marks Tesla/Lucid/Rivian as EV-only and known EV models as electric-compatible.
  - MiniApp request form filters fuel/body options by active brand/model constraints and clears incompatible selections.
  - `VehicleTaxonomyService` now canonicalizes request criteria and inventory specs against the local snapshot by id, label, aliases, and provider external ids.
  - MiniApp lead intents, B2B requests, and inventory create/update/bulk writes now pass through backend taxonomy canonicalization.
  - Unknown brand/model/spec/city values are recorded as `VehicleTaxonomyCandidate` evidence rather than promoted to public dictionaries.
  - Impossible combinations such as Tesla plus non-electric fuel are removed from canonical criteria/specs and recorded in taxonomy issues.
  - Candidate queue API now supports listing candidates and reviewing candidates as `NEW`, `APPROVED`, or `REJECTED`.
  - Candidate approval can create/update a `NormalizationAlias` for brand/model/city, but cannot create new public canonical rows.
- Evidence refs:
  - Worktree: `/root/.config/aegis/worktrees/cartie/vehicle-taxonomy-source`
  - Branch: `feature/vehicle-taxonomy-source`
  - `npm --prefix apps/server run prisma:generate` passed.
  - `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts` passed.
  - Focused taxonomy/MiniApp test command passed: 9 files, 61 tests.
  - `npm --prefix apps/server run build -- --pretty false` passed.
  - `npm --prefix apps/web ci --legacy-peer-deps` passed.
  - `npm --prefix apps/web run build` passed.
  - Candidate/route/parser continuation tests passed.
  - `vehicle-taxonomy:sync` dry-run passed with `EMERGENCY_FALLBACK`.
  - `vehicle-taxonomy:sync --apply` without write gate failed as intended before DB writes.
  - Disposable Postgres `migrate deploy` exposed a pre-existing blank-DB migration-chain issue in `20240320000000_add_showcase`.
  - Disposable Postgres `db push --skip-generate` plus gated `EMERGENCY_FALLBACK --apply` passed.
  - Disposable public mapper smoke returned `LOCAL_SNAPSHOT`, `stale=false`, and zero duplicate brand IDs.
  - Final full server suite passed after UI/UX continuation: 113 files, 507 tests.
  - Final server TypeScript build passed.
  - Final web production build passed with existing Browserslist/chunk-size warnings only.
  - Search-focused test passed: `npm --prefix apps/server test -- src/routes/miniappComboboxSearch.web.test.ts`, 4 tests.
  - Final full server suite after search extraction passed: 114 files, 511 tests.
  - Final server TypeScript build after search extraction passed.
  - Final web production build after search extraction passed with existing Browserslist/chunk-size warnings only.
  - Full-source focused tests passed: `geoplaces.provider`, `sync_vehicle_taxonomy.helpers`, `vehicleTaxonomy.routes`, and `vehicleTaxonomy.sync.service`, 18 tests.
  - External source check on 2026-06-19 confirmed AUTO.RIA requires `api_key`; `api.directory.org.ua/api/katottg/download/csv` returned `{"detail":"Not authenticated"}` without auth; GeoNames `UA.zip` was reachable.
  - Full-source CLI dry-run passed with `--all-models --include-settlements` on `EMERGENCY_FALLBACK`.
  - Compatibility focused tests passed: `vehicleTaxonomy.service`, `miniappVehicleCompatibility.web`, and `miniappComboboxSearch.web`, 11 tests.
  - Controlled vocabulary focused tests passed: `vehicleTaxonomy.service`, 9 tests.
  - MiniApp route regression after canonicalization passed: `miniAppLeadHandoff.routes`, `telegramKeyboardSubmit.web`, and `miniappVehicleCompatibility.web`, 55 tests.
  - Server TypeScript build after controlled vocabulary canonicalization passed.
  - Final full server suite after controlled vocabulary canonicalization passed: 116 files, 531 tests.
  - Final web production build after controlled vocabulary canonicalization passed with existing Browserslist/chunk-size warnings only.
  - Candidate moderation focused tests passed: `vehicleTaxonomy.candidates` and `vehicleTaxonomy.routes`, 14 tests.
  - Server TypeScript build after candidate moderation passed.
  - Final full server suite after full-source continuation passed: 114 files, 517 tests.
  - Final server TypeScript build after full-source continuation passed.
  - Final web production build after full-source continuation passed with existing Browserslist/chunk-size warnings only.
- Blockers:
  - Normal `npm --prefix apps/web install` needs `--legacy-peer-deps` due existing React 19 / `@emoji-mart/react` peer conflict.
  - Live AUTO.RIA sync needs a valid `autoriaApiKey`/`AUTORIA_API_KEY`.
  - KATOTTG production sync needs a verified CSV source or auth token; the old unauthenticated Directory API path is not currently enough.
  - GeoNames sync needs an unzipped TSV via `GEONAMES_TSV_URL`; official `UA.zip` is reachable but not parsed directly by this adapter.
- Next step: apply migration and gated snapshot sync only after a verified staging/dev `DATABASE_URL` is provided or confirmed.

## ResumeStateHint

Resume from the isolated worktree, not `/srv/cartie`.

```bash
cd /root/.config/aegis/worktrees/cartie/vehicle-taxonomy-source
git status --short --branch
```

## DriftCheckDraft

- Does current work serve original intent? yes.
- Compatibility boundary held? yes; existing MiniApp route shape is preserved and metadata is additive.
- New owner/fallback/adapter appeared? yes; owner module, fallback, routes, providers, and sync service are implemented.
- Retirement track explicit? yes in parent plan.
- Evidence enough for next claim? yes for isolated rollout verification; live write-run remains intentionally blocked.
- Decision: controlled vocabulary implementation is complete in the isolated worktree; continue only with full regression/web verification and then a verified staging/dev target for gated snapshot sync.
