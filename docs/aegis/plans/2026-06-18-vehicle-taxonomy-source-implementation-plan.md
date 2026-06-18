# Vehicle Taxonomy Source Implementation Plan

Date: 2026-06-18
Status: ready for user review
Source spec: `docs/aegis/specs/2026-06-18-vehicle-taxonomy-source-design.md`

## Goal

Implement the approved vehicle taxonomy source design:

- Make Cartie, not an external runtime API, the owner of vehicle/city taxonomy used by MiniApp, request flows, parsing, search, imports, and B2B operations.
- Preserve the current public `GET /api/miniapp/vehicle-taxonomy` response shape while adding local snapshot metadata.
- Replace hardcoded and observed-inventory-only taxonomy with canonical local tables, review candidates, and sync provenance.
- Add a staged path for AUTO.RIA, NHTSA vPIC, KATOTTG, and GeoNames inputs without blocking MiniApp rendering on those services.

## Architecture

Canonical runtime flow:

```text
External source adapters
  -> Taxonomy sync job
  -> VehicleMake / VehicleModel / VehicleSpecOption / GeoPlace / TaxonomySyncRun
  -> VehicleTaxonomy public mapper
  -> GET /api/miniapp/vehicle-taxonomy
  -> MiniApp request form, parser helpers, catalog search
```

Ownership:

- New module `apps/server/src/modules/VehicleTaxonomy/` owns taxonomy schema access, sync orchestration, provider adapters, public response mapping, stale snapshot behavior, and candidate quarantine.
- Existing `apps/server/src/services/vehicleTaxonomy.service.ts` becomes compatibility glue or a thin re-export around the new module.
- `NormalizationAlias` remains local override/alias data; it is not the canonical make/model table.
- `CarListing.specs` becomes evidence for `VehicleTaxonomyCandidate`, not public canonical data.
- Frontend `vehicleOptions.ts` remains emergency fallback only.

## Tech Stack

- TypeScript, Express, Prisma/Postgres.
- Existing server test runner: Vitest.
- Existing HTTP test style: Supertest.
- Existing dependencies: `axios`, `zod`, `@prisma/client`; do not add a dependency for basic CSV/TSV parsing unless KATOTTG format forces it.

## Baseline/Authority Refs

- `docs/aegis/specs/2026-06-18-vehicle-taxonomy-source-design.md`
- `docs/aegis/baseline/2026-05-27-initial-baseline.md`
- `docs/project-knowledge/PRODUCT_KNOWLEDGE.md`
- `docs/project-knowledge/OPERATIONS_KNOWLEDGE.md`
- `docs/code-map/DATA_MODEL_MAP.md`
- `docs/audit/cartie_status_2026-06-16.md`
- `apps/server/prisma/schema.prisma`
- `apps/server/src/index.ts`
- `apps/server/src/routes/miniAppRoutes.ts`
- `apps/server/src/services/vehicleTaxonomy.service.ts`
- `apps/server/src/services/taxonomy.ts`
- `apps/server/src/services/enhanced-parsing.utils.ts`
- `apps/web/src/services/miniappApi.ts`
- `apps/web/src/pages/public/miniapp/views/RequestView.tsx`
- `apps/web/src/pages/public/miniapp/vehicleOptions.ts`

## Compatibility Boundary

- `GET /api/miniapp/vehicle-taxonomy?slug=...` must keep returning `ok`, `brands`, `bodyTypes`, `fuels`, `transmissions`, `drives`, and `cities`.
- Existing MiniApp request payload criteria using `{ id, label }` must keep working.
- Public MiniApp route must not call AUTO.RIA, NHTSA, KATOTTG, GeoNames, or CarAPI live.
- Existing `NormalizationAlias` data remains active.
- Existing hardcoded frontend/backend lists may remain as emergency fallback, but must not be the primary runtime owner after phase 1.
- No automatic publication or mutation of `CarListing` happens in this workstream.
- No production sync job runs without explicit operator command.

## Verification

Focused commands:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts \
  src/modules/VehicleTaxonomy/providers/autoria.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/nhtsa.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts \
  src/services/vehicleTaxonomy.service.test.ts \
  src/routes/miniAppLeadHandoff.routes.test.ts
```

Build:

```bash
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

Read-only runtime smoke after deploy:

```bash
curl -fsS "http://127.0.0.1:3002/api/miniapp/vehicle-taxonomy?slug=cartie" \
  | jq '{ok, version, source, stale, brand_count:(.brands|length), city_count:(.cities|length)}'
```

## Plan Basis

Facts:

- Current public taxonomy route exists at `/api/miniapp/vehicle-taxonomy` and is consumed by MiniApp.
- Current taxonomy quality is polluted by duplicate labels and inventory-derived noisy model values.
- Live DB has `NormalizationAlias` data, but `DictionarySet` is empty.
- Current project already stores `SystemSettings.autoriaApiKey`.
- Current external search code uses AUTO.RIA/OLX HTML search for listings, but taxonomy should use official APIs/dumps.

Assumptions:

- AUTO.RIA API key can be provided through existing `SystemSettings.autoriaApiKey` or an env/config extension.
- Phase 1 should be deployable without external API credentials by seeding local emergency canonical data.
- KATOTTG source format may require a small parser adjustment during implementation.

Unknowns:

- Exact AUTO.RIA quota and category/parameter endpoint coverage in the live key.
- Exact official KATOTTG download URL at implementation time.
- Whether paid trim/spec enrichment will be approved later.

## BaselineUsageDraft

- Required baseline refs: approved taxonomy source spec, Cartie baseline snapshot, MiniApp route contract, Prisma schema, operations knowledge.
- Delivered context refs: user approved the spec with "ок" on 2026-06-18.
- Acknowledged before plan refs: dirty worktree has unrelated ongoing changes; this plan must not assume a clean branch.
- Cited in plan refs: listed in Baseline/Authority Refs.
- Missing refs: confirmed live AUTO.RIA key/quota and KATOTTG file URL.
- Decision: continue with staged implementation plan; do not run code edits from this plan until execution mode is chosen.

## Architecture Integrity Lens

- Invariant: Cartie local snapshot owns runtime taxonomy. External APIs are inputs only.
- Canonical owner / contract: `apps/server/src/modules/VehicleTaxonomy/` and `GET /api/miniapp/vehicle-taxonomy`.
- Responsibility overlap: hardcoded `CURATED_BRANDS`, `CAR_MAKES`, frontend `VEHICLE_BRANDS`, parser `BRAND_LIST`, `NormalizationAlias`, and `CarListing.specs`.
- Higher-level simplification: introduce a single module with repository, mapper, sync adapters, and candidate quarantine.
- Retirement / falsifier: implementation is wrong if public MiniApp form requires an external source to render, or if observed inventory directly creates public canonical models.
- Verdict: proceed with new owner module and staged retirement of duplicated lists.

## Plan Pressure Test

- Owner / contract / retirement: proceed. Spec settles local snapshot as canonical owner and old lists as fallback/candidates.
- Architecture integrity / higher-level path: proceed. New module avoids growing `miniAppRoutes.ts`, parser files, or frontend fallback lists.
- Verification scope: proceed with repository/service/route/provider tests plus existing MiniApp route tests.
- Task executability: proceed, but split into phases. Schema/storage, public contract, provider sync, and consumer migration should be separate commits.
- Pressure result: proceed.

## Plan-Time Complexity Check

Complexity Budget:

- Artifact class: schema + API contract + source-of-truth migration.
- Target files / artifacts: Prisma schema/migration, new `VehicleTaxonomy` module, existing public route, frontend API types, parser helpers, tests, docs/index.
- Current pressure: high due duplicate owners and a dirty worktree.
- Projected post-change pressure: medium if all new logic lands in one module and existing owners become thin consumers.
- Budget result: at-risk if implemented in-place; within-budget if implemented as new module and staged.
- Planned governance: one module owner, additive migration, compatibility wrapper, explicit retirement tasks.

Plan-Time Complexity Check:

- Target files: `schema.prisma`, `index.ts`, `miniAppRoutes.ts`, `vehicleTaxonomy.service.ts`, `taxonomy.ts`, `enhanced-parsing.utils.ts`, `miniappApi.ts`, `RequestView.tsx`, `vehicleOptions.ts`.
- Existing size / shape signals: `miniAppRoutes.ts` and `MiniApp.tsx` are large; parser and taxonomy helpers already carry duplicate logic.
- Owner fit: new taxonomy logic belongs in `modules/VehicleTaxonomy`, not in routes/UI/parser files.
- Add-in-place risk: high.
- Better file boundary: add owner module; keep old files as glue.
- Recommendation: add owner module, then migrate consumers incrementally.

## PR / Commit Split

Use small commits because the current worktree is already dirty:

1. Schema and local repository/service with emergency seed/fallback.
2. Public route compatibility wiring and frontend type compatibility.
3. AUTO.RIA/NHTSA/KATOTTG/GeoNames provider adapters and sync status API.
4. Candidate quarantine and parser/search consumer migration.
5. Docs/ADR, operational runbook, and rollout smoke evidence.

Do not commit unrelated existing dirty files. If a target file already contains unrelated changes, inspect and preserve them.

## Task 1 - Add Taxonomy Schema And Migration

Files:

- Modify `apps/server/prisma/schema.prisma`.
- Create `apps/server/prisma/migrations/<timestamp>_add_vehicle_taxonomy_tables/migration.sql`.
- Create `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.types.ts`.

Why:

- Establish the local canonical persistence owner before touching public route behavior.

Impact/Compatibility:

- Additive tables only.
- No public API behavior changes yet.

Repair Track:

- Root cause: current taxonomy has no durable canonical storage.
- Canonical owner: new Prisma models.
- Stable repair: store canonical makes, models, spec options, places, sync runs, and candidates separately.

Retirement Track:

- Old owner/fallback: hardcoded arrays and observed inventory.
- Active status: keep as emergency seed/fallback.
- Deletion trigger: after local snapshot route tests and provider sync pass.

Steps:

1. Write failing schema-aware repository test in `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  vehicleMake: { findMany: vi.fn() },
  vehicleModel: { findMany: vi.fn() },
  vehicleSpecOption: { findMany: vi.fn() },
  geoPlace: { findMany: vi.fn() }
}));

vi.mock('../../services/prisma.js', () => ({ prisma: prismaMock }));

describe('VehicleTaxonomyRepository', () => {
  it('reads active makes with models and snapshot options', async () => {
    prismaMock.vehicleMake.findMany.mockResolvedValue([
      { id: 'make_1', slug: 'bmw', label: 'BMW', sourceMeta: {}, models: [
        { id: 'model_1', slug: 'x5', label: 'X5', sourceMeta: {} }
      ] }
    ]);
    prismaMock.vehicleSpecOption.findMany.mockResolvedValue([
      { group: 'fuel', slug: 'diesel', label: 'Дизель', sourceMeta: {} }
    ]);
    prismaMock.geoPlace.findMany.mockResolvedValue([
      { slug: 'lviv', label: 'Львів', sourceMeta: {} }
    ]);

    const { vehicleTaxonomyRepository } = await import('./vehicleTaxonomy.repository.js');
    const snapshot = await vehicleTaxonomyRepository.readPublicSnapshot({ countryCode: 'UA' });

    expect(snapshot.makes[0]).toMatchObject({ slug: 'bmw', label: 'BMW' });
    expect(snapshot.makes[0].models[0]).toMatchObject({ slug: 'x5', label: 'X5' });
    expect(snapshot.specOptions[0]).toMatchObject({ group: 'fuel', slug: 'diesel' });
    expect(snapshot.places[0]).toMatchObject({ slug: 'lviv', label: 'Львів' });
  });
});
```

2. Verify RED:

```bash
npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts
```

Expected: test fails because repository/model client access does not exist.

3. Add Prisma models in `schema.prisma` using the spec model names: `VehicleMake`, `VehicleModel`, `VehicleSpecOption`, `GeoPlace`, `TaxonomySyncRun`, `VehicleTaxonomyCandidate`. Prefer `@db.JsonB` for `sourceMeta`, `counts`, and `evidence`.

4. Generate migration:

```bash
cd apps/server
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > /tmp/vehicle_taxonomy_full.sql
```

Then create a normal migration directory and include only the new table/index SQL, not a full schema recreate. If unsure, use:

```bash
cd apps/server
npx prisma migrate dev --name add_vehicle_taxonomy_tables --create-only
```

Do not apply production migrations in this task.

5. Add `vehicleTaxonomy.types.ts`:

```ts
export type VehicleTaxonomyOption = {
  id: string;
  label: string;
  aliases?: string[];
  externalIds?: Record<string, string | number>;
};

export type VehicleTaxonomyModel = VehicleTaxonomyOption & {
  brandId?: string;
};

export type VehicleTaxonomyBrand = VehicleTaxonomyOption & {
  models: VehicleTaxonomyModel[];
};

export type VehicleTaxonomyResponse = {
  ok?: boolean;
  version?: string;
  source?: 'LOCAL_SNAPSHOT' | 'EMERGENCY_FALLBACK';
  updatedAt?: string;
  stale?: boolean;
  brands: VehicleTaxonomyBrand[];
  bodyTypes: VehicleTaxonomyOption[];
  fuels: VehicleTaxonomyOption[];
  transmissions: VehicleTaxonomyOption[];
  drives: VehicleTaxonomyOption[];
  cities: VehicleTaxonomyOption[];
};
```

6. Add `vehicleTaxonomy.repository.ts` with `readPublicSnapshot`.

7. Verify GREEN:

```bash
npm --prefix apps/server run prisma:generate
npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts
```

8. Commit only schema/migration/new module files if the worktree is otherwise dirty:

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations/<timestamp>_add_vehicle_taxonomy_tables apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.types.ts apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.ts apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts
git commit -m "feat: add vehicle taxonomy storage"
```

## Task 2 - Build Public Snapshot Mapper With Emergency Fallback

Files:

- Create `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.service.ts`.
- Create `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.fallback.ts`.
- Modify `apps/server/src/services/vehicleTaxonomy.service.ts` into a compatibility wrapper.
- Modify tests in `apps/server/src/services/vehicleTaxonomy.service.test.ts`.

Why:

- Fix duplicate IDs and noisy model pollution without needing external API sync first.

Impact/Compatibility:

- Public response shape stays compatible.
- Adds optional metadata: `version`, `source`, `updatedAt`, `stale`.

Repair Track:

- Root cause: public response currently merges hardcoded data, aliases, and recent inventory directly.
- Canonical owner: new service mapper.
- Stable repair: DB snapshot first, emergency fallback second, observed candidates quarantined.

Retirement Track:

- Old owner/fallback: current `CURATED_BRANDS` and frontend `VEHICLE_BRANDS`.
- Active status: emergency fallback only.
- Deletion trigger: after provider sync and route verification.

Steps:

1. Write failing service tests in `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const repositoryMock = vi.hoisted(() => ({
  readPublicSnapshot: vi.fn()
}));

vi.mock('./vehicleTaxonomy.repository.js', () => ({
  vehicleTaxonomyRepository: repositoryMock
}));

describe('VehicleTaxonomyService', () => {
  it('deduplicates canonical brands by id and keeps model labels bounded', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({
      makes: [
        { slug: 'audi', label: 'Audi', sourceMeta: {}, models: [{ slug: 'a4', label: 'A4', sourceMeta: {} }] },
        { slug: 'audi', label: 'AUDI', sourceMeta: {}, models: [{ slug: 'q5', label: 'Q5', sourceMeta: {} }] }
      ],
      specOptions: [],
      places: [],
      updatedAt: new Date('2026-06-18T00:00:00Z')
    });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ countryCode: 'UA' });

    expect(output.brands.filter((brand) => brand.id === 'audi')).toHaveLength(1);
    expect(output.brands.find((brand) => brand.id === 'audi')?.models.map((model) => model.label)).toEqual(['A4', 'Q5']);
  });

  it('falls back to emergency data when local snapshot is empty', async () => {
    repositoryMock.readPublicSnapshot.mockResolvedValue({ makes: [], specOptions: [], places: [], updatedAt: null });

    const { vehicleTaxonomyService } = await import('./vehicleTaxonomy.service.js');
    const output = await vehicleTaxonomyService.getPublicTaxonomy({ countryCode: 'UA' });

    expect(output.source).toBe('EMERGENCY_FALLBACK');
    expect(output.stale).toBe(true);
    expect(output.brands.some((brand) => brand.id === 'bmw')).toBe(true);
  });
});
```

2. Verify RED:

```bash
npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts
```

3. Implement `vehicleTaxonomy.fallback.ts` with a compact cleaned version of the current curated list plus static spec/city options.

4. Implement mapper rules:

- `id` comes from stable slug.
- Merge duplicate brands by `id`.
- Merge duplicate models by `brandId + id`.
- Reject model labels over 80 characters or labels containing obvious long-description markers like `Опис від продавця`, `перевірку`, `офіційних відкритих`.
- Attach aliases from `NormalizationAlias` in the repository or service layer.

5. Make old `apps/server/src/services/vehicleTaxonomy.service.ts` re-export the new service and types, or delegate:

```ts
export {
  vehicleTaxonomyService,
  vehicleTaxonomyId
} from '../modules/VehicleTaxonomy/vehicleTaxonomy.service.js';

export type {
  VehicleTaxonomyOption,
  VehicleTaxonomyModel,
  VehicleTaxonomyBrand,
  VehicleTaxonomyResponse
} from '../modules/VehicleTaxonomy/vehicleTaxonomy.types.js';
```

If existing tests import helper internals that cannot be re-exported cleanly, keep a thin wrapper instead of deleting all old code in one commit.

6. Verify GREEN:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts \
  src/services/vehicleTaxonomy.service.test.ts
```

7. Commit:

```bash
git add apps/server/src/modules/VehicleTaxonomy apps/server/src/services/vehicleTaxonomy.service.ts apps/server/src/services/vehicleTaxonomy.service.test.ts
git commit -m "feat: map vehicle taxonomy from local snapshot"
```

## Task 3 - Wire Public And Admin Routes

Files:

- Create `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.ts`.
- Modify `apps/server/src/index.ts`.
- Modify `apps/server/src/routes/miniAppRoutes.ts` only if keeping the existing route there is simpler.
- Create `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts`.

Why:

- Keep public route backward-compatible and add authenticated admin sync/status surfaces.

Impact/Compatibility:

- Existing `/api/miniapp/vehicle-taxonomy` keeps working.
- New admin route should require `ADMIN` or `SUPER_ADMIN`.

Repair Track:

- Root cause: current route lives inside broad `miniAppRoutes.ts`.
- Canonical owner: `VehicleTaxonomy` routes module for taxonomy-specific concerns.
- Stable repair: route delegates to service; no source logic in route.

Retirement Track:

- Old owner/fallback: direct route handler inside `miniAppRoutes.ts`.
- Active status: keep or proxy during compatibility window.
- Deletion trigger: after route tests and public smoke pass.

Steps:

1. Write route tests:

```ts
import request from 'supertest';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';

const serviceMock = vi.hoisted(() => ({
  getPublicTaxonomy: vi.fn(),
  startSync: vi.fn(),
  getSyncRun: vi.fn()
}));

vi.mock('./vehicleTaxonomy.service.js', () => ({
  vehicleTaxonomyService: serviceMock
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    if (req.get('authorization')) req.user = { role: 'ADMIN', companyId: 'company_1', workspaceId: 'company_1' };
    next();
  },
  requireRole: () => (req: any, res: any, next: any) => req.user ? next() : res.status(403).json({ error: 'Insufficient permissions' })
}));

describe('vehicleTaxonomyRoutes', () => {
  it('serves public taxonomy without auth', async () => {
    serviceMock.getPublicTaxonomy.mockResolvedValue({ ok: true, brands: [], bodyTypes: [], fuels: [], transmissions: [], drives: [], cities: [] });
    const { default: routes } = await import('./vehicleTaxonomy.routes.js');
    const app = express();
    app.use('/api/vehicle-taxonomy', routes);

    const res = await request(app).get('/api/vehicle-taxonomy/public?slug=cartie');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('requires auth for sync', async () => {
    const { default: routes } = await import('./vehicleTaxonomy.routes.js');
    const app = express();
    app.use(express.json());
    app.use('/api/vehicle-taxonomy', routes);

    const res = await request(app).post('/api/vehicle-taxonomy/sync').send({ sources: ['NHTSA'] });
    expect(res.status).toBe(403);
  });
});
```

2. Verify RED:

```bash
npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts
```

3. Implement route:

- `GET /public` for internal mount if using `/api/vehicle-taxonomy/public`.
- `POST /sync` with `authenticateToken` + `requireRole(['ADMIN'])`.
- `GET /sync/status`.

4. Wire existing MiniApp route to call the new service. Keep path:

```http
GET /api/miniapp/vehicle-taxonomy?slug=cartie
```

5. Optionally mount new admin API:

```ts
import vehicleTaxonomyRoutes from './modules/VehicleTaxonomy/vehicleTaxonomy.routes.js';
app.use('/api/vehicle-taxonomy', vehicleTaxonomyRoutes);
apiV2Router.use('/vehicle-taxonomy', vehicleTaxonomyRoutes);
```

6. Verify GREEN:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts \
  src/routes/miniAppLeadHandoff.routes.test.ts
```

7. Commit:

```bash
git add apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.ts apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts apps/server/src/index.ts apps/server/src/routes/miniAppRoutes.ts
git commit -m "feat: expose vehicle taxonomy routes"
```

## Task 4 - Add Provider Adapters And Dry-Run Sync

Files:

- Create `apps/server/src/modules/VehicleTaxonomy/providers/autoria.provider.ts`.
- Create `apps/server/src/modules/VehicleTaxonomy/providers/nhtsa.provider.ts`.
- Create `apps/server/src/modules/VehicleTaxonomy/providers/geoplaces.provider.ts`.
- Create `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.ts`.
- Create matching provider/sync tests.

Why:

- Pull authoritative/open source data into the local snapshot without making MiniApp depend on external uptime.

Impact/Compatibility:

- No public route behavior changes unless sync is executed.
- Sync must support `dryRun`.

Repair Track:

- Root cause: external source knowledge is either absent or trapped in listing search.
- Canonical owner: sync service + provider adapters.
- Stable repair: provider output normalizes into the local repository contract.

Retirement Track:

- Old owner/fallback: manual hardcoded list.
- Active status: fallback only.
- Deletion trigger: after successful sync and smoke.

Steps:

1. Write provider tests with fixtures; never call live APIs in unit tests.

AUTO.RIA provider test shape:

```ts
import { describe, expect, it } from 'vitest';
import { mapAutoriaMarks, mapAutoriaModels } from './autoria.provider.js';

describe('AUTO.RIA taxonomy provider mapping', () => {
  it('maps marks and models into canonical source records', () => {
    const marks = mapAutoriaMarks([{ value: 9, name: 'BMW' }]);
    const models = mapAutoriaModels(9, [{ value: 123, name: 'X5' }]);

    expect(marks[0]).toMatchObject({ slug: 'bmw', label: 'BMW', externalIds: { autoria: 9 } });
    expect(models[0]).toMatchObject({ makeExternalId: 9, slug: 'x5', label: 'X5', externalIds: { autoria: 123 } });
  });
});
```

NHTSA provider test shape:

```ts
import { describe, expect, it } from 'vitest';
import { mapNhtsaMakes, mapNhtsaModels } from './nhtsa.provider.js';

describe('NHTSA taxonomy provider mapping', () => {
  it('maps vPIC makes and models into fallback source records', () => {
    expect(mapNhtsaMakes([{ MakeId: 474, MakeName: 'HONDA' }])[0]).toMatchObject({ slug: 'honda', label: 'Honda' });
    expect(mapNhtsaModels([{ Make_ID: 474, Make_Name: 'Honda', Model_ID: 1865, Model_Name: 'CR-V' }])[0]).toMatchObject({ slug: 'cr-v', label: 'CR-V' });
  });
});
```

2. Verify RED:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/providers/autoria.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/nhtsa.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts
```

3. Implement provider mapping functions first, then HTTP fetch functions.

4. Implement sync service:

- accepts `{ sources, countryCode, vehicleType, dryRun }`
- creates `TaxonomySyncRun`
- fetches provider data
- upserts makes/models/spec options/places when `dryRun=false`
- stores counts and safe errors

5. Verify GREEN:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/providers/autoria.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/nhtsa.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.test.ts
```

6. Commit:

```bash
git add apps/server/src/modules/VehicleTaxonomy/providers apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.ts apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.sync.service.test.ts
git commit -m "feat: add vehicle taxonomy source sync"
```

## Task 5 - Quarantine Observed Inventory Candidates

Files:

- Modify `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.service.ts`.
- Create `apps/server/src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.ts`.
- Modify `apps/server/src/services/enhanced-parsing.utils.ts` only if needed to call candidate service outside parsing hot path.
- Add tests.

Why:

- Stop long noisy inventory strings from becoming public model options while preserving learning value.

Impact/Compatibility:

- Public taxonomy gets cleaner.
- Unknown labels are not lost; they become review evidence.

Repair Track:

- Root cause: observed inventory values were merged into public taxonomy directly.
- Canonical owner: candidate queue.
- Stable repair: candidate records with evidence and status.

Retirement Track:

- Old owner/fallback: direct `CarListing` scan in current taxonomy service.
- Active status: disabled for public canon; keep as candidate producer.
- Deletion trigger: after candidate tests prove unknowns are captured.

Steps:

1. Write test:

```ts
import { describe, expect, it } from 'vitest';
import { shouldRejectPublicModelLabel } from './vehicleTaxonomy.candidates.js';

describe('vehicle taxonomy candidates', () => {
  it('rejects noisy long model labels from public taxonomy', () => {
    expect(shouldRejectPublicModelLabel('Model X Білий колірЕлектроВідсутній у розшукуОпис від продавця')).toBe(true);
    expect(shouldRejectPublicModelLabel('X5 M50i G05')).toBe(false);
  });
});
```

2. Verify RED:

```bash
npm --prefix apps/server test -- src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.test.ts
```

3. Implement candidate helper and repository insert/upsert.

4. Remove direct observed inventory merge from public mapper. If preserving current behavior is necessary during rollout, place it behind a disabled internal flag and default it off.

5. Verify GREEN:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.candidates.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts \
  src/services/vehicleTaxonomy.service.test.ts
```

6. Commit:

```bash
git add apps/server/src/modules/VehicleTaxonomy apps/server/src/services/vehicleTaxonomy.service.ts apps/server/src/services/vehicleTaxonomy.service.test.ts
git commit -m "fix: quarantine observed vehicle taxonomy candidates"
```

## Task 6 - Migrate Parser And Frontend Consumers

Files:

- Modify `apps/server/src/services/taxonomy.ts`.
- Modify `apps/server/src/services/enhanced-parsing.utils.ts`.
- Modify `apps/server/src/modules/Marketing/showcase/showcase.service.ts`.
- Modify `apps/server/src/modules/Integrations/mtproto/mtproto.service.ts`.
- Modify `apps/web/src/services/miniappApi.ts`.
- Modify `apps/web/src/pages/public/miniapp/vehicleOptions.ts`.
- Modify `apps/web/src/pages/public/miniapp/views/RequestView.tsx` only if type metadata requires it.

Why:

- Convert duplicated lists into consumers of the canonical module while keeping emergency fallback.

Impact/Compatibility:

- Parsing/search should improve or remain equivalent.
- Frontend fallback still exists for offline/dev error paths.

Repair Track:

- Root cause: brand/model lists are duplicated across backend parser, taxonomy, and frontend.
- Canonical owner: `VehicleTaxonomy` module.
- Stable repair: shared server lookup for backend consumers; frontend uses public API first.

Retirement Track:

- Old owner/fallback: hardcoded arrays.
- Active status: emergency fallback only.
- Deletion trigger: after server tests and web build pass.

Steps:

1. Write tests for `detectMake` compatibility:

```ts
import { describe, expect, it } from 'vitest';
import { detectMakeFromKnownList } from './taxonomy.js';

describe('taxonomy helpers', () => {
  it('detects longer make names before shorter aliases', () => {
    expect(detectMakeFromKnownList('Mercedes-Benz GLE 350', ['Mercedes', 'Mercedes-Benz'])).toBe('Mercedes-Benz');
  });
});
```

2. Verify RED if helper does not exist:

```bash
npm --prefix apps/server test -- src/services/taxonomy.test.ts
```

3. Extract pure detection helper that accepts a make list. Keep current `detectMake(text)` synchronous using emergency fallback for parser hot paths. Add an async taxonomy-backed helper separately if needed.

4. Update backend consumers only where safe. Do not add DB calls inside tight parsing loops unless batching/caching is explicit.

5. Update frontend types in `miniappApi.ts` to accept optional `version`, `source`, `updatedAt`, `stale`, and `externalIds`.

6. Keep `vehicleOptions.ts` but rename comments/exports to emergency fallback semantics; do not remove it in this task.

7. Verify:

```bash
npm --prefix apps/server test -- \
  src/services/taxonomy.test.ts \
  src/__tests__/enhanced-parsing.utils.test.ts \
  src/modules/Marketing/showcase/showcase.service.miniapp.test.ts
npm --prefix apps/web run build
```

8. Commit:

```bash
git add apps/server/src/services/taxonomy.ts apps/server/src/services/taxonomy.test.ts apps/server/src/services/enhanced-parsing.utils.ts apps/server/src/modules/Marketing/showcase/showcase.service.ts apps/server/src/modules/Integrations/mtproto/mtproto.service.ts apps/web/src/services/miniappApi.ts apps/web/src/pages/public/miniapp/vehicleOptions.ts apps/web/src/pages/public/miniapp/views/RequestView.tsx
git commit -m "refactor: consume canonical vehicle taxonomy"
```

## Task 7 - Add Operational Docs, ADR, And Rollout Smoke

Files:

- Create `docs/aegis/adr/2026-06-18-vehicle-taxonomy-local-snapshot-owner.md`.
- Update `docs/aegis/INDEX.md`.
- Create `docs/aegis/work/2026-06-18-vehicle-taxonomy-rollout/README.md` during execution if live smoke evidence is collected.

Why:

- This changes a durable source-of-truth boundary and needs future retrieval.

Impact/Compatibility:

- Documentation only.

Steps:

1. Add ADR:

```md
# Vehicle Taxonomy Local Snapshot Owner

Date: 2026-06-18
Status: accepted after implementation verification

## Decision

Cartie local vehicle taxonomy tables own runtime make/model/spec/city taxonomy. AUTO.RIA, NHTSA, KATOTTG, GeoNames, and optional paid specs providers are inputs only.

## Consequences

- MiniApp selectors never depend on live external API calls.
- Observed inventory labels become candidates, not public canonical entries.
- Hardcoded lists remain emergency fallback until retired.
```

2. Update `docs/aegis/INDEX.md` with the ADR and any rollout work trail.

3. Run full verification:

```bash
npm --prefix apps/server test -- \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.repository.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.service.test.ts \
  src/modules/VehicleTaxonomy/vehicleTaxonomy.routes.test.ts \
  src/modules/VehicleTaxonomy/providers/autoria.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/nhtsa.provider.test.ts \
  src/modules/VehicleTaxonomy/providers/geoplaces.provider.test.ts \
  src/services/vehicleTaxonomy.service.test.ts \
  src/routes/miniAppLeadHandoff.routes.test.ts
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

4. After deployment approval, run read-only smoke:

```bash
curl -fsS "http://127.0.0.1:3002/api/miniapp/vehicle-taxonomy?slug=cartie" \
  | jq '{ok, version, source, stale, brand_count:(.brands|length), duplicate_ids:([.brands[].id] | group_by(.) | map(select(length>1)) | length)}'
```

Expected:

- `ok: true`
- `duplicate_ids: 0`
- `brand_count` nonzero
- `source` is `LOCAL_SNAPSHOT` after seed/sync or `EMERGENCY_FALLBACK` before seed.

5. Commit docs:

```bash
git add docs/aegis/adr/2026-06-18-vehicle-taxonomy-local-snapshot-owner.md docs/aegis/INDEX.md docs/aegis/work/2026-06-18-vehicle-taxonomy-rollout
git commit -m "docs: record vehicle taxonomy ownership"
```

## Rollback Surface

- Schema migration is additive; rollback can leave unused tables in place if API code is reverted.
- Public route rollback: re-point `vehicleTaxonomy.service.ts` compatibility wrapper to old implementation.
- Provider sync rollback: disable admin sync route or source list; last good local snapshot remains usable.
- Frontend rollback: old `vehicleOptions.ts` fallback remains present.
- No `CarListing` mutation is part of this workstream, so inventory rollback is not expected.

## Risks

- AUTO.RIA API key/quota unavailable: phase 1 still ships with local fallback and NHTSA/KATOTTG disabled.
- KATOTTG file format changes: implement geoplaces adapter behind fixtures first.
- Dirty worktree conflicts: before execution, inspect every target file with `git diff -- <file>` and avoid overwriting unrelated edits.
- Public route regression: keep compatibility tests around existing top-level fields.
- Parser performance regression: do not add per-message DB taxonomy calls in MTProto hot paths.

## Retirement

Old owners and retirement state:

- `vehicleTaxonomy.service.ts` hardcoded `CURATED_BRANDS`: retire to emergency fallback after task 2.
- `taxonomy.ts` `CAR_MAKES`: keep synchronous emergency fallback; add canonical cached path later if needed.
- `enhanced-parsing.utils.ts` `BRAND_LIST`: keep bounded parser fallback; avoid DB calls in hot path.
- `vehicleOptions.ts` `VEHICLE_BRANDS`: emergency frontend fallback only.
- `CarListing.specs` observed values: candidate evidence only.
- `DictionarySet`: unchanged; not used as vehicle taxonomy authority in this plan.

## ADR Signal Preservation

Implementation completion should backfill an ADR with:

- local snapshot as canonical owner;
- external sources as inputs only;
- compatibility contract for `/api/miniapp/vehicle-taxonomy`;
- retirement schedule for hardcoded lists and observed-inventory direct injection.

## Self-Review

- Spec coverage: every requirement in the approved spec maps to storage, public mapper, sync, candidate quarantine, consumer migration, or docs tasks.
- Placeholder scan: no TBD/TODO placeholders are present.
- Type consistency: public response types match existing MiniApp fields and optional metadata.
- Compatibility: current public route shape is preserved.
- Plan-time complexity: new module boundary avoids expanding large route/UI/parser files.
- Architecture integrity: single owner module is defined before task decomposition.
- Verification: every major slice has exact commands.
- Dual-track: repair and retirement tracks are included for schema, mapper, routes, sync, candidates, consumers, and docs.
