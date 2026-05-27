# Meta Tracking, CAPI, and Telegram Attribution Implementation Plan

Date: 2026-05-27
Status: ready for user review
Source spec: `docs/aegis/specs/2026-05-27-meta-tracking-capi-design.md`
Knowledge base: `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md`

## Goal

Implement the approved Meta tracking design without production side effects:

- Add a canonical first-party attribution bridge for direct Meta ad clicks into Telegram bot flows.
- Persist click/browser context before Telegram strips URL and browser identifiers.
- Join attribution into Telegram lead/request creation and SalesDrive CRM stage feedback.
- Improve B2C Meta CRM CAPI correctness: event time, duplicate logging, retry behavior, sanitized logs, and approved event taxonomy.
- Keep generic MiniApp/website telemetry separate from B2C CRM Conversion Leads.

## Architecture

Canonical flow:

```text
Meta Ad
  -> GET /r/bot?campaign_token=...&utm_source=...&fbclid=...
  -> AttributionSession(token, identifiers, query, requestMeta, TTL)
  -> 302 https://t.me/{bot_username}?start={token}
  -> Telegram /start stores token in BotSession.variables
  -> lead/request creation joins attribution
  -> SalesDrive request sync carries attribution snapshot
  -> SalesDrive webhook sends enriched CRM CAPI stage event
```

Ownership:

- `apps/server/src/modules/Attribution/` owns attribution sessions, redirect validation, token creation, cookie identifier generation, lookup, and consumption.
- `routeMessage.ts` only stores a validated token in session variables.
- `leadService.ts`, `miniapp.service.ts`, and `requestContract.service.ts` only attach sanitized attribution snapshots to durable entities.
- `salesdriveSync.service.ts` and `salesdriveWebhook.service.ts` only carry/read attribution for CRM stage feedback.
- `metaCapi.service.ts` only builds/sends/logs Meta events. It does not own attribution capture.

## Tech Stack

- Node/TypeScript, Express, Prisma/Postgres.
- Existing test runner: Vitest.
- Existing HTTP test style: `supertest` in server tests.
- Existing idempotency/logging storage: `IntegrationEventLog`.

## Baseline/Authority Refs

- `docs/aegis/baseline/2026-05-27-initial-baseline.md`
- `docs/aegis/specs/2026-05-27-meta-tracking-capi-design.md`
- `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md`
- `docs/code-map/INTEGRATIONS_MAP.md`
- `docs/code-map/TELEGRAM_MINIAPP_MAP.md`
- `apps/server/src/index.ts`
- `apps/server/src/config/env.ts`
- `apps/server/prisma/schema.prisma`
- `apps/server/src/modules/Integrations/meta/metaCapi.service.ts`
- `apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.ts`
- `apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.ts`
- `apps/server/src/modules/Communication/telegram/core/leadService.ts`
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- `apps/server/src/services/miniapp.service.ts`
- `apps/server/src/services/requestContract.service.ts`
- `apps/server/src/routes/miniAppRoutes.ts`
- `apps/web/src/pages/public/MiniApp.tsx`
- `apps/web/src/pages/public/miniapp/trackingEvents.ts`

## Compatibility Boundary

- Existing `/start sell`, `/start stock`, `/start available`, `/start catalog`, `/start transit`, and `/start pending` must remain unchanged.
- Existing MiniApp tracking payloads remain accepted.
- B2B/AdsQuiz/non-B2C flows must not send `META_B2C_BOT` CRM events.
- No raw token, phone, email, access token, webhook secret, or secret-bearing payload is written to `IntegrationEventLog.meta`.
- No fake Meta `lead_id`.
- No production Meta or SalesDrive write is part of this plan unless explicitly approved during QA.
- Migration is additive and rollback-safe.

## Verification

Focused test command:

```bash
npm --prefix apps/server test -- \
  src/modules/Attribution/attributionSession.service.test.ts \
  src/modules/Attribution/trackingRedirect.routes.test.ts \
  src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts \
  src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts \
  src/modules/Communication/telegram/core/leadService.test.ts \
  src/routes/miniAppLeadHandoff.routes.test.ts \
  src/routes/miniappTrackingEvents.web.test.ts \
  src/services/miniapp.service.test.ts \
  src/services/requestContract.service.test.ts \
  src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts \
  src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts \
  src/modules/Integrations/meta/metaCapi.service.test.ts
```

Build and docs checks:

```bash
npm --prefix apps/server run build
node scripts/inspect/generate_code_map.mjs --check
```

Manual QA is gated behind explicit approval:

- Meta Test Events raw curl.
- Cartie sender test event.
- Duplicate event verification.
- Controlled SalesDrive webhook fixture.
- Local `/r/bot` redirect smoke.

## Plan Basis

Facts:

- Cartie already has a B2C Meta CRM sender in `metaCapi.service.ts`.
- MiniApp can already capture `fbclid`, derive `fbc`, generate/preserve `fbp`, and send tracking metadata.
- Direct Telegram bot links cannot carry full browser/ad context; Telegram `start` is limited to a compact parameter.
- SalesDrive webhook currently sends only `Contacted` for status `13`.
- `IntegrationEventLog.idempotencyKey` is unique and can block naive retry logging after an error.
- Runtime configuration is centralized in `apps/server/src/config/env.ts` and should remain the owner for attribution flags, TTL, allowlist, and fail mode.

Assumptions:

- `/r/bot` can be mounted as a public route before SPA catch-all.
- A first-party Cartie domain can set `_fbp` and `_fbc` cookies.
- A 30-day attribution TTL is acceptable for the first implementation unless user/legal chooses a shorter value.

Unknowns:

- Fresh Meta test event code.
- Final SalesDrive status IDs for `QualifiedLead`, `Scheduled`, and `Won/Purchase`.
- Whether email capture is required now.
- Consent/Limited Data Use policy.

## Plan Pressure Test

- Owner / contract / retirement: proceed. The spec assigns `AttributionSession` as the new owner and legacy payload/comment fields as compatibility carriers.
- Verification scope: proceed. Each affected owner has existing nearby tests or a clear new test file.
- Task executability: proceed with split phases. The redirect bridge, entity join, SalesDrive enrichment, and Meta sender hardening can be implemented independently.
- Pressure result: proceed with a staged implementation plan.

## Plan-Time Complexity Check

- Target files: `routeMessage.ts`, `leadService.ts`, `miniapp.service.ts`, `requestContract.service.ts`, `salesdriveSync.service.ts`, `salesdriveWebhook.service.ts`, `metaCapi.service.ts`, `schema.prisma`, `index.ts`, `env.ts`.
- Existing size / shape signals: `routeMessage.ts`, `MiniApp.tsx`, and `miniAppRoutes.ts` are large high-attention surfaces.
- Owner fit: new attribution logic does not belong inside Telegram routing, MiniApp UI, or Meta sender.
- Add-in-place risk: high if token parsing, cookie generation, session lookup, and TTL logic are placed in existing route/service files.
- Better file boundary: create `apps/server/src/modules/Attribution/`.
- Recommendation: add owner file for attribution, then minimal edit-in-place glue in existing owners.

## PR Split

Implement as four reviewable units:

1. Attribution table, service, route, env validation, and local redirect tests.
2. Telegram `/start` binding plus lead/request attribution joins.
3. SalesDrive enrichment and Meta CAPI sender hardening.
4. Operator visibility, ADR, knowledge-base update, and manual QA instructions.

Reason:

- The bridge is independently testable and rollback-safe.
- Telegram/lead/request changes touch high-attention files and should not be hidden inside sender work.
- Meta sender hardening changes delivery semantics and deserves its own review.
- Docs and QA should record the final implementation, not anticipated code.

## Phase 0 - Approval And Runtime Inputs

Do this before code:

1. Confirm `/r/bot + AttributionSession` is approved as canonical bridge.
2. Confirm `ATTRIBUTION_SESSION_TTL_DAYS=30` or a different TTL.
3. Confirm bot username and destination allowlist.
4. Confirm SalesDrive status mapping.
5. Confirm consent/LDU policy.
6. Confirm whether live QA can use fresh Meta `test_event_code`.

If any item is not confirmed, implement only local code/tests behind disabled flags and do not run manual outbound QA.

## Task 1 - Add AttributionSession Schema And Migration

Files:

- Modify `apps/server/prisma/schema.prisma`.
- Create `apps/server/prisma/migrations/20260527120000_add_attribution_session/migration.sql`, or use the next chronological Prisma migration timestamp with the same suffix.
- Create `apps/server/src/modules/Attribution/attributionTypes.ts`.

Why:

- Establish one canonical durable owner for ad-click attribution.

Impact/Compatibility:

- Additive table only.
- No runtime behavior changes until routes/services use it.

Repair Track:

- Root cause: current attribution is scattered across MiniApp payloads, lead/request payloads, and SalesDrive comments.
- Canonical owner: `AttributionSession`.
- Stable repair: store click/browser identifiers once, then copy sanitized snapshots into business entities.

Retirement Track:

- Old owner/fallback: SalesDrive comments and entity payload fields.
- Active status: keep as compatibility snapshots.
- Deletion trigger: after production verification, stop treating comments as source-of-truth for attribution.

Implementation shape:

```prisma
model AttributionSession {
  id          String    @id @default(cuid())
  token       String    @unique
  companyId   String?
  botId       String?
  destination String
  source      String?
  query       Json?     @db.JsonB
  identifiers Json?     @db.JsonB
  requestMeta Json?     @db.JsonB
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([companyId])
  @@index([botId])
  @@index([expiresAt])
  @@index([destination])
}
```

Suggested migration SQL:

```sql
CREATE TABLE "AttributionSession" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "companyId" TEXT,
  "botId" TEXT,
  "destination" TEXT NOT NULL,
  "source" TEXT,
  "query" JSONB,
  "identifiers" JSONB,
  "requestMeta" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttributionSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttributionSession_token_key" ON "AttributionSession"("token");
CREATE INDEX "AttributionSession_companyId_idx" ON "AttributionSession"("companyId");
CREATE INDEX "AttributionSession_botId_idx" ON "AttributionSession"("botId");
CREATE INDEX "AttributionSession_expiresAt_idx" ON "AttributionSession"("expiresAt");
CREATE INDEX "AttributionSession_destination_idx" ON "AttributionSession"("destination");
```

Verification:

```bash
npm --prefix apps/server run prisma:generate
npm --prefix apps/server run build
```

Commit:

```bash
git add apps/server/prisma/schema.prisma apps/server/prisma/migrations apps/server/src/modules/Attribution/attributionTypes.ts
git commit -m "feat: add attribution session model"
```

## Task 2 - Implement Attribution Service

Files:

- Create `apps/server/src/modules/Attribution/attributionSession.service.ts`.
- Create `apps/server/src/modules/Attribution/attributionSession.service.test.ts`.

Why:

- Keep token generation, allowlist validation, cookie identifiers, lookup, snapshotting, and consumption out of existing large handlers.

Impact/Compatibility:

- Pure service with tests first.
- No route behavior until mounted.

Required contracts:

```ts
export type AttributionCreateInput = {
  companyId?: string | null;
  botId?: string | null;
  destination: string;
  botUsername: string;
  source?: string | null;
  query: Record<string, unknown>;
  requestMeta: {
    ip?: string | null;
    userAgent?: string | null;
    eventSourceUrl?: string | null;
    referrer?: string | null;
  };
  cookies?: {
    fbp?: string | null;
    fbc?: string | null;
  };
  now?: Date;
};

export type AttributionSnapshot = {
  token: string;
  destination: string;
  source?: string;
  query: Record<string, unknown>;
  identifiers: {
    fbclid?: string;
    fbp?: string;
    fbc?: string;
    client_ip_address?: string;
    client_user_agent?: string;
  };
  event_source_url?: string;
  created_at: string;
  expires_at: string;
};
```

Test cases:

- Creates base64url-safe token shorter than Telegram 64-character limit.
- Builds `fbc` from case-preserved `fbclid`.
- Reuses existing `_fbp` cookie when present.
- Generates `_fbp` when missing.
- Sanitizes query to known attribution keys only.
- Returns no raw phone/email even if query includes them.
- Rejects expired token lookup.
- Marks consumed only when requested.

Verification:

```bash
npm --prefix apps/server test -- src/modules/Attribution/attributionSession.service.test.ts
```

Commit:

```bash
git add apps/server/src/modules/Attribution/attributionSession.service.ts apps/server/src/modules/Attribution/attributionSession.service.test.ts
git commit -m "feat: add attribution session service"
```

## Task 3 - Add Public Redirect Route And Env Validation

Files:

- Create `apps/server/src/modules/Attribution/trackingRedirect.routes.ts`.
- Create `apps/server/src/modules/Attribution/trackingRedirect.routes.test.ts`.
- Modify `apps/server/src/index.ts`.
- Modify `apps/server/src/config/env.ts`.

Why:

- Capture Meta click identifiers before Telegram strips browser context.

Impact/Compatibility:

- New public route only: `GET /r/bot`.
- Must not create an open redirect.
- Must not call Meta or SalesDrive.

Route behavior:

- Read destination from `destination`, `dest`, or configured default.
- Resolve destination to an allowed bot username.
- Create attribution session.
- Set `_fbp`/`_fbc` cookies when generated/refreshed.
- Redirect to `https://t.me/{bot_username}?start={token}`.

Environment/config inputs:

- `ATTRIBUTION_REDIRECT_ENABLED=false` default.
- `ATTRIBUTION_SESSION_TTL_DAYS=30` default.
- `ATTRIBUTION_BOT_ALLOWLIST` as comma-separated entries like `b2c_bot_sandbox:Cartie_Client_Bot`.
- `ATTRIBUTION_REDIRECT_FAIL_MODE=closed` default. In closed mode, a disabled or misconfigured route does not redirect.

Mounting rule:

- Mount `/r` before the static frontend and catch-all handlers in `apps/server/src/index.ts`.

Tests:

- Disabled route returns `404` or `503` without creating a session.
- Invalid destination returns `400`.
- Unknown bot username is never accepted from raw query.
- Valid request creates session and redirects.
- `fbclid` survives case-sensitive in `fbc`.
- Cookies are set with `HttpOnly`, `Secure` when `NODE_ENV=production`, `SameSite=Lax`.
- Missing or invalid env config fails closed.

Verification:

```bash
npm --prefix apps/server test -- src/modules/Attribution/trackingRedirect.routes.test.ts
npm --prefix apps/server run build
```

Commit:

```bash
git add apps/server/src/modules/Attribution/trackingRedirect.routes.ts apps/server/src/modules/Attribution/trackingRedirect.routes.test.ts apps/server/src/index.ts apps/server/src/config/env.ts
git commit -m "feat: add attribution redirect route"
```

## Task 4 - Bind Telegram `/start` Token Without Breaking Aliases

Files:

- Modify `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`.
- Create `apps/server/src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts`.
- Keep or update `apps/server/src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts` for alias regressions.

Why:

- Store attribution token in `BotSession.variables` when a user arrives from `/r/bot`.

Impact/Compatibility:

- Existing aliases win: `sell`, `stock`, `available`, `catalog`, `transit`, `pending`.
- Unknown `/start` payload is not trusted unless attribution lookup succeeds.

Implementation shape:

- Add small helper near `/start` handling:
  - normalize payload without lowercasing token;
  - check alias set first;
  - call `AttributionSessionService.lookupToken(payload, { consume: false })`;
  - if found, `updateSession(ctx, state, { ...vars, attributionToken: payload, attributionBoundAt: now })`.
- Do not show tracking text to user.
- Continue to show menu or target alias behavior normally.

Tests:

- `/start sell` still starts sell wizard.
- `/start stock` still opens MiniApp inventory.
- `/start` with a valid attribution token stores token in session variables.
- `/start` with an invalid attribution token does not store token and falls through to normal menu behavior.

Verification:

```bash
npm --prefix apps/server test -- \
  src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts \
  src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts
```

Commit:

```bash
git add apps/server/src/modules/Communication/telegram/routing/routeMessage.ts apps/server/src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts apps/server/src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts
git commit -m "feat: bind attribution token from telegram start"
```

## Task 5 - Join Attribution Into Leads And Requests

Files:

- Modify `apps/server/src/modules/Communication/telegram/core/leadService.ts`.
- Modify `apps/server/src/modules/Communication/telegram/core/leadService.test.ts`.
- Modify `apps/server/src/services/miniapp.service.ts`.
- Modify `apps/server/src/services/miniapp.service.test.ts`.
- Modify `apps/server/src/services/requestContract.service.ts`.
- Modify `apps/server/src/services/requestContract.service.test.ts`.

Why:

- Durable lead/request entities need a sanitized attribution snapshot that later SalesDrive and Meta flows can use.

Impact/Compatibility:

- Existing payload keys remain.
- Add `payload.attribution` snapshot; do not overwrite existing `payload.tracking`.
- Mark attribution session consumed after durable association.

Implementation shape:

- Add helper in attribution service:
  - `resolveSnapshotFromToken(token, { consumeForLeadId?, consumeForRequestId? })`.
- In Telegram lead creation:
  - read token from `input.payload.attributionToken`, `input.payload.start_param`, or session-supplied payload when available.
  - merge snapshot into lead/request payload as `attribution`.
- In MiniApp flows:
  - if `tracking.startParam` matches an attribution token, join it.
  - keep existing `fbp/fbc` tracking behavior when no token exists.

Tests:

- New B2C lead gets `payload.attribution.identifiers.fbc/fbp/client_ip_address/client_user_agent`.
- Existing MiniApp tracking is still present.
- Expired token does not attach.
- Non-B2C lead does not send B2C CRM event because of attribution alone.
- Duplicate lead merge preserves or improves attribution snapshot without dropping phone/telegram fields.

Verification:

```bash
npm --prefix apps/server test -- \
  src/modules/Communication/telegram/core/leadService.test.ts \
  src/services/miniapp.service.test.ts \
  src/services/requestContract.service.test.ts
```

Commit:

```bash
git add apps/server/src/modules/Communication/telegram/core/leadService.ts apps/server/src/modules/Communication/telegram/core/leadService.test.ts apps/server/src/services/miniapp.service.ts apps/server/src/services/miniapp.service.test.ts apps/server/src/services/requestContract.service.ts apps/server/src/services/requestContract.service.test.ts
git commit -m "feat: attach attribution to lead and request payloads"
```

## Task 6 - Carry Attribution Through SalesDrive Sync

Files:

- Modify `apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.ts`.
- Modify `apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts`.

Why:

- SalesDrive-created orders must remain joinable to Cartie attribution context when status webhooks return.

Impact/Compatibility:

- SalesDrive payload/comment remains human-readable.
- No raw PII beyond already approved SalesDrive order fields.
- Attribution snapshot remains in Cartie database as source of truth.

Implementation shape:

- Extend `salesDriveOrderInputFromRequest` to read `payload.attribution`.
- Include safe context in comment:
  - `Attribution: token_prefix=abc123, campaign=qa_campaign, source=meta, has_fbc=true, has_fbp=true`.
- Ensure `persistSalesDriveLeadIdentity` payload records `requestId`, `requestPublicId`, and `attributionToken`.

Tests:

- B2C request with attribution includes safe attribution summary in SalesDrive comment.
- Comment does not include raw phone/email beyond existing customer contact fields.
- LeadIdentity payload includes `attributionToken`.

Verification:

```bash
npm --prefix apps/server test -- src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts
```

Commit:

```bash
git add apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.ts apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts
git commit -m "feat: carry attribution context into salesdrive sync"
```

## Task 7 - Enrich SalesDrive Webhook To Meta CRM Stage Events

Files:

- Modify `apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.ts`.
- Modify `apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts`.

Why:

- CRM stage events should include real attribution identifiers and actual status time.

Impact/Compatibility:

- Statuses not approved remain skipped.
- Non-B2C stays skipped.
- No outbound sends in tests because Meta service is mocked.

Implementation shape:

- Resolve request/lead identity by SalesDrive order ID.
- Read `payload.attribution` from linked lead/request.
- Pass into `MetaCapiService.trackB2CBotCrmLifecycleEvent`:
  - `eventTime: Number(statusTime)`;
  - `fbp`, `fbc`;
  - `clientIpAddress`, `clientUserAgent`;
  - `eventSourceUrl`;
  - existing phone/email/externalId.
- Add status mapping behind explicit config:
  - default current behavior: `13 -> Contacted`;
  - new statuses enabled only by config map `SALESDRIVE_B2C_META_STATUS_MAP`.

Tests:

- `Contacted` uses SalesDrive status timestamp as Meta event time.
- Attribution `fbp/fbc/IP/UA` is passed to Meta service.
- Non-B2C remains skipped.
- Unmapped statuses remain skipped.
- Duplicate success returns duplicate skip without second Meta call.

Verification:

```bash
npm --prefix apps/server test -- src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts
```

Commit:

```bash
git add apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.ts apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts
git commit -m "feat: enrich salesdrive crm meta events with attribution"
```

## Task 8 - Harden Meta CAPI Sender

Files:

- Modify `apps/server/src/modules/Integrations/meta/metaCapi.service.ts`.
- Modify `apps/server/src/modules/Integrations/meta/metaCapi.service.test.ts`.

Why:

- Sender must use correct business event time, log duplicate skips, avoid retry/log collisions, and keep payload summaries sanitized.

Impact/Compatibility:

- Existing successful B2C sends continue.
- Generic `trackEvent` remains available but legacy query-token senders stay outside B2C CRM path.

Implementation shape:

- Extend `MetaCapiTrackInput`:
  - `eventTime?: number | string | Date | null`;
  - `event_time?: number | string | Date | null`;
  - optional `dataProcessingOptions`.
- Resolve event time:
  - use explicit event time if valid;
  - fallback to `Date.now()`;
  - reject or skip if older than 7 days, with log.
- Replace duplicate success early return with a `WEBHOOK_DEDUP_SKIPPED` or `skipped_duplicate` log that does not collide with existing success idempotency key. Use a derived log key such as `${eventId}:duplicate:${Date.now()}` or no idempotency key for duplicate-decision logs.
- On Meta error after previous error, upsert/update existing log or use attempt-specific key to avoid unique conflict.
- Keep bearer token for B2C endpoint.

Tests:

- Explicit `eventTime` is used.
- Old event time is skipped and logged.
- Duplicate success does not call axios and creates a skip decision log.
- Error retry can be logged twice without throwing `P2002`.
- Payload summary contains keys only, not raw PII/token.

Verification:

```bash
npm --prefix apps/server test -- src/modules/Integrations/meta/metaCapi.service.test.ts
```

Commit:

```bash
git add apps/server/src/modules/Integrations/meta/metaCapi.service.ts apps/server/src/modules/Integrations/meta/metaCapi.service.test.ts
git commit -m "fix: harden meta capi event timing and idempotency"
```

## Task 9 - Add Admin/Operator Debug Visibility

Files:

- Inspect current integration routes under `apps/server/src/modules/Integrations/`.
- Modify the smallest existing admin Meta/SalesDrive debug surface.
- Add or update tests for sanitized response shape.

Why:

- Operators need to see whether attribution bridge and B2C CRM events are working without exposing PII.

Impact/Compatibility:

- Read-only admin visibility.
- No new outbound calls.

Implementation shape:

- Add counts for:
  - attribution sessions created/expired/consumed;
  - B2C CRM events sent/skipped/error;
  - duplicate skips;
  - last `fbtrace_id`;
  - missing identifiers count.
- Never return raw `payloadMeta` for Meta B2C logs; return summarized fields.

Tests:

- Admin debug endpoint redacts token/phone/email.
- Counts match fixture `IntegrationEventLog` rows.

Verification:

```bash
npm --prefix apps/server test -- src/modules/Integrations/meta/metaCapi.service.test.ts
npm --prefix apps/server run build
```

Commit:

```bash
git add apps/server/src/modules/Integrations
git commit -m "feat: add sanitized meta attribution debug visibility"
```

## Task 10 - Documentation, ADR Signal, And Code Map

Files:

- Add `docs/aegis/adr/2026-05-27-attribution-session-owner.md` if ADR workspace is accepted.
- Update `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md` with implementation notes after code lands.
- Run code-map check.

Why:

- The new attribution owner is durable architecture and should not be rediscovered later.

Impact/Compatibility:

- Docs only.

ADR contents:

- Decision: `AttributionSession` owns direct-to-Telegram attribution.
- Alternatives: payload-only patch, external sGTM/CAPI Gateway.
- Consequences: new table/route; clean owner; explicit retirement of comments as source of truth.
- Rollback: disable redirect and B2C CAPI flags.

Verification:

```bash
node scripts/inspect/generate_code_map.mjs --check
git status --short
```

Commit:

```bash
git add docs/aegis docs/project-knowledge/META_TRACKING_KNOWLEDGE.md
git commit -m "docs: record attribution session architecture decision"
```

## Full Verification Gate

Run after all implementation tasks:

```bash
npm --prefix apps/server test -- \
  src/modules/Attribution/attributionSession.service.test.ts \
  src/modules/Attribution/trackingRedirect.routes.test.ts \
  src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts \
  src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts \
  src/modules/Communication/telegram/core/leadService.test.ts \
  src/routes/miniAppLeadHandoff.routes.test.ts \
  src/routes/miniappTrackingEvents.web.test.ts \
  src/services/miniapp.service.test.ts \
  src/services/requestContract.service.test.ts \
  src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts \
  src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts \
  src/modules/Integrations/meta/metaCapi.service.test.ts
npm --prefix apps/server run build
node scripts/inspect/generate_code_map.mjs --check
```

Production-adjacent smoke only after explicit approval:

```bash
curl -I "http://127.0.0.1:3002/r/bot?destination=b2c_bot_sandbox&utm_source=meta&utm_campaign=qa&fbclid=QAfbclid123"
curl -fsS http://127.0.0.1:3002/health
```

## Risks

- Open redirect risk if destination allowlist is weak.
- Low EMQ if phone/fbc/fbp/IP/UA are not enough and email remains unavailable.
- Consent/LDU ambiguity if CAPI fires when Pixel/MiniApp consent is denied.
- Retry/idempotency churn if logs are not modeled separately from delivery idempotency.
- `routeMessage.ts` complexity creep if attribution parsing becomes more than small glue.
- SalesDrive status mapping can accidentally send revenue events before value/currency rules are approved.

## Rollback Surface

- Set `ATTRIBUTION_REDIRECT_ENABLED=false`.
- Set `META_B2C_BOT_CAPI_ENABLED=false`.
- Leave additive migration in place.
- Stop using `/r/bot` URLs in ads.
- Keep MiniApp tracking unchanged.
- Existing Telegram `/start` aliases continue to work.

## Retirement

Keep for now:

- `payload.tracking` in MiniApp flows.
- SalesDrive comment context.
- Generic `META_PIXEL` telemetry lane.

Schedule for later review:

- Legacy `apps/server/src/modules/Integrations/meta/meta.service.ts`.
- Legacy `apps/server/src/modules/Integrations/meta.service.ts`.
- Any admin UI that treats raw `payloadMeta` as safe for display.

Retirement trigger:

- After `/r/bot` bridge, CRM stage sends, and Meta Test Events verification are stable, mark legacy generic Meta senders as deprecated or route all CAPI sends through `MetaCapiService`.

## Execution Choice

Recommended execution mode:

1. Implement Tasks 1-3 first: schema, attribution service, redirect route.
2. Stop and run tests/build.
3. Implement Tasks 4-7: Telegram/lead/request/SalesDrive join.
4. Stop and run tests/build.
5. Implement Task 8: Meta sender hardening.
6. Stop and run full test gate.
7. Implement Task 9-10: debug visibility and docs/ADR.

This should not be implemented as one giant patch. The bridge and sender hardening touch enough core surfaces that smaller commits are cheaper to review and safer to roll back.
