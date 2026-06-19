# Vehicle Taxonomy Rollout Runbook

Date: 2026-06-18
Status: implementation verified; full-source operator path added; ready for staging operator run

## Boundary

Do not run write-mode sync against production until the deployment target and `DATABASE_URL` are verified.

The public MiniApp route must never call AUTO.RIA, NHTSA, KATOTTG, GeoNames, or paid specs APIs live. External sources only feed the local Cartie snapshot through this operator sync path.

Completeness is defined as a clean, reviewable controlled vocabulary, not as blindly dumping every external model into user-facing forms. Provider data is imported into local taxonomy tables, normalized, deduplicated, and then exposed through the public snapshot. Unknown user input is candidate evidence until reviewed.

## Runtime Contract

MiniApp and inventory write paths must use the local taxonomy snapshot as their validation contract:

- `POST /api/miniapp/lead-intents` canonicalizes `payload.criteria`.
- `POST /api/miniapp/requests` canonicalizes B2B request criteria before `miniAppService.createRequest`.
- Inventory create/update/bulk update canonicalize `specs` and `location`.
- Public dictionaries are populated only by sync/apply jobs and reviewed aliases, not by arbitrary user text.
- Unknown brand/model/spec/city values are preserved in the request/inventory payload where useful, but marked as candidates and recorded in `VehicleTaxonomyCandidate`.
- Impossible combinations, for example Tesla plus diesel/gasoline, are removed from canonical criteria/specs and retained only in taxonomy diagnostics.

The canonicalizer matches by stable `id`, display `label`, and aliases. It also maps common API-client English terms such as `electric`, `diesel`, `automatic`, `sedan`, `suv`, and `awd` onto the same canonical ids used by Ukrainian labels.

## Preflight

From the feature branch or deployed server checkout:

```bash
npm --prefix apps/server run prisma:generate
npm --prefix apps/server run prisma:migrate
```

This migration path is intended for an existing Cartie database that already has the historical baseline schema. A blank disposable database currently does not replay the older migration chain cleanly because `20240320000000_add_showcase` expects `workspaces` to exist. For disposable verification only, create `citext` and use `prisma db push --skip-generate` instead of treating a blank DB as production-like migration evidence.

Before write mode, verify the target:

```bash
node -e "const u=new URL(process.env.DATABASE_URL); console.log({host:u.host, db:u.pathname, user:u.username})"
```

## Dry Run

Emergency fallback snapshot:

```bash
npm --prefix apps/server run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK
```

Open provider dry-run with no expensive model fan-out:

```bash
npm --prefix apps/server run vehicle-taxonomy:sync -- --sources=NHTSA,KATOTTG --model-make-limit=0
```

AUTO.RIA Ukraine catalog dry-run without model fan-out. Use this first to load/verify makes, filter dictionaries, and AUTO.RIA cities without spending hundreds of model calls:

```bash
AUTORIA_API_KEY=<developers.ria.com-api-key> \
npm --prefix apps/server run vehicle-taxonomy:sync -- \
  --sources=AUTO_RIA \
  --model-make-limit=0 \
  --category-id=1
```

AUTO.RIA model fan-out dry-run in quota-safe batches:

```bash
AUTORIA_API_KEY=<developers.ria.com-api-key> \
npm --prefix apps/server run vehicle-taxonomy:sync -- \
  --sources=AUTO_RIA \
  --model-make-limit=25 \
  --model-make-offset=0 \
  --model-fetch-concurrency=2 \
  --category-id=1
```

Advance `--model-make-offset` by the same `--model-make-limit` for the next batch: `25`, `50`, `75`, and so on. A live probe on 2026-06-19 returned 392 light-vehicle makes, so a batch size of 25 means about 16 model batches.

Full Ukraine place dry-run from a KATOTTG CSV source:

```bash
KATOTTG_CSV_URL=/absolute/path/to/katottg.csv \
npm --prefix apps/server run vehicle-taxonomy:sync -- \
  --sources=KATOTTG \
  --include-settlements
```

`KATOTTG_CSV_URL` may be an `https://` URL, a `file://` URL, or a local absolute path. If the source requires authorization, pass either:

```bash
KATOTTG_AUTHORIZATION="Bearer <token>"
```

or:

```bash
KATOTTG_API_TOKEN=<token>
```

GeoNames global fallback dry-run from an unzipped TSV:

```bash
GEONAMES_TSV_URL=/absolute/path/to/geonames-UA.txt \
npm --prefix apps/server run vehicle-taxonomy:sync -- --sources=GEONAMES
```

Expected dry-run shape:

```text
[vehicle-taxonomy:sync] mode=DRY_RUN ...
[vehicle-taxonomy:sync] syncRun id=dry_... status=DRY_RUN dryRun=true
[vehicle-taxonomy:sync] counts={...}
```

## Apply Local Snapshot

Emergency fallback seed, gated:

```bash
ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1 \
npm --prefix apps/server run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK --apply
```

Observed inventory candidate quarantine, scoped to one workspace:

```bash
ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1 \
npm --prefix apps/server run vehicle-taxonomy:sync -- \
  --source=EMERGENCY_FALLBACK \
  --apply \
  --scan-observed \
  --companyId=<workspaceId>
```

Review candidate queue:

```bash
curl -fsS "$BASE_URL/api/vehicle-taxonomy/candidates?status=NEW&limit=50" \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
```

Approve a candidate only as an alias to an existing canonical value:

```bash
curl -fsS "$BASE_URL/api/vehicle-taxonomy/candidates/<candidateId>/review" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"APPROVED","canonicalLabel":"Tesla"}' | jq
```

Reject a bad candidate:

```bash
curl -fsS "$BASE_URL/api/vehicle-taxonomy/candidates/<candidateId>/review" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"REJECTED"}' | jq
```

The review endpoint intentionally does not create new public makes/models/cities. Approved `make`, `model`, and `city` candidates become `NormalizationAlias` rows pointing to an existing canonical label. New canonical rows should come from reviewed provider sync/apply jobs.

Full provider apply on staging only, after dry-run counts are reviewed. For AUTO.RIA, prefer the same batched offsets used in dry-run:

```bash
ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1 \
AUTORIA_API_KEY=<developers.ria.com-api-key> \
KATOTTG_CSV_URL=/absolute/path/to/katottg.csv \
npm --prefix apps/server run vehicle-taxonomy:sync -- \
  --sources=AUTO_RIA,KATOTTG \
  --model-make-limit=25 \
  --model-make-offset=0 \
  --model-fetch-concurrency=2 \
  --include-settlements \
  --category-id=1 \
  --apply
```

Do not run this against production until `DATABASE_URL`, AUTO.RIA quota, and the KATOTTG source file/date are explicitly verified.

## Source Notes

- AUTO.RIA is the preferred Ukraine-first vehicle catalog. Current docs expose `GET /auto/categories/:categoryId/marks` and `GET /auto/categories/:categoryId/marks/:markId/models`; both require `api_key`.
- AUTO.RIA search docs expose marketplace filters for fuel (`type`), gearbox (`gearbox`), engine volume, power, body style, year, region/city, and other fields. Cartie mirrors that concept as local taxonomy filters, not as live MiniApp calls.
- AUTO.RIA dictionary endpoints verified with the provided key on 2026-06-19: 392 makes, 14 body styles, 6 gearboxes, 3 drive types, 10 fuel types, 23 states, and 133 Kyiv-region cities.
- AUTO.RIA full all-model fan-out hit `HourOverlimit` on 2026-06-19. Use `--model-make-limit`, `--model-make-offset`, and low `--model-fetch-concurrency` rather than `--all-models` on this key/tariff.
- NHTSA vPIC is a global/open fallback. It supports make/model endpoints, including all-model fan-out, but it is US-oriented and should not be treated as the Ukraine marketplace truth source.
- NHTSA vPIC is useful for VIN and general make/model/year data, but it does not replace a full Ukraine-market trim/spec database.
- CarAPI and API Ninjas expose deeper trims/specs APIs. They are useful candidates for a later paid or key-based specs provider, but they are not a clean zero-key production dependency for this rollout.
- Official KATOTTG truth is published by Mindev/Data.gov.ua as workbook resources. Convert the relevant workbook to CSV for `KATOTTG_CSV_URL` unless a stable authenticated CSV endpoint is provided.
- `https://api.directory.org.ua/api/katottg/download/csv` returned `{"detail":"Not authenticated"}` on 2026-06-19, so it is not reliable as an unauthenticated production default.
- GeoNames publishes daily country dumps, but the official `UA.zip` is zipped. This adapter expects an unzipped TSV path/URL for `GEONAMES_TSV_URL`.

## Compatibility Rules

The public taxonomy response includes optional `constraints` on brands and models. MiniApp request filters use those constraints to hide impossible options.

Current rule overlay:

- Tesla, Lucid, and Rivian are treated as EV-only brands.
- Known EV models from mixed brands are treated as electric, for example Porsche Taycan, Nissan Leaf, Kia EV6/EV9, Hyundai IONIQ 5/6, Volkswagen ID.*, Audi e-tron, BMW i* and Mercedes EQ*.
- Tesla model body constraints are included where unambiguous: Model 3 sedan, Model Y/X SUV, Model S liftback, Cybertruck pickup.
- Electric-only entries constrain fuel to `Електро` and transmission to `Автомат`.

Provider-imported source metadata can override or extend this later with:

```json
{
  "constraints": {
    "fuels": ["Електро"],
    "bodyTypes": ["SUV"],
    "transmissions": ["Автомат"]
  }
}
```

## Smoke

Read-only public smoke:

```bash
curl -fsS "http://127.0.0.1:3002/api/miniapp/vehicle-taxonomy?slug=cartie" \
  | jq '{ok, version, source, stale, brand_count:(.brands|length), duplicate_ids:([.brands[].id] | group_by(.) | map(select(length>1)) | length)}'
```

Expected:

- `ok: true`
- `brand_count` greater than 0
- `duplicate_ids: 0`
- `source: "LOCAL_SNAPSHOT"` after apply, or `"EMERGENCY_FALLBACK"` before apply

Disposable verification on 2026-06-18 using a temporary Postgres container plus `prisma db push --skip-generate` confirmed:

- `EMERGENCY_FALLBACK --apply` writes 14 makes, 102 models, 22 spec options, and 9 places.
- The public mapper returns `source: "LOCAL_SNAPSHOT"`, `stale: false`, and `duplicate_brand_id_count: 0`.

Current deployed live read-only smoke on 2026-06-18 still showed the pre-rollout endpoint shape:

- `brand_count: 51`
- `city_count: 17`
- `duplicate_brand_id_count: 16`
- no `version`, `source`, or `stale` metadata

That confirms production had not yet received this branch and should not be used as validation of the new local snapshot path.

## Verification

Completed on 2026-06-18:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/providers/autoria.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/nhtsa.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.test.ts \
  src/services/taxonomy.test.ts \
  src/scripts/sync_vehicle_taxonomy.helpers.test.ts

npm --prefix apps/server test -- src/modules/Integrations/meta/metaCapi.service.test.ts
npm --prefix apps/server test
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Results:

- Focused taxonomy/provider/route/CLI tests passed: 9 files, 21 tests.
- Meta CAPI isolated test passed after replacing a fixed `2026-05-26T10:00:00Z` event time with a recent timestamp inside the 7-day retention window.
- Full server suite passed: 113 files, 507 tests.
- Server TypeScript build passed.
- Web production build passed with existing Browserslist/chunk-size warnings only.

Final continuation verification on 2026-06-18 after MiniApp UI/UX Pro Max changes:

```bash
npm --prefix apps/server test
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Results:

- Full server suite passed: 113 files, 507 tests.
- Server TypeScript build passed.
- Web production build passed with existing Browserslist/chunk-size warnings only.
- Browser smoke against `http://127.0.0.1:4174/p/app/cartie` loaded the MiniApp fallback; direct request form smoke remains gated by Telegram initData in browser preview mode.

Search correctness continuation on 2026-06-19:

```bash
npm --prefix apps/server test -- src/routes/miniappComboboxSearch.web.test.ts
npm --prefix apps/server test
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Results:

- Focused combobox search test passed: 1 file, 4 tests.
- Full server suite passed: 114 files, 511 tests.
- Server TypeScript build passed.
- Web production build passed with existing Browserslist/chunk-size warnings only.

Full-source operator continuation on 2026-06-19:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts \
  src/scripts/sync_vehicle_taxonomy.helpers.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.test.ts

npm --prefix apps/server run vehicle-taxonomy:sync -- --source=EMERGENCY_FALLBACK --all-models --include-settlements
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/server test
npm --prefix apps/web run build
```

Results:

- Focused full-source tests passed: 4 files, 18 tests.
- Safe CLI dry-run passed and logged `modelMakeLimit=all includeSettlements=yes`.
- Full server suite passed: 114 files, 517 tests.
- Server TypeScript build passed.
- Web production build passed with existing Browserslist/chunk-size warnings only.

MiniApp search contract continuation on 2026-06-19:

```bash
npm --prefix apps/server test -- \
  src/routes/miniappComboboxSearch.web.test.ts \
  src/routes/miniappVehicleCompatibility.web.test.ts \
  src/routes/miniAppLeadHandoff.routes.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts

npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
npm --prefix apps/server test
```

Results:

- Focused MiniApp/taxonomy tests passed: 4 files, 66 tests.
- Search now matches labels, aliases, canonical ids, and provider external ids.
- Full server suite passed: 116 files, 539 tests.
- Server TypeScript build passed.
- Web production build passed with existing Browserslist/chunk-size warnings only.
- Browser smoke with a same-origin mock MiniApp API confirmed `tes -> Tesla`, provider id `777 -> Model 3`, Tesla Model 3 fuel filtered to `Електро`, body filtered to `Седан`, and `kiev -> Київ` without custom city fallback.

Duplicate/search UX TDD continuation on 2026-06-19:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts \
  src/routes/miniappComboboxSearch.web.test.ts \
  src/routes/miniappVehicleCompatibility.web.test.ts \
  src/routes/miniAppLeadHandoff.routes.test.ts

npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
npm --prefix apps/server test
```

Results:

- Strict TDD RED/GREEN covered duplicate make/model/city/spec rows, search ranking, selected-value filtering, and duplicate frontend suggestions.
- Focused MiniApp/taxonomy tests passed: 4 files, 71 tests.
- Full server suite passed: 116 files, 544 tests.
- Server TypeScript build passed.
- Web production build passed with existing Browserslist/chunk-size warnings only.
- Browser smoke with intentionally duplicated taxonomy payload confirmed only one `Tesla`, `Model 3` ranking above noisy `M3`, selected values removed from suggestions, and Tesla Model 3 constraints still filtering to `Седан` / `Електро`.

## Rollback

- Disable write runs by removing `ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1`.
- Revert the app code if the public route regresses; the schema migration is additive and can remain unused.
- Keep the last good local snapshot in place; public MiniApp rendering does not depend on external provider uptime.
