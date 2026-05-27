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

## Telegram And Lead/Request Join Checkpoint

Completed:

- Added attribution payload helper for token extraction, snapshot reading, snapshot merge, and lookup.
- Updated CLIENT_LEAD `/start` handling to preserve reserved aliases and bind valid attribution tokens without lowercasing them.
- Invalid `/start` payloads now show the normal menu instead of becoming free-text lead messages.
- Updated lead creation to attach attribution snapshots and pass `fbp`, `fbc`, IP, UA, and event source URL into initial B2C CRM Lead sends.
- Updated MiniApp pending/finalized request flows to resolve and carry attribution snapshots without replacing existing `tracking`.
- Added routeMessage attribution tests and strengthened leadService attribution assertions.

Evidence refs:

- `npm --prefix apps/server test -- src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts src/modules/Communication/telegram/core/leadService.test.ts src/services/miniapp.service.test.ts src/services/requestContract.service.test.ts src/routes/miniappTrackingEvents.web.test.ts`
- `npm --prefix apps/server run build`
- Pre-existing stale expectation confirmed on untouched `/srv/cartie`: `npm --prefix apps/server test -- src/routes/miniAppLeadHandoff.routes.test.ts -t "lists active B2B network requests without exposing requester contacts"` fails the same way.

Drift check:

- Scope: still inside Telegram/lead/request attribution join.
- Compatibility: reserved `/start` aliases still win; existing MiniApp tracking stays intact.
- New owner: no new owner; helper remains under Attribution module.
- Retirement: legacy MiniApp tracking remains compatibility lane.
- Decision: continue to SalesDrive and Meta sender hardening.

## SalesDrive And Meta Sender Checkpoint

Completed:

- SalesDrive sync mapper now includes safe attribution summary in comments and prefers attribution UTM/event source URL when present.
- SalesDrive LeadIdentity payload now records `attributionToken` for webhook join context.
- SalesDrive webhook context now reads attribution snapshots from linked request, lead, or identity payload.
- Webhook Contacted events pass explicit `eventTime`, `fbp`, `fbc`, IP, UA, and event source URL into the Meta B2C sender.
- Meta CAPI input now accepts `eventTime` / `event_time`.
- Meta sender uses explicit event time, skips too-old explicit events, logs duplicate-skip decisions, and writes retryable error logs with attempt-specific idempotency keys.

Evidence refs:

- `npm --prefix apps/server test -- src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts src/modules/Integrations/meta/metaCapi.service.test.ts`
- `npm --prefix apps/server run build`

Drift check:

- Scope: still inside SalesDrive/Meta hardening.
- Compatibility: only status `13 -> Contacted` is active by default; unconfirmed statuses stay skipped.
- New owner: none; attribution owner remains separate from Meta sender.
- Retirement: legacy generic Meta senders are still not canonical for B2C CRM.
- Decision: continue to docs/ADR/operator visibility and full verification.

## Final Implementation Checkpoint

Completed:

- Added ADR for `AttributionSession` ownership.
- Updated Meta tracking knowledge base with implementation notes and runtime defaults.
- Extended `/api/integrations/meta/debug` with B2C CRM counts, safe last sent/skipped/error logs, missing identifier count, and attribution session counts.
- Ran focused verification gate, build, and code-map check.

Evidence refs:

- `npm --prefix apps/server test -- src/modules/Integrations/integration.routes.metaDebug.test.ts`
- `npm --prefix apps/server test -- src/config/env.test.ts src/modules/Attribution/attributionSession.service.test.ts src/modules/Attribution/trackingRedirect.routes.test.ts src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts src/modules/Communication/telegram/core/leadService.test.ts src/services/miniapp.service.test.ts src/services/requestContract.service.test.ts src/routes/miniappTrackingEvents.web.test.ts src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts src/modules/Integrations/meta/metaCapi.service.test.ts src/modules/Integrations/integration.routes.metaDebug.test.ts src/modules/Integrations/integration.routes.salesdriveWebhook.test.ts`
- `npm --prefix apps/server run build`
- `node scripts/inspect/generate_code_map.mjs --check`

Drift check:

- Scope: implementation matches approved plan.
- Compatibility: production sends remain gated by existing Meta flags; redirect remains disabled by default.
- New owner: ADR records `AttributionSession`.
- Retirement: comments and legacy tracking are compatibility snapshots, not source-of-truth.
- Decision: completion candidate after final git status.
