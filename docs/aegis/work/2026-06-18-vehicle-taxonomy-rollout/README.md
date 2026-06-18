# Vehicle Taxonomy Rollout Runbook

Date: 2026-06-18
Status: ready for staging operator run

## Boundary

Do not run write-mode sync against production until the deployment target and `DATABASE_URL` are verified.

The public MiniApp route must never call AUTO.RIA, NHTSA, KATOTTG, GeoNames, or paid specs APIs live. External sources only feed the local Cartie snapshot through this operator sync path.

## Preflight

From the feature branch or deployed server checkout:

```bash
npm --prefix apps/server run prisma:generate
npm --prefix apps/server run prisma:migrate
```

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

## Rollback

- Disable write runs by removing `ALLOW_VEHICLE_TAXONOMY_SYNC_WRITE=1`.
- Revert the app code if the public route regresses; the schema migration is additive and can remain unused.
- Keep the last good local snapshot in place; public MiniApp rendering does not depend on external provider uptime.
