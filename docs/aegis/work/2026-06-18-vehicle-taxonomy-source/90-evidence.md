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
- Search correctness continuation on 2026-06-19:
  - Added shared `searchableOptions.ts` owner for MiniApp combobox matching.
  - Added regression coverage for label/alias search, punctuation-free queries, Kyiv/Kiev/Киев matching, visible result caps, and custom city fallback behavior.
  - RED: `npm --prefix apps/server test -- src/routes/miniappComboboxSearch.web.test.ts` failed before helper extraction because the helper module did not exist.
  - GREEN: `npm --prefix apps/server test -- src/routes/miniappComboboxSearch.web.test.ts` passed: 1 file, 4 tests.
  - Full regression: `npm --prefix apps/server test` passed: 114 test files, 511 tests.
  - `npm --prefix apps/server run build -- --pretty false` passed.
  - `npm --prefix apps/web run build` passed; Vite reported existing Browserslist and large chunk warnings.

Further verification pending for any live provider sync against real credentials/data URLs.

Full-source operator continuation on 2026-06-19:

- Verified current public docs/sources:
  - AUTO.RIA Developers documents `GET /auto/categories/:categoryId/marks` and `GET /auto/categories/:categoryId/marks/:markId/models`, both requiring `api_key`.
  - NHTSA vPIC documents make/model endpoints and warns that all-model fan-out can be slow.
  - Mindev/Data.gov.ua publish official KATOTTG workbook resources; Data.gov.ua dataset states open data can be freely reused with attribution.
  - GeoNames publishes daily country dumps; `UA.zip` returned HTTP 200 and `Content-Length: 2191970` on 2026-06-19.
- Firecrawl search was attempted but the configured MCP returned HTTP 401, so verification used built-in web search plus direct `curl`.
- Direct endpoint checks on 2026-06-19:
  - `curl -L -I https://developers.ria.com/auto/categories/1/marks` returned HTTP 403 without `api_key`, matching the docs.
  - `curl -L --range 0-2048 https://api.directory.org.ua/api/katottg/download/csv` returned `{"detail":"Not authenticated"}`.
  - `curl -L -I https://download.geonames.org/export/dump/UA.zip` returned HTTP 200.
- Added explicit full fan-out support:
  - CLI accepts `--all-models` and `--model-make-limit=all`.
  - Admin sync route accepts `allModels: true` or `modelMakeLimit: "all"`.
  - Sync metadata records `modelMakeLimit: "all"` for dry-run/apply traceability.
- Added richer Ukraine place import:
  - CLI accepts `--include-settlements`.
  - KATOTTG parser includes `settlement` rows only when explicitly requested.
  - KATOTTG provider can read `KATOTTG_CSV_URL` from an HTTP URL, `file://` URL, or local absolute path.
  - KATOTTG provider accepts `KATOTTG_AUTHORIZATION` or `KATOTTG_API_TOKEN`.
  - GeoNames provider can read `GEONAMES_TSV_URL` from HTTP or local TSV sources.
- Focused verification passed:
  - `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts src/scripts/sync_vehicle_taxonomy.helpers.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.test.ts`
  - Result: 4 files, 18 tests passed.
- CLI dry-run passed:
  - `npm --prefix apps/server run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK --all-models --include-settlements`
  - Result: `mode=DRY_RUN`, `modelMakeLimit=all`, `includeSettlements=yes`, counts 14 makes, 102 models, 22 spec options, 9 places.
- Final verification passed:
  - `npm --prefix apps/server run build -- --pretty false`
  - `npm --prefix apps/server test`
  - `npm --prefix apps/web run build`
  - Result: server build passed; full server suite passed with 114 files and 517 tests; web production build passed with existing Browserslist/chunk-size warnings only.

Compatibility continuation on 2026-06-19:

- Researched free and freemium specs sources:
  - NHTSA vPIC is open and official for make/model/VIN-style data, but it is US-centric and not a full Ukraine trim/spec source.
  - AUTO.RIA docs expose Ukraine marketplace filters for fuel, gearbox, engine volume, power, body style, year, region/city and other search params; it requires `api_key`.
  - CarAPI and API Ninjas expose deeper trim/spec APIs, but are key/subscription oriented for production use.
- Added optional `constraints` contract to public taxonomy brands/models.
- Added backend rules overlay:
  - EV-only brands: Tesla, Lucid, Rivian.
  - Known EV model rules: Porsche Taycan, Nissan Leaf/Ariya, Kia EV*, Hyundai IONIQ 5/6, VW ID.*, Audi e-tron, BMW i*, Mercedes EQ*, Volvo EX*.
  - Tesla body rules: Model 3 sedan, Model S liftback, Model X/Y SUV, Cybertruck pickup.
- Added frontend compatibility helper and MiniApp request filtering:
  - single selected brand/model applies constraints;
  - broad multi-brand requests stay unfiltered;
  - incompatible fuel/body selections are cleared after brand/model changes.
- Focused verification passed:
  - `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts src/routes/miniappVehicleCompatibility.web.test.ts src/routes/miniappComboboxSearch.web.test.ts`
  - Result: 3 files, 11 tests passed.
- Final verification passed:
  - `npm --prefix apps/server run build -- --pretty false`
  - `npm --prefix apps/web run build`
  - `npm --prefix apps/server test`
  - Result: server build passed; web production build passed with existing Browserslist/chunk-size warnings only; full server suite passed with 115 files and 521 tests.

Controlled vocabulary enforcement continuation on 2026-06-19:

- Reframed the implementation from exhaustive catalog dumping to dictionary-backed correctness:
  - AUTO.RIA/KATOTTG/GeoNames/NHTSA remain source feeders for the local snapshot.
  - Runtime MiniApp, B2B request, and inventory writes use the local taxonomy snapshot as the contract.
  - Unknown user values are recorded as `VehicleTaxonomyCandidate` evidence and stay out of public dictionaries until reviewed.
- Added backend canonicalization in `VehicleTaxonomyService`:
  - matches brand/model/spec/city by `id`, `label`, aliases, and provider `externalIds`;
  - validates model-within-brand relationships;
  - applies fuel/body/transmission/drive compatibility constraints;
  - preserves unknown cities/custom text in request payloads while marking them as candidates;
  - stores inventory taxonomy diagnostics under `specs._taxonomy`.
- Added English spec/id synonyms for API clients that send `electric`, `diesel`, `automatic`, `sedan`, `suv`, `awd`, etc.; these map onto the same canonical ids used by the Ukrainian taxonomy labels.
- Connected canonicalization to write surfaces:
  - `POST /api/miniapp/lead-intents`
  - `POST /api/miniapp/requests`
  - inventory create/update/bulk update routes.
- Added endpoint-level contract tests:
  - MiniApp route tests assert canonicalized criteria and taxonomy diagnostics are passed to downstream request services.
  - Inventory route tests assert canonicalized specs/location are persisted on create and update.
- Focused verification passed:
  - `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts`
  - Result: 1 file, 9 tests passed.
  - Covered Tesla + diesel rejection, English `electric/automatic/liftback` mapping, provider external id matching, unknown city candidate capture, and inventory specs diagnostics.
- Route regression passed:
  - `npm --prefix apps/server test -- src/routes/miniAppLeadHandoff.routes.test.ts src/routes/telegramKeyboardSubmit.web.test.ts src/routes/miniappVehicleCompatibility.web.test.ts`
  - Result: 3 files, 55 tests passed.
- Endpoint contract verification passed:
  - `npm --prefix apps/server test -- src/routes/miniAppLeadHandoff.routes.test.ts src/modules/Inventory/inventory/inventory.routes.test.ts`
  - Result: 2 files, 50 tests passed.
- TypeScript verification passed:
  - `npm --prefix apps/server run build -- --pretty false`
- Final backend regression passed:
  - `npm --prefix apps/server test`
  - Result: full server suite passed with 116 files and 537 tests.
- Final regression verification passed after controlled vocabulary enforcement:
  - `npm --prefix apps/server test`
  - `npm --prefix apps/web run build`
  - Result: full server suite passed with 116 files and 531 tests; web production build passed with existing Browserslist/chunk-size warnings only.

Candidate moderation continuation on 2026-06-19:

- Added candidate queue API:
  - `GET /api/vehicle-taxonomy/candidates`
  - `POST /api/vehicle-taxonomy/candidates/:id/review`
- Review statuses are constrained to `NEW`, `APPROVED`, and `REJECTED`.
- Approved `make`, `model`, and `city` candidates can create/update a `NormalizationAlias` pointing to an existing canonical label.
- Review API intentionally does not create new public make/model/city rows; new canonical dictionary entries remain owned by reviewed provider sync/apply.
- Focused verification passed:
  - `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts`
  - Result: 2 files, 14 tests passed.
- TypeScript verification passed:
  - `npm --prefix apps/server run build -- --pretty false`

MiniApp search contract continuation on 2026-06-19:

- Extended MiniApp searchable dictionaries to index canonical `id` and provider `externalIds`, not only labels and aliases.
- Kept `aria-activedescendant` stable by deriving safe DOM ids for provider values containing punctuation/spaces.
- Propagated taxonomy `externalIds` into brand/model combobox options and MiniApp submit normalization.
- Focused verification passed:
  - `npm --prefix apps/server test -- src/routes/miniappComboboxSearch.web.test.ts src/routes/miniappVehicleCompatibility.web.test.ts src/routes/miniAppLeadHandoff.routes.test.ts src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts`
  - Result: 4 files, 66 tests passed.
- Build/regression verification passed:
  - `npm --prefix apps/server run build -- --pretty false`
  - `npm --prefix apps/web run build`
  - `npm --prefix apps/server test`
  - Result: server build passed; web production build passed with existing Browserslist/chunk-size warnings only; full server suite passed with 116 files and 539 tests.
- Browser smoke passed against a temporary same-origin mock API on `http://127.0.0.1:4177/p/app/cartie?mode=readonly`:
  - opening MiniApp in mobile viewport rendered the request form without console errors;
  - brand search `tes` returned `Tesla`;
  - model search by provider id `777` returned `Model 3`;
  - Tesla Model 3 narrowed body type to `Седан`;
  - Tesla Model 3 narrowed fuel to `Електро` only;
  - city search `kiev` returned `Київ` and did not show a custom-city action while a dictionary match existed.

TDD duplicate/search UX continuation on 2026-06-19:

- TDD route: strict. Production code changes were preceded by RED tests.
- RED tests observed:
  - `vehicleTaxonomy.service.test.ts` failed because provider duplicate metadata for `Mercedes-Benz` / `Mercedes Benz` and duplicate `GLE` models was not merged.
  - `vehicleTaxonomy.service.test.ts` failed because duplicate city/spec external ids were not merged across local snapshot rows.
  - `miniappComboboxSearch.web.test.ts` failed because loose alias matches could rank ahead of exact/prefix label matches.
  - `miniappComboboxSearch.web.test.ts` failed because selected multi-select values remained in suggestions and equivalent options like `Tesla` / `TESLA` rendered twice.
- GREEN changes:
  - public taxonomy merge now deduplicates makes, models, cities, and spec options by canonical labels while preserving aliases and provider `externalIds`;
  - MiniApp search now ranks exact direct label/id matches first, then label prefixes, then looser alias/external-id matches;
  - MiniApp search deduplicates equivalent options before rendering;
  - multi-select suggestions exclude already selected values, leaving selected values only in chips.
- Focused verification passed:
  - `npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts src/routes/miniappComboboxSearch.web.test.ts src/routes/miniappVehicleCompatibility.web.test.ts src/routes/miniAppLeadHandoff.routes.test.ts`
  - Result: 4 files, 71 tests passed.
- Build/regression verification passed:
  - `npm --prefix apps/server run build -- --pretty false`
  - `npm --prefix apps/web run build`
  - `npm --prefix apps/server test`
  - Result: server build passed; web production build passed with existing Browserslist/chunk-size warnings only; full server suite passed with 116 files and 544 tests.
- Browser smoke passed against a temporary same-origin mock API on `http://127.0.0.1:4178/p/app/cartie?mode=readonly` with intentionally duplicated taxonomy payload:
  - duplicate `Tesla` / `TESLA` API brands rendered as one `Tesla` suggestion for `tes`;
  - after selecting `Tesla`, `Tesla` disappeared from remaining brand suggestions;
  - model search `model 3` ranked `Model 3` before noisy alias match `M3`;
  - duplicate `MODEL 3` did not render as a second suggestion;
  - after selecting `Model 3`, it disappeared from remaining model suggestions;
  - Tesla Model 3 still narrowed body type to `Седан` and fuel to `Електро`;
  - Playwright reported 0 console errors.
