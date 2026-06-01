# MiniApp Scenario Audit Remediation And Meta Dataset Plan

Date: 2026-05-28
Status: implemented in `feature/miniapp-audit-remediation`
Source audit: `docs/audit/cartie_bot_miniapp_scenario_audit_2026-05-27.md`
Runtime baseline checked: `2026-05-28T08:55Z`, production build `c2635f30c6cc`
Implementation verification checked: `2026-06-01T08:26Z`

## Execution Result

- Tasks 1-6 were implemented in the isolated worktree `feature/miniapp-audit-remediation`.
- Focused backend regression passed: 14 files, 101 tests.
- Backend TypeScript build and frontend Vite build passed.
- `git diff --check` passed.
- Historical `B2bRequest.payload` cleanup tooling remains dry-run-first; the latest dry-run found 24 candidate rows and 24 sanitizable payloads.
- Meta Dataset smoke QA was run after explicit approval using Dataset ID `1152615213548168`: offline/system_generated `Lead` with test code `TEST54237` returned `events_received=1`, and website `PageView` with test code `TEST29566` returned `events_received=1`.
- No production deploy or cleanup apply was performed by this implementation pass.

## Goal

Close the remaining Bot/MiniApp scenario audit findings without weakening Telegram auth, leaking Telegram `initData`, polluting Meta CAPI, or changing production state without an explicit approval gate.

This plan has two tracks:

1. Code/data remediation for the audit findings.
2. Meta dataset setup and QA delegation checklist.

## Architecture

Keep current ownership boundaries:

- Telegram auth remains owned by `verifyMiniAppInitDataForScope`.
- MiniApp route contracts remain owned by `apps/server/src/routes/miniAppRoutes.ts`, but new helpers should reduce repeated auth/header/no-store logic.
- Frontend MiniApp API transport remains owned by `apps/web/src/services/miniappApi.ts`.
- Meta CAPI delivery remains owned by `apps/server/src/modules/Integrations/meta/metaCapi.service.ts`.
- Historical cleanup is a one-off script with dry-run default and backup gate.
- Bot delivery mode resolution gets one helper so runtime does not disagree with Prisma.

Do not put new attribution or CAPI behavior into Telegram scenario handlers. The existing `modules/Attribution` bridge already owns direct-to-bot attribution.

## Tech Stack

- Node/TypeScript, Express, Prisma/Postgres.
- Vite/React web client.
- Vitest and Supertest for focused regression.
- Production stack `infra2`: `infra2-api-1`, `infra2-db-1`, `infra2-web-1`.

## Baseline/Authority Refs

- `README.md`
- `docs/project-knowledge/PRODUCT_KNOWLEDGE.md`
- `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md`
- `docs/code-map/TELEGRAM_MINIAPP_MAP.md`
- `.agent/rules/10_CHANGE_PROTOCOL.md`
- `.agent/rules/30_TELEGRAM_BOTAPI_MODULE.md`
- `.agent/rules/35_TELEGRAM_LEADS_IDENTITY.md`
- `docs/aegis/plans/2026-05-27-meta-tracking-capi-implementation-plan.md`
- `apps/server/src/routes/miniAppRoutes.ts`
- `apps/web/src/services/miniappApi.ts`
- `apps/web/src/pages/public/miniapp/trackingEvents.ts`
- `apps/server/src/modules/Integrations/meta/metaEventSourceUrl.ts`
- `apps/server/src/modules/Communication/bots/bot.service.ts`
- `apps/server/src/modules/Communication/bots/botDto.ts`
- `apps/server/prisma/schema.prisma`

Official Meta refs used for dataset track:

- Meta Business Help: Conversions API overview, datasets, matching data, and policy constraints.
- Meta Business Tools terms/policy refs for data-sharing constraints.

## Compatibility Boundary

- No Telegram messages, Meta events, SalesDrive writes, DB updates, or deploys without a separate explicit command.
- Existing MiniApp writes must continue requiring verified Telegram `initData`.
- Existing public read-only preview events may remain internal telemetry, but must not send outbound Meta CAPI without verified `initData`.
- Signed MiniApp auth material must not be put into URLs by the web client.
- Server may accept legacy `?initData=` temporarily for compatibility, but only after frontend stops producing it and responses are `Cache-Control: no-store`.
- Historical DB cleanup must be backup-first, dry-run-first, and scoped only to `B2bRequest.payload` URL fields containing Telegram auth-like data.
- `BotConfig.deliveryMode` column is canonical; JSON `config.deliveryMode` is legacy fallback only.
- Dataset QA is external. It needs user-provided access and approval.

## Verification

Current regression baseline:

```bash
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppLeadHandoff.routes.test.ts miniappTrackingEvents.web.test.ts
```

Observed on 2026-05-28:

```text
Test Files  1 failed | 9 passed
Tests       1 failed | 88 passed
```

The failing test is stale against current runtime query shape:

```text
src/routes/miniAppLeadHandoff.routes.test.ts
"lists active B2B network requests without exposing requester contacts"
```

Production read-only checks passed:

```bash
docker compose --env-file /srv/cartie/infra/.env -f /srv/cartie/infra/docker-compose.cartie2.prod.yml ps
curl -fsS http://127.0.0.1:3002/health
curl -fsS http://127.0.0.1:3002/api/miniapp/config?slug=cartie
curl -fsS http://127.0.0.1:3002/api/miniapp/config?slug=cardealer_lviv_bot
```

## Plan Basis

Facts:

- Production is healthy on build `c2635f30c6cc`.
- Runtime Meta flags currently show B2C dataset CAPI enabled, production test mode off, attribution redirect enabled, and dataset ID configured.
- The audit's six implementation fixes are still valid.
- Frontend currently builds several authenticated read URLs with `initData` in query strings.
- Server currently reads `req.query.initData` for B2B and lead read routes.
- `/api/miniapp/events` allows read-only preview events without `initData`; some current tests still expect Meta CAPI for one preview view event.
- URL sanitizers strip `tgWebAppData`, `hash`, `signature`, `auth_date`, `query_id`, and `user`, but not `initData` aliases.
- Event payload sanitizer has a normalized sensitive-key set, but `toMetaCustomData` still uses a smaller exact-key blocklist.
- `BotConfig.deliveryMode` exists in Prisma, while `BotManager` still reads JSON `config.deliveryMode`.
- Persisted `menuConfig.buttons` drift exists, but live `/start` for `CLIENT_LEAD` uses canonical app URLs.

Assumptions:

- Dataset means the Meta Events Manager dataset used by `META_B2C_BOT_DATASET_ID`.
- We should prefer header transport over changing all authenticated reads to POST, because the routes are semantically reads and `apiFetch` already supports headers.
- Keeping temporary server compatibility for query `initData` is safer than a hard cut, but the web client should stop emitting it immediately.

Unknowns:

- Whether current dataset ID `1152615213548168` is the final production asset or a sandbox asset that became production by accident.
- Whether the current B2C access token is long-lived, owned by a system user, and scoped to the right business/dataset.
- Final SalesDrive status mapping for `QualifiedLead`, `Scheduled`, `Won`, and `Purchase`.
- Consent/LDU policy for phone, email, IP/UA, fbp/fbc, and hashed external IDs.

## Plan Pressure Test

- Owner / contract / retirement: proceed. Each finding maps to an existing owner; no new broad subsystem is needed.
- Verification scope: proceed after fixing the stale test assertion and adding focused tests for auth headers, no-store, preview CAPI gating, sanitizers, cleanup dry-run, and delivery-mode helper.
- Task executability: proceed in small PRs; the DB cleanup and dataset QA need separate approval gates.
- Pressure result: proceed.

## Plan-Time Complexity Check

- Target files: `miniAppRoutes.ts`, `miniappApi.ts`, `trackingEvents.ts`, `metaEventSourceUrl.ts`, `bot.service.ts`, `botDto.ts`, Prisma script/test files, docs.
- Existing size / shape signals: `miniAppRoutes.ts` and `MiniApp.tsx` are high-attention large files.
- Owner fit: add small helper functions instead of broad route refactor.
- Add-in-place risk: moderate. Repeated per-route edits can drift if auth/no-store handling is not centralized.
- Better file boundary: add route-local helpers first; extract only if the patch becomes noisy.
- Recommendation: edit-in-place with tiny helpers for Task 1 and Task 2, add new owner helper for delivery mode, add separate cleanup script.

## PR Split

1. Auth transport and stale test correction.
2. Meta preview gating and sanitizer hardening.
3. Historical DB cleanup script, dry-run report, and optional apply gate.
4. Delivery-mode owner fix plus scenario/menu documentation cleanup.
5. Dataset setup and external QA runbook.

## Task 0 - Freeze Baseline Before Edits

Files:

- No code changes.
- Optional artifact: `docs/aegis/work/2026-05-28-miniapp-remediation-baseline.md` if execution starts.

Why:

- The repo is on `main`, audit doc is untracked, and production has live Meta sending enabled. We need a clear before-state before touching anything.

Verification:

```bash
git -C /srv/cartie status --short --untracked-files=normal
docker compose --env-file /srv/cartie/infra/.env -f /srv/cartie/infra/docker-compose.cartie2.prod.yml ps
curl -fsS http://127.0.0.1:3002/health
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppLeadHandoff.routes.test.ts miniappTrackingEvents.web.test.ts
```

Expected:

- `infra2-api-1`, `infra2-db-1`, `infra2-web-1` healthy.
- Health build SHA recorded.
- Existing single stale test failure recorded before code changes.

Commit:

- No commit for read-only baseline.

## Task 1 - Remove initData From Frontend Query Strings

Files:

- Modify `apps/web/src/services/miniappApi.ts`.
- Modify `apps/server/src/routes/miniAppRoutes.ts`.
- Modify `apps/server/src/routes/miniappApi.web.test.ts`.
- Modify `apps/server/src/routes/miniAppLeadHandoff.routes.test.ts`.

Why:

- `initData` is bearer auth material. It should not be in URLs, browser history, reverse proxy logs, referrers, or debug logs.

Impact/Compatibility:

- Frontend stops putting `initData` in query strings.
- Backend accepts `X-Telegram-Init-Data` as canonical.
- Backend keeps legacy `?initData=` reads temporarily for old clients.
- All signed read responses get `Cache-Control: no-store`.

Repair Track:

- Root cause: signed MiniApp reads were implemented as GET query auth.
- Canonical owner: MiniApp API transport helper plus route auth helper.
- Stable repair: send `initData` via header, not URL.

Retirement Track:

- Old fallback: `req.query.initData`.
- Active status: keep for one deploy cycle.
- Deletion trigger: production logs show current web build adoption and no query-auth reads for 7 days.

Implementation shape:

- Add frontend constants/helpers in `miniappApi.ts`:

```ts
export const MINIAPP_INIT_DATA_HEADER = 'X-Telegram-Init-Data';

const miniAppInitHeaders = (initData: string): HeadersInit => ({
  [MINIAPP_INIT_DATA_HEADER]: initData
});
```

- Change read path builders so they never append `initData`:

```ts
buildMiniAppRequestStatusPath({ slug, requestId })
buildMiniAppMyRequestsPath({ slug, limit })
buildMiniAppB2BPartnerPortalPath({ slug })
buildMiniAppB2bMyRequestsPath({ slug })
buildMiniAppB2bActiveRequestsPath({ slug, limit })
buildMiniAppB2bReceivedVariantsPath({ slug })
buildMiniAppB2bAdminFitQueuePath({ slug, status })
```

- Change the read calls to pass headers:

```ts
return await apiFetch(buildMiniAppB2BPartnerPortalPath(params), {
  method: 'GET',
  skipAuth: true,
  headers: miniAppInitHeaders(params.initData)
});
```

- Add backend helpers near `requireInitData`:

```ts
const readMiniAppInitData = (req: any, body?: Record<string, unknown>) =>
  readString(req.get?.('x-telegram-init-data'))
    || readString(body?.initData)
    || readString(req.query?.initData);

const setSignedMiniAppNoStore = (res: any) => {
  res.set('Cache-Control', 'no-store');
};
```

- Replace `readString(req.query.initData)` in signed read routes with `readMiniAppInitData(req)`.
- Call `setSignedMiniAppNoStore(res)` before successful signed read responses and before auth error responses for those same routes.
- Update stale B2B network request assertion to current explicit Prisma shape:

```ts
expect(prismaMock.b2bRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
  where: expect.objectContaining({
    companyId: 'company_1',
    status: { in: ['PUBLISHED', 'COLLECTING_VARIANTS'] },
    requesterPartnerId: { not: null },
    NOT: { requesterPartnerId: 'seller_partner_1' }
  })
}));
```

Verification:

```bash
npm --prefix apps/server test -- miniappApi.web.test.ts miniAppLeadHandoff.routes.test.ts
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppLeadHandoff.routes.test.ts miniappTrackingEvents.web.test.ts
npm --prefix apps/web run build
```

Expected:

- `miniappApi.web.test.ts` asserts query strings do not contain `initData`.
- Route tests verify header-auth reads still work.
- No signed read response is cacheable.

Commit:

```bash
git add apps/web/src/services/miniappApi.ts apps/server/src/routes/miniAppRoutes.ts apps/server/src/routes/miniappApi.web.test.ts apps/server/src/routes/miniAppLeadHandoff.routes.test.ts
git commit -m "fix: move miniapp signed reads off query auth"
```

## Task 2 - Gate Meta CAPI For Public Preview Events

Files:

- Modify `apps/server/src/routes/miniAppRoutes.ts`.
- Modify `apps/server/src/routes/miniAppLeadHandoff.routes.test.ts`.
- Optionally modify `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md`.

Why:

- Public preview events should not be able to send Meta CAPI with caller-supplied `fbp`, `fbc`, `eventSourceUrl`, IP, and UA.

Impact/Compatibility:

- Internal `emitPlatformEvent` still records allowed read-only preview events.
- Outbound Meta CAPI only fires when Telegram `initData` has been verified.
- `res.body.meta.enabled` should be false for preview-only events even when `META_CAPI_ENABLED=true`.

Repair Track:

- Root cause: preview telemetry and outbound CAPI shared the same event route.
- Canonical owner: route-level Meta send gate.
- Stable repair: `metaEnabled = metaEventName && env flag && Boolean(verifiedTelegram?.userId)`.

Retirement Track:

- Old fallback: public preview CAPI sends.
- Active status: retire immediately unless a product owner explicitly wants public CAPI with origin/rate-limit controls.
- Deletion trigger: none; this is the security posture.

Implementation shape:

```ts
const metaEnabled = Boolean(
  metaEventName
    && isEnvFlagEnabled('META_CAPI_ENABLED', false)
    && verifiedTelegram?.userId
);
```

- Keep `externalId` based on `telegram:{id}` only for CAPI sends.
- Do not use `visitor:{visitorId}` for outbound CAPI.
- Update the existing preview `ViewCar` test at lines around `1910` to expect no Meta call.
- Add an explicit test that `META_CAPI_ENABLED=true` plus `visitorId` still yields `meta.enabled=false`.

Verification:

```bash
npm --prefix apps/server test -- miniAppLeadHandoff.routes.test.ts
```

Expected:

- Authenticated `LeadSubmit` and B2B events still call `metaPixelTrackEvent`.
- Preview events never call `metaPixelTrackEvent`.

Commit:

```bash
git add apps/server/src/routes/miniAppRoutes.ts apps/server/src/routes/miniAppLeadHandoff.routes.test.ts docs/project-knowledge/META_TRACKING_KNOWLEDGE.md
git commit -m "fix: gate preview miniapp capi behind telegram auth"
```

## Task 3 - Harden URL And Payload Sanitizers

Files:

- Modify `apps/server/src/modules/Integrations/meta/metaEventSourceUrl.ts`.
- Modify `apps/web/src/pages/public/miniapp/trackingEvents.ts`.
- Modify `apps/server/src/routes/miniAppRoutes.ts`.
- Modify `apps/server/src/routes/miniappTrackingEvents.web.test.ts`.
- Modify `apps/server/src/routes/miniAppLeadHandoff.routes.test.ts`.
- Create `apps/server/src/modules/Integrations/meta/metaEventSourceUrl.test.ts`.

Why:

- Current URL sanitizers miss common `initData` aliases.
- `toMetaCustomData` still has exact-key blocking and can miss snake_case / camelCase variants.

Impact/Compatibility:

- Campaign params like `utm_source`, `utm_campaign`, `fbclid`, `fbp`, `fbc` remain allowed.
- Telegram auth material and raw PII variants are removed before logs, platform events, and Meta custom data.

Repair Track:

- Root cause: sensitive key detection is inconsistent across URL, payload, and Meta custom data paths.
- Canonical owner: shared normalized sensitive-key logic inside each current runtime boundary.
- Stable repair: normalize key names by removing non-alphanumerics and lowercasing before comparison.

Retirement Track:

- Old fallback: exact-key blocklists.
- Active status: replace now.
- Deletion trigger: no fallback needed.

Implementation shape:

- Extend URL param blocklist in both frontend and backend:

```ts
const SENSITIVE_EVENT_SOURCE_PARAMS = [
  'tgWebAppData',
  'tgWebAppThemeParams',
  'tgWebAppVersion',
  'tgWebAppPlatform',
  'hash',
  'signature',
  'auth_date',
  'query_id',
  'user',
  'initData',
  'init_data',
  'telegramInitData',
  'telegram_init_data'
];
```

- Add route-local key normalization:

```ts
const normalizeSensitiveEventKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');
```

- Ensure both `sanitizeMiniAppEventValue` and `toMetaCustomData` use the normalized set.
- Add normalized blocked variants:

```text
phone, phoneRaw, phone_raw, email, name, fullName, full_name, initData,
init_data, telegramInitData, telegram_init_data, rawUser, raw_user,
telegramUser, telegram_user, accessToken, access_token, authorization
```

- Keep non-sensitive business fields:

```text
budgetMax, city, requestType, routeSource, carListingId, requestId, price, source, slug, view
```

Verification:

```bash
npm --prefix apps/server test -- metaEventSourceUrl.test.ts miniappTrackingEvents.web.test.ts miniAppLeadHandoff.routes.test.ts
```

Expected:

- `initData`, `init_data`, `telegramInitData`, `telegram_init_data` are removed from URLs.
- `full_name`, `phone_raw`, `telegram_user`, and `access_token` are absent from platform payloads and Meta `customData`.
- `utm_*`, `fbclid`, `fbp`, and `fbc` remain when safe.

Commit:

```bash
git add apps/server/src/modules/Integrations/meta/metaEventSourceUrl.ts apps/web/src/pages/public/miniapp/trackingEvents.ts apps/server/src/routes/miniAppRoutes.ts apps/server/src/routes/miniappTrackingEvents.web.test.ts apps/server/src/routes/miniAppLeadHandoff.routes.test.ts apps/server/src/modules/Integrations/meta/metaEventSourceUrl.test.ts
git commit -m "fix: harden miniapp tracking sanitizers"
```

## Task 4 - Add Backup-First Historical B2bRequest Cleanup

Files:

- Create `apps/server/src/scripts/sanitize_b2b_request_tracking_event_source_url.helpers.ts`.
- Create `apps/server/src/scripts/sanitize_b2b_request_tracking_event_source_url.helpers.test.ts`.
- Create `apps/server/src/scripts/sanitize_b2b_request_tracking_event_source_url.ts`.
- Modify `apps/server/package.json`.
- Create run artifact after execution only: `docs/aegis/work/2026-05-28-b2b-request-tracking-cleanup-run.md`.

Why:

- Audit found 24 historical `B2bRequest` rows where `payload.tracking.eventSourceUrl` contains `tgWebAppData`.

Impact/Compatibility:

- No schema change.
- Dry-run default.
- Apply mode updates only sanitized URL fields, preserving marketing params and unrelated payload data.

Repair Track:

- Root cause: previous request payloads stored Telegram WebApp URL fragments/params before sanitizer landed.
- Canonical owner: one-off cleanup script plus existing runtime sanitizer.
- Stable repair: sanitize historical payloads, then rely on runtime sanitizer.

Retirement Track:

- Old contaminated data: historical URL fields in `B2bRequest.payload`.
- Active status: remove from DB after backup and review.
- Deletion trigger: dry-run report matches expected rows and user approves `--apply`.

Implementation shape:

- Helper exports:

```ts
export type CleanupCandidate = {
  id: string;
  payload: Record<string, unknown> | null;
};

export type CleanupResult = {
  changed: boolean;
  payload: Record<string, unknown> | null;
  beforeUrls: string[];
  afterUrls: string[];
};

export const sanitizeB2bRequestTrackingPayload = (candidate: CleanupCandidate): CleanupResult => {
  // copy payload
  // sanitize payload.tracking.eventSourceUrl
  // sanitize payload.tracking.event_source_url
  // sanitize payload.tracking.meta.eventSourceUrl
  // sanitize payload.tracking.meta.event_source_url
  // return changed flag and URL previews only
};
```

- Script behavior:

```bash
npm --prefix apps/server run cleanup:b2b-request-tracking-urls -- --dry-run
npm --prefix apps/server run cleanup:b2b-request-tracking-urls -- --apply
```

- Query candidates with raw SQL:

```sql
select id, payload
from "B2bRequest"
where payload::text ilike '%tgWebAppData%'
   or payload::text ilike '%initData%'
   or payload::text ilike '%telegramInitData%';
```

- Before apply, create backup:

```bash
mkdir -p /srv/cartie/_codex_release_backup_20260528_miniapp_tracking_cleanup
docker exec infra2-db-1 pg_dump -U cartie -d cartie_db -Fc -f /tmp/cartie-pre-miniapp-tracking-cleanup.dump
docker cp infra2-db-1:/tmp/cartie-pre-miniapp-tracking-cleanup.dump /srv/cartie/_codex_release_backup_20260528_miniapp_tracking_cleanup/cartie-pre-miniapp-tracking-cleanup.dump
```

Verification:

```bash
npm --prefix apps/server test -- sanitize_b2b_request_tracking_event_source_url.helpers.test.ts metaEventSourceUrl.test.ts
npm --prefix apps/server run cleanup:b2b-request-tracking-urls -- --dry-run
```

Expected:

- Dry-run reports candidate count, changed count, and sanitized URL previews without raw Telegram payloads.
- No DB writes in dry-run.

Apply gate:

- User must explicitly approve the backup file path and `--apply`.

Commit:

```bash
git add apps/server/src/scripts/sanitize_b2b_request_tracking_event_source_url.helpers.ts apps/server/src/scripts/sanitize_b2b_request_tracking_event_source_url.helpers.test.ts apps/server/src/scripts/sanitize_b2b_request_tracking_event_source_url.ts apps/server/package.json
git commit -m "chore: add miniapp tracking url cleanup script"
```

## Task 5 - Consolidate Bot Delivery Mode Source Of Truth

Files:

- Create `apps/server/src/modules/Communication/bots/botDeliveryMode.ts`.
- Create `apps/server/src/modules/Communication/bots/botDeliveryMode.test.ts`.
- Modify `apps/server/src/modules/Communication/bots/bot.service.ts`.
- Modify `apps/server/src/modules/Communication/bots/botDto.ts`.

Why:

- Prisma has `BotConfig.deliveryMode`, but runtime starts bots from JSON `config.deliveryMode`.

Impact/Compatibility:

- Column wins.
- JSON fallback remains for legacy rows.
- `BotInstance` still receives lowercase `'polling' | 'webhook'`.

Repair Track:

- Root cause: typed schema field was added without retiring JSON config ownership.
- Canonical owner: `BotConfig.deliveryMode`.
- Stable repair: one helper converts column enum or legacy JSON to runtime mode.

Retirement Track:

- Old owner: `config.deliveryMode`.
- Active status: fallback only.
- Deletion trigger: DB audit confirms all active bots have typed `deliveryMode` set correctly and API no longer writes JSON-only delivery mode.

Implementation shape:

```ts
export type RuntimeBotDeliveryMode = 'polling' | 'webhook';

export const resolveRuntimeBotDeliveryMode = (bot: {
  deliveryMode?: unknown;
  config?: unknown;
}): RuntimeBotDeliveryMode => {
  const column = String(bot.deliveryMode || '').toUpperCase();
  if (column === 'WEBHOOK') return 'webhook';
  if (column === 'POLLING') return 'polling';

  const legacy = typeof bot.config === 'object' && bot.config
    ? String((bot.config as any).deliveryMode || '').toLowerCase()
    : '';
  return legacy === 'webhook' ? 'webhook' : 'polling';
};
```

- `BotManager.startBot` uses the helper.
- `mapBotInput` writes `data.deliveryMode = 'WEBHOOK' | 'POLLING'` when delivery mode is present, while keeping legacy config only if current admin UI still expects it.
- `mapBotOutput` reports typed column first.

Verification:

```bash
npm --prefix apps/server test -- botDeliveryMode.test.ts
npm --prefix apps/server run build -- --pretty false
```

Expected:

- Column `WEBHOOK` starts webhook mode even if JSON says polling.
- Column `POLLING` starts polling mode even if JSON says webhook.
- Missing column falls back to legacy JSON.

Commit:

```bash
git add apps/server/src/modules/Communication/bots/botDeliveryMode.ts apps/server/src/modules/Communication/bots/botDeliveryMode.test.ts apps/server/src/modules/Communication/bots/bot.service.ts apps/server/src/modules/Communication/bots/botDto.ts
git commit -m "fix: use typed bot delivery mode at runtime"
```

## Task 6 - Document Scenario Ownership And Menu Config Drift

Files:

- Modify `docs/code-map/TELEGRAM_MINIAPP_MAP.md`.
- Modify `README.md`.
- Optionally modify admin UI copy where bot scenarios/templates are displayed after locating the exact owner.
- Review existing `apps/server/src/scripts/repair_miniapp_menu_config.helpers.ts`.

Why:

- Template scenarios exist, but core `CLIENT_LEAD` and `B2B` paths mostly run through specialized handlers.
- README still describes reply keyboard section query params, while current code intentionally uses canonical app URLs.
- Persisted menu config can regress if reused dynamically.

Impact/Compatibility:

- Documentation only unless menu repair apply is separately approved.
- Prevents admins/operators from thinking scenario graph edits control all specialized template flows.

Repair Track:

- Root cause: docs/config drift after MiniApp auth hardening.
- Canonical owner: code map plus README contract.
- Stable repair: document specialized handler ownership and current canonical menu URL policy.

Retirement Track:

- Old docs: query-param menu contract in README.
- Active status: replace.
- Deletion trigger: none.

Implementation shape:

- In `README.md`, replace the MiniApp Navigation Contract with:

```text
Runtime persistent reply-keyboard web_app buttons for CLIENT_LEAD must use canonical /p/app/{slug} URLs without entry/status/type params. Section state is resolved inside the MiniApp after Telegram launch context is available.
```

- In `TELEGRAM_MINIAPP_MAP.md`, add:

```text
Scenario presets seed admin-visible commands/scenarios, but CLIENT_LEAD and B2B critical flows are owned by specialized Telegram/MiniApp handlers. Treat scenario graph edits as admin/template behavior unless a route explicitly delegates to the scenario engine.
```

- If menu config repair is approved later:

```bash
npm --prefix apps/server run repair:miniapp-menu-config -- --dry-run
npm --prefix apps/server run repair:miniapp-menu-config -- --apply
```

Verification:

```bash
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts repair_miniapp_menu_config.helpers.test.ts
```

Commit:

```bash
git add README.md docs/code-map/TELEGRAM_MINIAPP_MAP.md
git commit -m "docs: clarify miniapp scenario and menu ownership"
```

## Task 7 - Meta Dataset Setup And QA Delegation

Files:

- No code changes by default.
- If setup is approved, update only deployment env/runbook artifacts:
  - `.env` or server secret store, with no token committed.
  - `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md`.
  - `docs/aegis/work/2026-05-28-meta-dataset-qa-run.md`.

Why:

- Code can send CAPI, but Events Manager asset ownership, dataset access, token health, test events, and campaign destination setup are external truth.

Current runtime state:

```text
META_CAPI_ENABLED=true
META_B2C_BOT_CAPI_ENABLED=true
META_B2C_BOT_DATASET_ID=1152615213548168
META_B2C_BOT_ACCESS_TOKEN=set
META_B2C_BOT_TEST_EVENT_CODE=TEST46105
META_B2C_BOT_TEST_MODE=false
ATTRIBUTION_REDIRECT_ENABLED=true
ATTRIBUTION_DEFAULT_DESTINATION=b2c_bot_sandbox
ATTRIBUTION_BOT_ALLOWLIST=b2c_bot_sandbox:cartie_client_bot
```

What I need from the user to fully own this task:

1. Meta Business access:
   - Business Manager ID/name.
   - Admin or developer access to Events Manager for the Cartie dataset/pixel.
   - Confirmation that dataset `1152615213548168` is the intended production dataset, or the correct dataset ID.
   - Confirmation which ad account(s) should be connected to this dataset.

2. Token path:
   - Permission to generate or rotate a system-user access token, or confirmation that the current server token is final.
   - Token delivery via a secure path, not pasted into Git or docs.
   - Confirmation whether token should be long-lived and owned by a Business Manager system user.

3. Test Events:
   - Fresh `test_event_code` from Meta Events Manager.
   - Explicit permission to send outbound Meta test events.
   - Choice of QA data: synthetic non-customer identifiers, or an approved real test lead.

4. Data policy:
   - Which identifiers are allowed: phone, email, IP, user agent, fbp, fbc, hashed Telegram external ID.
   - Whether Limited Data Use or regional restrictions apply.
   - Whether email capture should be added later to improve EMQ.

5. SalesDrive mapping:
   - Status ID/name mapping for `Contacted`, `QualifiedLead`, `Scheduled`, `Won`, and `Purchase`.
   - One controlled SalesDrive order/lead for QA, or permission to create one.
   - Whether `Purchase`/`Won` is allowed now; current runtime has `META_B2C_BOT_PURCHASE_ENABLED=false`.

6. Campaign destination:
   - Final ad destination format.
   - Whether Meta ads should point to `/r/bot?...` instead of raw `t.me`.
   - UTM naming convention and destination key naming.

7. Success criteria:
   - Minimum acceptable Events Manager state: event received, no diagnostics, dataset connected to ad account.
   - Whether EMQ should be optimized now or only observed.
   - Go/no-go rule for turning test mode off after QA.

Dataset setup execution outline after access is granted:

1. Verify Events Manager dataset ownership and connected assets.
2. Confirm/generate CAPI token.
3. Confirm server env has correct dataset ID/token without printing secrets.
4. Temporarily enable test mode only if QA requires it:

```bash
META_B2C_BOT_TEST_MODE=true
META_B2C_BOT_TEST_EVENT_CODE=<fresh code>
```

5. Send one controlled test event through the existing service path.
6. Verify in Meta Test Events UI.
7. Verify local `IntegrationEventLog` summary only:

```sql
select integration, action, status, createdAt, meta
from "IntegrationEventLog"
where integration in ('META_B2C_BOT', 'META_PIXEL')
order by "createdAt" desc
limit 10;
```

8. Confirm logs contain no raw phone/email/token/Telegram launch payload.
9. Return production mode to the approved state.
10. Save a QA run artifact with timestamps, event IDs, and redacted screenshots/notes.

Verification:

```bash
docker inspect infra2-api-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | awk -F= '/^(META_|ATTRIBUTION_)/ { key=$1; val=substr($0, length($1)+2); if (key ~ /(TOKEN|SECRET|KEY)/) { status=(val==""?"empty":"set"); print key"="status } else { print key"="val } }' | sort
curl -fsS http://127.0.0.1:3002/health
```

External verification:

- Meta Events Manager Test Events shows the event.
- Dataset diagnostics show no auth/data-format error.
- `IntegrationEventLog.meta` stores summaries, not raw PII.

Commit:

- No secret commits.
- Docs-only commit after QA:

```bash
git add docs/project-knowledge/META_TRACKING_KNOWLEDGE.md docs/aegis/work/2026-05-28-meta-dataset-qa-run.md
git commit -m "docs: record meta dataset qa state"
```

## Final Rollout Gate

Before deploy:

```bash
git diff --check
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppLeadHandoff.routes.test.ts miniappTrackingEvents.web.test.ts metaEventSourceUrl.test.ts botDeliveryMode.test.ts sanitize_b2b_request_tracking_event_source_url.helpers.test.ts
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
```

After deploy:

```bash
curl -fsS http://127.0.0.1:3002/health
bash infra/prod_verify.sh
LOG_FILE=/srv/cartie/_logs/telegram_live_verify.log bash infra/verify_telegram_live.sh
curl -fsS http://127.0.0.1:3002/api/miniapp/config?slug=cartie
curl -fsS http://127.0.0.1:3002/api/miniapp/config?slug=cardealer_lviv_bot
```

No DB cleanup apply and no Meta outbound QA are part of a deploy unless explicitly approved.

## Risks

- Query-auth fallback can live too long. Put a dated removal note into the completion report.
- Dataset is already live with `META_B2C_BOT_TEST_MODE=false`; bad public preview CAPI should be fixed before new ad traffic.
- Meta UI access can block dataset QA even when code/env are correct.
- Sanitizer expansion can accidentally remove useful business fields if the normalized blocklist is too broad; keep tests for allowed campaign/business keys.
- Historical cleanup script must not rewrite unrelated JSON payloads. Dry-run preview is mandatory.

## Retirement

Retire after successful rollout:

- Frontend `initData` query transport.
- Public preview outbound CAPI behavior.
- Exact-key-only Meta custom data blocking.
- JSON-only bot delivery mode ownership.
- Stale README menu contract.

Keep temporarily:

- Backend query `initData` fallback for one deploy cycle.
- Historical cleanup script as a documented one-off tool, not a scheduled job.
