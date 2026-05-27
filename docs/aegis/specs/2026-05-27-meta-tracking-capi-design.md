# Meta Tracking, CAPI, and Telegram Attribution Design

Date: 2026-05-27
Status: review pending
Scope: research-backed design only. No implementation or outbound production calls.

## TaskIntentDraft

- Outcome: create a durable design for Meta tracking across MiniApp, Telegram bot, SalesDrive CRM stages, and Meta CAPI.
- Goal: improve event correctness and Event Match Quality without fake identifiers, raw PII logs, duplicate sends, or production-side surprises.
- Success evidence: written knowledge base, explicit owner map, approved data flow, QA gates, and implementation plan handoff.
- Stop condition: user reviews this spec and confirms the architecture or asks for changes.
- Non-goals: no code changes, no live Meta/SalesDrive writes, no Ads Manager campaign edits, no broad analytics platform rebuild.
- Main risks: duplicate Meta owners, wrong `action_source`, lost Telegram attribution, PII leakage in `IntegrationEventLog`, retry/idempotency collision.

## BaselineReadSetHint

Read set used:

- `docs/project-knowledge/README.md`
- `docs/project-knowledge/AI_WORKFLOW.md`
- `docs/code-map/INTEGRATIONS_MAP.md`
- `docs/code-map/TELEGRAM_MINIAPP_MAP.md`
- `docs/qa_v7_e2e.md`
- `apps/server/src/modules/Integrations/meta/metaCapi.service.ts`
- `apps/server/src/modules/Integrations/meta/meta.service.ts`
- `apps/server/src/modules/Integrations/meta.service.ts`
- `apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.ts`
- `apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.ts`
- `apps/server/src/modules/Communication/telegram/core/leadService.ts`
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- `apps/server/src/services/requestContract.service.ts`
- `apps/server/src/routes/miniAppRoutes.ts`
- `apps/web/src/pages/public/MiniApp.tsx`
- `apps/web/src/pages/public/miniapp/trackingEvents.ts`
- `apps/server/prisma/schema.prisma`

Authority gaps:

- Fresh Meta Test Events code is not available.
- SalesDrive final status ID mapping is not confirmed beyond current code.
- Consent/email capture policy is not documented.
- Official Meta developer pages were partly inaccessible from this environment; the design uses official URLs, an archived official Swagger schema, Telegram official docs, Google official docs, and local implementation evidence.

## ImpactStatementDraft

Affected layers:

- Public redirect route for ad click capture.
- Persistence for attribution sessions.
- Telegram `/start` parsing and session variables.
- Lead/request payload enrichment.
- SalesDrive sync context.
- SalesDrive webhook CRM-stage mapping.
- Meta CAPI event builder, idempotency, retry, event time, and logging.
- Tests for payload shape, attribution join, redaction, and duplicate behavior.

Compatibility boundaries:

- Existing Telegram start aliases must keep working.
- Existing MiniApp tracking must remain compatible.
- B2B/AdsQuiz/non-B2C flows must not start sending B2C CRM events.
- Legacy generic Meta senders should be retired or isolated, not silently reused for CRM stage events.

## Product Risk Lens

- Value: Meta optimization learns from real CRM stages, not only low-quality lead submits.
- Non-goals: campaign management, creative automation, full consent platform, generic tag manager migration.
- Trade-offs: custom bridge gives control and correct Telegram attribution, but adds a new canonical owner and migration surface.
- Decision needed: approve the redirect bridge as the canonical source for direct-to-Telegram attribution.

## First-Principles Decision Hygiene Review

First-principles invariants:

- Non-negotiable goal: Meta must receive real business events with enough legal matching keys to attribute and optimize correctly.
- Non-negotiable constraints: no fake `lead_id`, no raw PII/token logs, no production sends without approval, no second CRM truth source.
- Historical assumptions to delete: direct Telegram links can carry all ad identifiers; generic website CAPI is interchangeable with CRM Conversion Leads; browser Pixel success proves CRM tracking is correct.

Owner / retirement matrix:

- New canonical owner: `AttributionSession` module for ad-click-to-Telegram handoff.
- Old owner: scattered payload fields in MiniApp/Lead/SalesDrive comments.
- Compat-only carrier: `BotSession.variables`, `Lead.payload`, `B2bRequest.payload`, and SalesDrive comment fields.
- Delete-first / retirement trigger: after attribution sessions are joined into requests, legacy ad identifiers in comments should be treated as copied context, not source of truth.

Falsification matrix:

- Dependency-removal test: if the redirect bridge is disabled, direct Telegram bot tracking must degrade gracefully and mark missing `fbc/fbp/IP/UA`.
- Counterexample scenario: a user opens `/start sell`; existing alias behavior must win over attribution parsing unless the token matches a valid attribution token pattern.
- Must remain correct: duplicate SalesDrive webhook, missing status timestamp, missing phone, expired attribution token, non-B2C request, Meta test mode disabled.

Verdict:

- Adopt with evidence: implement a dedicated attribution owner and keep Meta senders as transport/builders only.
- Blocking gaps: fresh test event code, status mapping, TTL/retention, email/consent policy.
- Next evidence: local tests plus Meta Test Events UI verification before any production send.

## Plan-Time Complexity Check

- Better file boundary: add `apps/server/src/modules/Attribution/` rather than growing `routeMessage.ts`, `leadService.ts`, or `metaCapi.service.ts`.
- Recommendation: add owner file plus small edit-in-place glue in Telegram, lead/request, SalesDrive, and Meta services.

## Options

### Option A: Patch Existing Payloads Only

Add more fields to existing `payload.tracking`, `Lead.payload`, `B2bRequest.payload`, and SalesDrive comments.

Pros:

- Smallest code footprint.
- No new table.

Cons:

- Direct-to-bot still loses `fbclid`, IP, UA, and cookies.
- No TTL or canonical click source.
- Turns comments/payloads into an accidental source of truth.

Verdict: reject for the main B2C direct-to-Telegram problem.

### Option B: First-Party Redirect Bridge With AttributionSession

Create `/r/bot`, store a short-lived attribution session, redirect to Telegram with `start=<short_token>`, then join the token at lead/request creation and CRM webhook sends.

Pros:

- Captures identifiers before Telegram strips browser context.
- Fits official Telegram `start` limit.
- Gives a testable owner and retention boundary.
- Keeps SalesDrive and Meta senders focused on their own jobs.

Cons:

- Adds one model, one route, and cross-flow join glue.
- Requires redirect allowlist and operational monitoring.

Verdict: recommended.

### Option C: External sGTM/CAPI Gateway/Signals Gateway

Route browser events through server-side GTM or a hosted gateway.

Pros:

- Useful for broader website tagging.
- Good transformations and tag governance if marketing owns many tags.

Cons:

- Does not solve Telegram `/start` attribution by itself.
- Does not own SalesDrive stage truth.
- Adds an external runtime and debugging layer.

Verdict: defer. It can complement Option B later, not replace it.

## Recommended Design

### 1. Attribution Owner

Add a canonical attribution service:

- `apps/server/src/modules/Attribution/attributionSession.service.ts`
- `apps/server/src/modules/Attribution/trackingRedirect.routes.ts`
- Prisma model `AttributionSession`

Suggested model shape:

```prisma
model AttributionSession {
  id          String   @id @default(cuid())
  token       String   @unique
  companyId   String?
  botId       String?
  destination String
  source      String?
  query       Json?    @db.JsonB
  identifiers Json?    @db.JsonB
  requestMeta Json?    @db.JsonB
  expiresAt   DateTime
  consumedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([companyId])
  @@index([botId])
  @@index([expiresAt])
}
```

Store in `identifiers`:

- `fbclid`
- generated/preserved `fbc`
- generated/preserved `fbp`
- `client_ip_address`
- `client_user_agent`

Store in `query`:

- UTM fields
- `campaign_token`
- optional Meta ad/campaign/adset/placement query params
- `event_source_url`

Do not store raw email/phone in attribution sessions.

### 2. Redirect Route

`GET /r/bot` behavior:

1. Validate destination/bot against an allowlist.
2. Capture query params, IP, UA, and source URL.
3. Build `fbc` from `fbclid` if present.
4. Build/preserve `fbp` if a first-party cookie exists, else generate one.
5. Create `AttributionSession` with TTL.
6. Set first-party `_fbp`/`_fbc` cookies when appropriate.
7. Redirect to `https://t.me/<bot_username>?start=<short_token>`.

Failure behavior:

- Invalid destination returns a safe 404/400, not an open redirect.
- Missing `fbclid` still creates a session if UTM/campaign context exists.
- Persistence failure should not call Meta; it can either fail closed or redirect without token with a logged warning. Recommended: fail closed during QA, configurable later.

### 3. Telegram Start Handling

Update `/start <payload>` handling:

- Keep existing aliases first or explicitly reserve them.
- If payload matches an attribution token pattern, validate token and store it in `BotSession.variables`.
- Do not consume unknown `/start` payloads as tracking unless `AttributionSession` lookup succeeds.

Suggested session variables:

```json
{
  "attributionToken": "abc123",
  "attributionBoundAt": "2026-05-27T00:00:00.000Z"
}
```

### 4. Lead And Request Join

At lead/request creation:

- Resolve token from `BotSession.variables`, incoming payload, or MiniApp `startParam`.
- Join unexpired `AttributionSession`.
- Copy a sanitized `attribution` object into `Lead.payload` and `B2bRequest.payload`.
- Mark session consumed only after durable lead/request association exists.
- Preserve existing MiniApp tracking behavior.

The copied object is a compatibility snapshot, not the canonical click record.

### 5. SalesDrive Sync And Webhook

SalesDrive request sync should carry enough context to recognize B2C source and external order mapping:

- `cartie_request_id`
- `destination_key`
- `source=b2c_bot`
- safe campaign/UTM context
- SalesDrive order ID persisted into `LeadIdentity`

Webhook stage mapping:

- Use SalesDrive timestamp as Meta `event_time`.
- Send only approved statuses.
- Include hashed phone/email/external ID when available.
- Include `fbc`, `fbp`, IP, UA from attribution snapshot when available.
- Keep value/currency disabled until a revenue rule is approved.

### 6. Meta Sender Changes

B2C CRM sender should support:

- explicit `eventTime` / `event_time`;
- duplicate skip logging;
- retry/upsert behavior that does not collide on `idempotencyKey`;
- sanitized payload summaries only;
- bearer token transport only;
- approved event taxonomy.

Legacy generic senders should be marked deprecated or routed through the canonical service later. They should not be used as proof of B2C CRM correctness.

## QA Plan

Required local tests:

- Meta CAPI B2C payload uses CRM shape and explicit event time.
- `test_event_code` remains top-level and is absent when test mode is off.
- User data hashing and non-hashed fields match rules.
- Duplicate successful event logs `skipped_duplicate` and makes no outbound call.
- Error retry can be logged without unique-key collision.
- `/r/bot` creates an attribution session, sets expected cookies, and redirects to an allowlisted Telegram URL.
- Expired/invalid token does not attach attribution.
- `/start sell|stock|available|catalog|transit|pending` behavior remains unchanged.
- Lead/request creation joins attribution.
- SalesDrive webhook enriches B2C CRM events and skips non-B2C.
- Admin logs contain no raw token, phone, or email.

Manual QA gates:

- Meta Test Events raw curl, then Cartie sender.
- Verify `fbtrace_id` and event ID in UI.
- Verify duplicate behavior in UI/logs.
- Verify SalesDrive webhook fixture before production webhooks.

## Rollback

- Disable `META_B2C_BOT_CAPI_ENABLED`.
- Disable or unmount `/r/bot`.
- Keep migration additive.
- Keep existing Telegram start aliases intact.
- Stop using redirect links in ads.
- Leave existing MiniApp tracking untouched.

## ADR Signal

This design creates a new canonical owner for attribution. If approved and implemented, record an ADR covering:

- why `AttributionSession` owns direct-to-Telegram attribution;
- why SalesDrive comments and payload snapshots are compatibility carriers only;
- retirement trigger for legacy generic Meta senders;
- consent/privacy boundary for identifiers and logs.

## Decision Needed

Approve or change these before implementation planning:

1. Use `/r/bot` plus `AttributionSession` as the canonical direct-to-Telegram bridge.
2. TTL for attribution sessions. Recommended: 30 days for ad click attribution context, with shorter log retention if required.
3. Confirm bot username and redirect allowlist.
4. Confirm SalesDrive status IDs for `Contacted`, `QualifiedLead`, `Scheduled`, `Won/Purchase`.
5. Confirm whether email capture is required now or deferred until EMQ data shows a problem.
6. Confirm consent/LDU policy.

## References

- Knowledge base: `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md`
- Baseline snapshot: `docs/aegis/baseline/2026-05-27-initial-baseline.md`
