# Vehicle Taxonomy Source Checkpoint

Date: 2026-06-18
Status: implementation slice verified

## TodoCheckpointDraft

- Active slice: Tasks 1-4 baseline implementation.
- Continuation slice: Task 5 candidate quarantine, Task 6 parser helper extraction, Task 7 ADR.
- Current todo:
  1. Decide whether to run a local non-production seed with `EMERGENCY_FALLBACK`.
  2. Decide live provider credentials/limits for AUTO.RIA and KATOTTG/GeoNames URLs.
  3. Add operator runbook for production sync.
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
- Blockers:
  - Normal `npm --prefix apps/web install` needs `--legacy-peer-deps` due existing React 19 / `@emoji-mart/react` peer conflict.
  - Live AUTO.RIA sync needs a valid `autoriaApiKey`/`AUTORIA_API_KEY`.
  - GeoNames sync needs `GEONAMES_TSV_URL`; KATOTTG has a default CSV URL but should be rechecked before production run.
- Next step: review diff, then either commit this branch or continue with Task 5 candidate quarantine/runbook.

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
- Evidence enough for next claim? yes for current implementation slice.
- Decision: review/commit or continue to candidate quarantine.
