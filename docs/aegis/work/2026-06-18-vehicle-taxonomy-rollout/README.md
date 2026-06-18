# Vehicle Taxonomy Rollout Runbook

Date: 2026-06-18
Status: implementation verified; ready for staging operator run

## Boundary

Do not run write-mode sync against production until the deployment target and `DATABASE_URL` are verified.

The public MiniApp route must never call AUTO.RIA, NHTSA, KATOTTG, GeoNames, or paid specs APIs live. External sources only feed the local Cartie snapshot through this operator sync path.

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

## Rollback

- Disable write runs by removing `ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1`.
- Revert the app code if the public route regresses; the schema migration is additive and can remain unused.
- Keep the last good local snapshot in place; public MiniApp rendering does not depend on external provider uptime.
