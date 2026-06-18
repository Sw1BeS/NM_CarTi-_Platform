# Vehicle Taxonomy Source Design

Date: 2026-06-18
Status: approved for implementation planning on 2026-06-18
Scope: research-backed design and API/data contract. No implementation, schema migration, external writes, or production sync has been run by this spec.

## TaskIntentDraft

- Outcome: define the durable source-of-truth design for vehicle makes, models, useful specs, and cities used by Cartie vehicle selection, parsing, search, imports, and MiniApp request flows.
- Goal: replace hardcoded and observed-inventory-only taxonomy with a local canonical snapshot synced from authoritative/open sources.
- Success evidence: approved source strategy, owner boundary, API contract, data model contract, sync behavior, compatibility rules, and QA gates.
- Stop condition: user reviews this spec and confirms it can become an implementation plan.
- Non-goals: no live MiniApp form dependency on external APIs, no automatic publication of external listings, no full paid trim/spec database in the first phase, no broad rewrite of inventory/search/import.
- Main risks: external API instability, source licensing drift, polluted model names from inventory text, duplicate canonical owners, and breaking the existing public MiniApp taxonomy contract.

## BaselineReadSetHint

Read set used:

- `README.md`
- `docs/project-knowledge/README.md`
- `docs/project-knowledge/PRODUCT_KNOWLEDGE.md`
- `docs/project-knowledge/OPERATIONS_KNOWLEDGE.md`
- `docs/code-map/DATA_MODEL_MAP.md`
- `docs/aegis/BASELINE-GOVERNANCE.md`
- `docs/aegis/baseline/2026-05-27-initial-baseline.md`
- `docs/aegis/plans/2026-06-12-mtproto-real-car-import-and-tracking-review.md`
- `docs/audit/cartie_status_2026-06-16.md`
- `apps/server/prisma/schema.prisma`
- `apps/server/src/services/vehicleTaxonomy.service.ts`
- `apps/server/src/services/taxonomy.ts`
- `apps/server/src/services/enhanced-parsing.utils.ts`
- `apps/server/src/routes/miniAppRoutes.ts`
- `apps/web/src/services/miniappApi.ts`
- `apps/web/src/pages/public/miniapp/views/RequestView.tsx`
- `apps/web/src/pages/public/miniapp/vehicleOptions.ts`

External source refs:

- AUTO.RIA Developers used-cars parameters: `https://docs-developers.ria.com/en/used-cars/parameters/marks`
- AUTO.RIA model parameters: `https://docs-developers.ria.com/en/used-cars/parameters/models`
- NHTSA vPIC API: `https://vpic.nhtsa.dot.gov/api/`
- GeoNames export dumps: `https://www.geonames.org/export/`
- Ukraine KATOTTG official page: `https://mindev.gov.ua/diialnist/rozvytok-mistsevoho-samovriaduvannia/kodyfikator-administratyvno-terytorialnykh-odynyts-ta-terytorii-terytorialnykh-hromad`
- CarAPI docs: `https://carapi.app/`

Authority gaps:

- AUTO.RIA API key availability and exact quota are not confirmed in the live Cartie environment.
- KATOTTG distribution format must be verified during implementation because official publication links can move.
- CarAPI or equivalent paid trim/spec source is not approved for cost or licensing.
- Existing `DictionarySet` / `DictionaryEntry` tables exist but are unused in production, so they are not current authority for vehicle taxonomy.

## BaselineUsageDraft

- Required baseline refs: Cartie baseline snapshot, MiniApp route contract, Prisma schema, vehicle taxonomy service, current operations knowledge.
- Delivered context refs: user requested a decisive research-backed design for open APIs covering makes, models, specs, and cities.
- Acknowledged before plan refs: live read-only checks showed current taxonomy duplicate ids and polluted model labels; live DB has `DictionarySet` empty and `NormalizationAlias` active.
- Cited in design refs: local files and external official/docs URLs above.
- Missing refs: confirmed AUTO.RIA key/quota, confirmed KATOTTG file URL, approved paid specs provider.
- Decision: continue with local-snapshot architecture and defer implementation until this spec is reviewed.

## ImpactStatementDraft

Affected layers:

- Prisma data model for canonical taxonomy tables and sync run tracking.
- Public MiniApp taxonomy API response, preserving current fields.
- Admin/internal taxonomy sync and diagnostics APIs.
- Vehicle parsing helpers and `detectMake` consumers.
- `vehicleTaxonomy.service.ts` as the current backend owner.
- MiniApp request form and frontend fallback behavior.
- Telegram/MTProto import normalization through aliases and taxonomy lookup.

Compatibility boundaries:

- `GET /api/miniapp/vehicle-taxonomy?slug=...` must keep returning `brands`, `bodyTypes`, `fuels`, `transmissions`, `drives`, and `cities`.
- Existing request payload criteria using `{ id, label }` options must keep working.
- MiniApp must not block on AUTO.RIA, NHTSA, GeoNames, KATOTTG, or paid APIs.
- Observed inventory must not directly become canonical taxonomy without review or validation.
- Existing `NormalizationAlias` remains valid as local override/alias input.
- No production data, env secrets, storage, logs, or deployment state should be touched by the design phase.

## Product Risk Lens

- Value: better vehicle picker, cleaner Telegram parsing, better catalog search, better B2B requests, and less manual cleanup.
- Non-goals: complete global OEM-grade trim/spec knowledge in phase 1; live external lookup during user form input.
- Trade-offs: local snapshot adds sync/storage work, but removes runtime dependency risk and gives us reviewable canonical data.
- Decision needed: approve AUTO.RIA + KATOTTG/GeoNames + NHTSA fallback as the first production architecture.

## Architecture Integrity Lens

- Invariant: Cartie owns the runtime taxonomy contract; external APIs are inputs, not runtime truth for public UX.
- Canonical owner / contract: `VehicleTaxonomy` backend service backed by dedicated taxonomy tables and exposed through `/api/miniapp/vehicle-taxonomy`.
- Responsibility overlap: current owners are duplicated across `vehicleTaxonomy.service.ts`, `taxonomy.ts`, `enhanced-parsing.utils.ts`, frontend `vehicleOptions.ts`, `NormalizationAlias`, and observed `CarListing.specs`.
- Higher-level simplification: add one canonical data owner and convert the duplicated lists into consumers/fallbacks.
- Retirement / falsifier: implementation is wrong if a user-facing request path queries AUTO.RIA/NHTSA/GeoNames live before rendering the selector, or if inventory text can create public canonical models without quarantine.
- Verdict: use local canonical snapshot tables and sync jobs; do not add another hardcoded array or direct public external API call.

## Baseline Role Alignment

- Product / Requirement Baseline: Cartie is a Telegram-first automotive platform with MiniApp request, inventory, B2B, and import flows. Taxonomy must serve buyer selection and operational normalization.
- Architecture / Runtime Boundary Baseline: routes call services; Prisma defines persistence contracts; MiniApp route contracts are owned by backend API and frontend consumers.
- Result: aligned with a new design need. Current implementation has implementation drift for taxonomy quality because canonical labels are duplicated and polluted.
- Scope: both requirements and architecture.
- Next action: write implementation plan only after this spec is reviewed.

## Plan-Time Complexity Check

Complexity Budget:

- Artifact class: cross-module data/source-of-truth and API contract change.
- Target files / artifacts: Prisma schema/migration, taxonomy service, sync service, admin route, MiniApp API types, parser helpers, tests, seed/sync scripts.
- Current pressure: high. Current code already has duplicate make/model/city constants and live taxonomy quality defects.
- Projected post-change pressure: medium if the new taxonomy owner is isolated and existing consumers are migrated incrementally.
- Budget result: at-risk without a dedicated owner file/module.
- Planned governance: add owner service and sync module; keep route and frontend edits as thin glue.

Plan-Time Complexity Check:

- Better file boundary: create `apps/server/src/modules/VehicleTaxonomy/` or `apps/server/src/services/vehicle-taxonomy/` for source adapters, sync, repository, and public mapper.
- Recommendation: add owner module plus small compatibility edits in current `vehicleTaxonomy.service.ts`, parser helpers, and frontend types.

## Source Research Decision

There is no single credible open API that gives all global makes, models, trims, specs, and all cities with production reliability. The effective design is a source stack:

1. AUTO.RIA Developers API as Ukraine-first vehicle taxonomy source.
   - Role: primary source for make/model IDs and search-facing vehicle parameters relevant to the Ukrainian market.
   - Why: Cartie already operates in Ukraine and has AUTO.RIA import/search context; AUTO.RIA IDs are useful for future external search and import.
   - Limit: requires API key and quota handling; not a complete global OEM specs database.

2. NHTSA vPIC as free official global/US fallback.
   - Role: fallback for makes/models and VIN-oriented enrichment.
   - Verified behavior: public API returns makes and models without an API key.
   - Limit: US/import-to-US centric; not sufficient alone for Ukraine/Europe sales taxonomy.

3. KATOTTG as Ukraine city/settlement authority.
   - Role: canonical Ukraine administrative/city source where official Ukrainian names and region hierarchy matter.
   - Limit: distribution format and URL must be refreshed during implementation.

4. GeoNames dumps as global city fallback.
   - Role: country city snapshots for non-UA expansion and aliases/coordinates.
   - Limit: public webservice has limits and is not suitable for runtime dependency; use dumps/snapshot instead.

5. CarAPI or similar paid provider as deferred specs enrichment.
   - Role: trims/specs/year ranges if the product needs exact trim-level attributes.
   - Limit: cost/licensing; not phase 1.

Rejected:

- Direct live API calls from MiniApp selectors. This is brittle and slower than local data.
- Scraping AUTO.RIA pages for taxonomy. The project already has external HTML search, but taxonomy should use official/API/dump sources.
- Letting `CarListing.specs` become canonical. Inventory text is noisy and already produced duplicate/polluted labels.

## Recommended Data Model Contract

Add dedicated taxonomy tables rather than reusing generic `DictionarySet` as the canonical owner. `DictionarySet` can remain useful for generic dictionaries later, but vehicle make-model hierarchy needs external IDs, source metadata, review state, and sync provenance.

Suggested Prisma model shape:

```prisma
model VehicleMake {
  id            String   @id @default(cuid())
  slug          String   @unique
  label         String
  normalizedKey String   @unique
  countryScope  String?
  active        Boolean  @default(true)
  sourceMeta    Json     @default("{}") @db.JsonB
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  models VehicleModel[]

  @@index([active])
}

model VehicleModel {
  id            String   @id @default(cuid())
  makeId        String
  slug          String
  label         String
  normalizedKey String
  active        Boolean  @default(true)
  sourceMeta    Json     @default("{}") @db.JsonB
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  make VehicleMake @relation(fields: [makeId], references: [id], onDelete: Cascade)

  @@unique([makeId, normalizedKey])
  @@index([makeId])
  @@index([active])
}

model VehicleSpecOption {
  id            String   @id @default(cuid())
  group         String
  slug          String
  label         String
  normalizedKey String
  active        Boolean  @default(true)
  sourceMeta    Json     @default("{}") @db.JsonB
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([group, normalizedKey])
  @@index([group, active])
}

model GeoPlace {
  id            String   @id @default(cuid())
  countryCode   String
  slug          String
  label         String
  normalizedKey String
  type          String
  region        String?
  latitude      Float?
  longitude     Float?
  sourceMeta    Json     @default("{}") @db.JsonB
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([countryCode, type, normalizedKey])
  @@index([countryCode, active])
  @@index([region])
}

model TaxonomySyncRun {
  id          String   @id @default(cuid())
  source      String
  status      String
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  counts      Json     @default("{}") @db.JsonB
  error       String?
  sourceMeta  Json     @default("{}") @db.JsonB

  @@index([source, startedAt])
  @@index([status])
}

model VehicleTaxonomyCandidate {
  id          String   @id @default(cuid())
  kind        String
  label       String
  makeLabel   String?
  source      String
  evidence    Json     @default("{}") @db.JsonB
  status      String   @default("NEW")
  createdAt   DateTime @default(now())
  reviewedAt  DateTime?

  @@index([kind, status])
}
```

`sourceMeta` examples:

```json
{
  "autoria": { "markId": 9, "modelId": 1234 },
  "nhtsa": { "makeId": 474, "modelId": 1865 },
  "sourcePriority": ["manual", "autoria", "nhtsa", "observed"]
}
```

## Sync Behavior

### AUTO.RIA Sync

- Trigger: admin manual job and scheduled daily/weekly job.
- Inputs: configured API key, category `1` for cars unless product expands vehicle types.
- Writes: `VehicleMake`, `VehicleModel`, `VehicleSpecOption`, `TaxonomySyncRun`.
- Failure: preserve last good snapshot, mark sync failed, do not change public API response.
- Rate/quotas: adapter must use bounded concurrency and log counts only, not secrets.

### NHTSA vPIC Sync

- Trigger: scheduled fallback/enrichment job.
- Inputs: public API or downloadable data.
- Writes: missing makes/models, external IDs, optional aliases.
- Priority: lower than manual and AUTO.RIA for Ukraine-facing labels.

### City Sync

- Ukraine-first: import KATOTTG settlement/city data into `GeoPlace`.
- Global fallback: import GeoNames country dumps, not public runtime webservice.
- Labels: prefer Ukrainian canonical label for UA; store English/Russian aliases through `NormalizationAlias` or `sourceMeta.aliases`.
- Public response: return only product-relevant cities by default, with ability to search broader place data later.

### Observed Inventory

- Current `CarListing.specs.brand/model` should no longer create public canonical makes/models directly.
- Unknown observed labels become `VehicleTaxonomyCandidate` with evidence:
  - listing IDs
  - source provider
  - raw normalized label
  - occurrence count
- Reviewed candidates can create aliases or new canonical entries.

## API Contract

### Public Read Contract

Endpoint:

```http
GET /api/miniapp/vehicle-taxonomy?slug=cartie&locale=uk-UA&vehicleType=car
```

Auth:

- Public read, same as current MiniApp taxonomy route.
- No Telegram init data required.

Compatibility:

- Preserve existing top-level fields: `ok`, `brands`, `bodyTypes`, `fuels`, `transmissions`, `drives`, `cities`.
- Add optional metadata only; clients that ignore it keep working.

Response:

```json
{
  "ok": true,
  "version": "vehicle-taxonomy.v2",
  "source": "LOCAL_SNAPSHOT",
  "updatedAt": "2026-06-18T00:00:00.000Z",
  "stale": false,
  "brands": [
    {
      "id": "bmw",
      "label": "BMW",
      "aliases": ["бмв"],
      "externalIds": { "autoria": 9, "nhtsa": 452 },
      "models": [
        {
          "id": "x5",
          "brandId": "bmw",
          "label": "X5",
          "aliases": [],
          "externalIds": { "autoria": 1234, "nhtsa": 1712 }
        }
      ]
    }
  ],
  "bodyTypes": [{ "id": "suv", "label": "SUV" }],
  "fuels": [{ "id": "diesel", "label": "Дизель", "aliases": ["diesel"] }],
  "transmissions": [{ "id": "automatic", "label": "Автомат" }],
  "drives": [{ "id": "awd", "label": "Повний" }],
  "cities": [{ "id": "lviv", "label": "Львів", "aliases": ["Lviv"] }]
}
```

Error behavior:

- If DB taxonomy exists but last sync failed: return `200`, last good snapshot, `stale: true`, and do not expose internal error details.
- If no taxonomy exists: return `200` with safe static emergency fallback and `stale: true`.
- Only unrecoverable route/runtime failures should return `500`.

### Admin Sync Contract

Endpoint:

```http
POST /api/admin/vehicle-taxonomy/sync
```

Auth:

- Admin only. Must not be public.

Request:

```json
{
  "sources": ["AUTO_RIA", "NHTSA", "KATOTTG", "GEONAMES"],
  "vehicleType": "car",
  "countryCode": "UA",
  "dryRun": false
}
```

Response:

```json
{
  "ok": true,
  "runId": "sync_...",
  "status": "QUEUED"
}
```

Endpoint:

```http
GET /api/admin/vehicle-taxonomy/sync/status?runId=sync_...
```

Response:

```json
{
  "ok": true,
  "run": {
    "id": "sync_...",
    "source": "AUTO_RIA",
    "status": "DONE",
    "counts": { "makes": 80, "models": 1200, "specOptions": 60 },
    "startedAt": "2026-06-18T00:00:00.000Z",
    "finishedAt": "2026-06-18T00:02:00.000Z"
  }
}
```

### Contract Testing Notes

- Public route contract test must assert old fields are present and stable.
- Admin route tests must assert auth is required.
- Provider adapters should have mock HTTP fixtures and not call external APIs in unit tests.
- Breaking-change guard: existing MiniApp frontend types must compile without requiring new metadata.

## Implementation Phases

### Phase 1: Local Canonical Snapshot

- Add dedicated taxonomy models and migration.
- Add repository and public mapper.
- Seed emergency fallback from current curated data.
- Deduplicate by normalized key.
- Preserve current `/api/miniapp/vehicle-taxonomy` shape.
- Add tests for duplicate IDs, uppercase brands, and noisy model rejection.

### Phase 2: AUTO.RIA + City Sync

- Add AUTO.RIA adapter and sync job.
- Add KATOTTG/GeoNames import path for `GeoPlace`.
- Store external IDs and sync provenance.
- Add admin sync/status routes.
- Add stale snapshot behavior.

### Phase 3: Consumer Migration

- Replace `detectMake` hardcoded list with taxonomy lookup plus emergency fallback.
- Move frontend `vehicleOptions.ts` to emergency fallback only.
- Feed parser unknown labels into candidate queue, not public taxonomy.
- Update request criteria mapping to preserve canonical IDs and labels.

### Phase 4: Optional Specs Enrichment

- Evaluate CarAPI or another paid specs provider.
- Add trim/year/spec enrichment only if product needs exact technical details.
- Keep cost/licensing review separate from phase 1.

## QA Gates

Required tests:

- `vehicleTaxonomy.service.test.ts`: canonical merge, aliases, current response compatibility.
- new sync adapter tests with mocked AUTO.RIA/NHTSA/KATOTTG/GeoNames data.
- route contract test for `/api/miniapp/vehicle-taxonomy`.
- admin auth tests for sync endpoints.
- parser tests proving noisy inventory text does not become canonical model labels.
- frontend build/type check after response metadata is added.

Useful live/read-only checks after implementation:

```bash
curl -fsS "http://127.0.0.1:3002/api/miniapp/vehicle-taxonomy?slug=cartie" | jq '{ok, version, stale, brand_count:(.brands|length), city_count:(.cities|length)}'
```

```sql
select source, status, counts, "startedAt", "finishedAt"
from "TaxonomySyncRun"
order by "startedAt" desc
limit 10;
```

## ADR Signal

ADR should be created after implementation plan approval because this changes a durable source-of-truth boundary:

- Decision: Cartie local taxonomy snapshot owns runtime vehicle/city taxonomy.
- External systems: AUTO.RIA, NHTSA, KATOTTG, GeoNames, and optional paid specs providers are inputs only.
- Compatibility: MiniApp public response remains backward-compatible.
- Retirement schedule: hardcoded lists and observed-inventory direct injection become emergency fallback or candidate evidence.

## Self-Review Notes

- Placeholder scan: no placeholder requirements remain.
- Internal consistency: source stack, data model, sync behavior, and API contract all point to local snapshot ownership.
- Scope check: implementation is multi-phase; phase 1 and phase 2 should be separate implementation tasks if risk is high.
- Ambiguity check: paid trim/spec enrichment is explicitly deferred.
- Boundary check: public MiniApp does not call external APIs live; observed inventory does not create canonical entries directly.
