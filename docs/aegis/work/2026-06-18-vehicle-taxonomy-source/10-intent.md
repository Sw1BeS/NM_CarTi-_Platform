# Vehicle Taxonomy Source Work Intent

Date: 2026-06-18
Status: active
Parent spec: `docs/aegis/specs/2026-06-18-vehicle-taxonomy-source-design.md`
Parent plan: `docs/aegis/plans/2026-06-18-vehicle-taxonomy-source-implementation-plan.md`

## TaskIntentDraft

- Outcome: implement local vehicle/city taxonomy ownership for Cartie with a compatible public MiniApp taxonomy API.
- Goal: add canonical storage, public mapper, sync/candidate surfaces, and staged consumer migration without relying on live external APIs during MiniApp rendering.
- Success evidence: tests for repository/service/routes/providers/candidates, server build, web build, and read-only taxonomy smoke after deploy approval.
- Stop condition: completed implementation with verification evidence, or blocked/needs-verification/scope-exceeded state recorded.
- Non-goals: no production sync run without explicit operator command, no inventory mutation, no automatic publication, no paid specs provider implementation in phase 1.
- Main risks: dirty source checkout drift, schema conflicts, provider API uncertainty, parser performance regressions.

## BaselineReadSetHint

Required refs:

- `docs/aegis/specs/2026-06-18-vehicle-taxonomy-source-design.md`
- `docs/aegis/plans/2026-06-18-vehicle-taxonomy-source-implementation-plan.md`
- `docs/aegis/baseline/2026-05-27-initial-baseline.md`
- `apps/server/prisma/schema.prisma`
- `apps/server/src/services/vehicleTaxonomy.service.ts`
- `apps/server/src/routes/miniAppRoutes.ts`
- `apps/web/src/services/miniappApi.ts`

## BaselineUsageDraft

- Required baseline refs: parent spec, parent plan, baseline snapshot, Prisma schema, current taxonomy service, MiniApp API contract.
- Acknowledged before plan refs: approved spec and plan; dirty production checkout; implementation moved to isolated worktree.
- Cited refs: parent spec and implementation plan.
- Missing refs: confirmed AUTO.RIA quota/key and KATOTTG current file URL.
- Decision: continue.

## ImpactStatementDraft

- Affected layers: Prisma schema, server module, MiniApp public route, admin sync route, parser helpers, frontend API types, docs/ADR.
- Compatibility boundary: `/api/miniapp/vehicle-taxonomy` keeps existing top-level fields; no runtime external API dependency; observed inventory goes to candidates, not canon.
- Non-edits for initial slice: no production deploy, no production sync, no `CarListing` mutation, no unrelated dirty-file cleanup.
