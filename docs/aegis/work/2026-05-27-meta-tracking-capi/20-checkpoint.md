# Meta Tracking CAPI Checkpoint

## Initial Checkpoint

Current todo:

1. Isolated worktree and baseline checks.
2. AttributionSession schema, service, redirect route, env validation, tests.
3. Telegram `/start` binding and lead/request joins.
4. SalesDrive enrichment and Meta CAPI hardening.
5. Operator docs/ADR and final verification.

Completed:

- Plan and knowledge base were created in prior commits.
- Isolated worktree created at `/root/.config/aegis/worktrees/cartie/meta-tracking-capi`.
- Server dependencies installed in the worktree with `npm --prefix apps/server ci`.

Active slice:

- Baseline verification and bridge implementation.

Evidence refs:

- `node scripts/inspect/generate_code_map.mjs --check` passed before implementation.
- Initial server test attempt failed only because worktree dependencies were missing (`vitest: not found`), then dependencies were installed.

Blocked on:

- Fresh Meta test event code for live QA.
- Final SalesDrive status IDs beyond current `13 -> Contacted`.
- Consent/LDU policy and email capture decision.

Next step:

- Run baseline server tests after dependency install, then implement Task 1.

## Drift Check

- Scope: still implementing approved plan.
- Compatibility: no production/outbound calls; no code edits yet.
- Retirement: legacy Meta senders stay out of B2C proof path.
- Decision: continue.

## Bridge Checkpoint

Completed:

- Added additive `AttributionSession` Prisma model and migration.
- Added attribution owner module with service/types.
- Added `/r/bot` public redirect router behind disabled-by-default env flags.
- Mounted `/r` before public/static catch-all handling.
- Added env parsing for redirect enabled flag, TTL, allowlist, default destination, and fail mode.
- Added service, route, and env tests.

Evidence refs:

- `npm --prefix apps/server run prisma:generate`
- `npm --prefix apps/server test -- src/config/env.test.ts src/modules/Attribution/attributionSession.service.test.ts src/modules/Attribution/trackingRedirect.routes.test.ts`
- `npm --prefix apps/server run build`

Drift check:

- Scope: still inside bridge implementation.
- Compatibility: route fails closed by default and makes no Meta/SalesDrive calls.
- New owner: `apps/server/src/modules/Attribution/` as planned.
- Retirement: legacy payload/comment attribution remains compatibility only.
- Decision: continue to Telegram and lead/request join after commit.
