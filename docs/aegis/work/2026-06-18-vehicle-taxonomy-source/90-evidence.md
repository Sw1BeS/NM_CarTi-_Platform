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

Further verification pending for any live provider sync against real credentials/data URLs.
