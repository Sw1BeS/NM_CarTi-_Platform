# Vehicle Taxonomy Source Evidence

Date: 2026-06-18

## Evidence Log

- Created isolated worktree: `/root/.config/aegis/worktrees/cartie/vehicle-taxonomy-source`
- Branch: `feature/vehicle-taxonomy-source`
- Copied approved spec and implementation plan from `/srv/cartie` into isolated worktree.
- `npm --prefix apps/server install` completed. It reported existing audit vulnerabilities; no dependency changes were intentionally kept.
- `npm --prefix apps/web install` failed on existing React 19 peer conflict with `@emoji-mart/react`; later web setup should use `--legacy-peer-deps`.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts` failed RED before repository implementation.
- `npm --prefix apps/server run prisma:generate` passed after schema update.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts` passed after repository implementation.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts` failed RED before mapper implementation.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts src/services/vehicleTaxonomy.service.test.ts` passed after mapper/fallback/wrapper implementation.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts` failed RED before route implementation.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts src/routes/miniAppLeadHandoff.routes.test.ts` passed after route implementation.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/providers/autoria.provider.test.ts src/modules/VehicleTaxonomy/providers/nhtsa.provider.test.ts src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts` failed RED before provider implementation and passed after implementation.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.test.ts` failed RED before sync service refactor and passed after injected provider/upsert implementation.
- Focused verification passed: `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts src/modules/VehicleTaxonomy/providers/autoria.provider.test.ts src/modules/VehicleTaxonomy/providers/nhtsa.provider.test.ts src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.test.ts src/services/vehicleTaxonomy.service.test.ts src/routes/miniAppLeadHandoff.routes.test.ts`
  - Result: 9 test files passed, 61 tests passed.
- `npm --prefix apps/server run build -- --pretty false` passed.
- Initial `npm --prefix apps/web run build` failed because web `node_modules` were absent in the worktree (`vite: not found`).
- `npm --prefix apps/web ci --legacy-peer-deps` passed; npm audit reported 11 existing vulnerabilities.
- `npm --prefix apps/web run build` passed; Vite reported existing warnings for old Browserslist DB and large chunks.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.test.ts` failed RED before candidate implementation and passed after implementation.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts src/services/vehicleTaxonomy.service.test.ts` passed after the public mapper imported the shared reject helper.
- `npm --prefix apps/server test -- src/services/taxonomy.test.ts` failed RED before `detectMakeFromKnownList` and passed after helper extraction.
- `npm --prefix apps/server test -- src/services/taxonomy.test.ts src/__tests__/enhanced-parsing.utils.test.ts` passed after helper extraction.
- `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.test.ts` passed after adding the admin candidate scan route.
- `npm --prefix apps/server test -- src/scripts/sync_vehicle_taxonomy.helpers.test.ts` passed.
- `npm --prefix apps/server run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK` passed in dry-run mode with counts: 14 makes, 102 models, 22 spec options, 9 places.
- `npm --prefix apps/server run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK --apply` failed as intended without `ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1`.
- Focused rollout verification passed: `npm --prefix apps/server test -- src/scripts/sync_vehicle_taxonomy.helpers.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.test.ts src/services/taxonomy.test.ts src/routes/miniAppLeadHandoff.routes.test.ts`
  - Result: 8 test files passed, 65 tests passed.
- `npm --prefix apps/server run build -- --pretty false` passed after adding the operator sync CLI.
- Read-only live smoke on `http://127.0.0.1:3002/api/miniapp/vehicle-taxonomy?slug=cartie` showed current deployed route still has no taxonomy metadata and has 16 duplicate brand IDs.
- Disposable Postgres `prisma migrate deploy` failed before the new taxonomy migration on old migration `20240320000000_add_showcase` because a blank DB lacks `workspaces`; this is a pre-existing blank-DB bootstrap issue.
- Disposable Postgres verification with `CREATE EXTENSION citext`, `prisma db push --skip-generate`, and gated `EMERGENCY_FALLBACK --apply` passed with 14 makes, 102 models, 22 spec options, 9 places, and no duplicate makes.
- Disposable public mapper smoke after local snapshot apply returned `source=LOCAL_SNAPSHOT`, `stale=false`, `brand_count=15`, `city_count=9`, and `duplicate_brand_id_count=0`.
- UI/UX continuation applied `team-skills-platform:ui-ux-promax` checklist to the MiniApp request form:
  - City selection changed from chip grid to searchable combobox.
  - Combobox controls now have 48px touch targets, visible focus rings, capped visible results, and overscroll containment.
  - City selection supports a typed fallback when taxonomy has no match; make/model selection remains dictionary-bound.
  - Numeric request fields use mobile numeric keyboard hints.
  - Global `prefers-reduced-motion` handling added.
  - MiniApp request flow rules recorded in `apps/web/docs/DESIGN_SYSTEM.md`.
- Final full verification from current HEAD on 2026-06-18:
  - `npm --prefix apps/server test` passed: 113 test files, 507 tests.
  - `npm --prefix apps/server run build -- --pretty false` passed.
  - `npm --prefix apps/web run build` passed; Vite reported existing Browserslist and large chunk warnings.

Further verification pending for any live provider sync against real credentials/data URLs.
