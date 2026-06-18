# ADR: Vehicle Taxonomy Local Snapshot Owner

Date: 2026-06-18
Status: accepted for implementation branch

## Decision

Cartie local vehicle taxonomy tables own runtime make/model/spec/city taxonomy.
AUTO.RIA, NHTSA vPIC, KATOTTG, GeoNames, and optional paid specs providers are inputs only.

Canonical ownership:

```text
External taxonomy providers
  -> VehicleTaxonomy sync service
  -> VehicleMake / VehicleModel / VehicleSpecOption / GeoPlace
  -> VehicleTaxonomy public mapper
  -> GET /api/miniapp/vehicle-taxonomy
```

Observed inventory values are not public canonical taxonomy. They can become `VehicleTaxonomyCandidate` evidence for review, and the public mapper rejects noisy labels before exposing models.

## Context

The MiniApp vehicle request flow needs dependable make/model/spec/city options. A live external API call from the public MiniApp would make the form depend on third-party uptime, quotas, credentials, and response drift. The previous backend service also mixed curated fallback data, aliases, and recent inventory values directly, which allowed duplicate IDs and long scraped text to appear as public model options.

## Consequences

- MiniApp selectors never require live external provider calls.
- `/api/miniapp/vehicle-taxonomy` remains backward compatible and receives additive metadata: `version`, `source`, `updatedAt`, and `stale`.
- AUTO.RIA/NHTSA/KATOTTG/GeoNames sync can be run as dry-run first, then persisted into local tables.
- Emergency fallback stays available when no local snapshot exists.
- `NormalizationAlias` remains local override/alias data, not the canonical make/model owner.
- `CarListing.specs` and scraped listing text are evidence only; rejected/unknown labels go to candidate quarantine.

## Alternatives Considered

- Call AUTO.RIA or CarAPI live from MiniApp: rejected because it couples public rendering to external uptime and credentials.
- Use only NHTSA vPIC: rejected because it is broad and open, but not Ukraine-market-complete and does not cover local city taxonomy.
- Keep hardcoded arrays as primary owner: rejected because they drift quickly and cannot carry provenance.
- Promote observed inventory directly into public taxonomy: rejected because scraped descriptions can contain color, VIN checks, seller text, and other non-model labels.

## Retirement

- Backend and frontend hardcoded lists remain emergency fallback only.
- Parser hot paths keep synchronous fallback lists until a cached canonical lookup exists.
- Direct observed-inventory promotion is retired; candidate quarantine is the review path.
- Paid trim/spec enrichment can be added later as an input provider, not as runtime owner.

## Rollback

- The schema migration is additive; reverting code can leave unused taxonomy tables in place.
- Disable `/api/vehicle-taxonomy/sync` or restrict provider sources if a sync provider misbehaves.
- The last good local snapshot and emergency fallback continue serving MiniApp selectors.
