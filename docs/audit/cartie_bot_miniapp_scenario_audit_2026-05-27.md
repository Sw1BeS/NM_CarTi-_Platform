# Cartie Bot/MiniApp Scenario Audit - 2026-05-27

Scope: `/srv/cartie`, production stack `infra2`, Telegram bots, MiniApp flows, scenario/template routing, and Meta tracking carriers.
Mode: read-mostly audit. No Telegram messages, no Meta events, and no fake production PII events were sent.

## Skills Installed Or Created

Existing project skills used:

- `cartie-live-miniapp-triage`
- `cartie-meta-capi-tracking`
- `aegis:systematic-debugging`
- `aegis:verification-before-completion`
- `praxis:subagents`

Installed from curated OpenAI skills:

- `security-best-practices`
- `security-threat-model`
- `security-ownership-map`

Created local Cartie skills:

- `/root/.codex/skills/cartie-project-knowledge-intake/SKILL.md`
- `/root/.codex/skills/cartie-bot-miniapp-scenario-audit/SKILL.md`

Codex restart is needed for newly installed skills to appear in future session skill discovery.

## Knowledge Base Read

Primary KB and rule files:

- `README.md`
- `docs/code-map/TELEGRAM_MINIAPP_MAP.md`
- `docs/project-knowledge/PRODUCT_KNOWLEDGE.md`
- `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md`
- `docs/project-knowledge/OPERATIONS_KNOWLEDGE.md`
- `.agent/rules/10_CHANGE_PROTOCOL.md`
- `.agent/rules/30_TELEGRAM_BOTAPI_MODULE.md`
- `.agent/rules/35_TELEGRAM_LEADS_IDENTITY.md`

Current source of truth is code, Prisma schema, live runtime, and DB SELECT evidence. Top-level legacy audit docs are useful checklists, not implementation truth.

## Runtime Evidence

Commands run:

```bash
docker compose --env-file /srv/cartie/infra/.env -f /srv/cartie/infra/docker-compose.cartie2.prod.yml ps
curl -fsS http://127.0.0.1:3002/health
docker inspect infra2-api-1 --format '{{range .Config.Env}}{{println .}}{{end}}' | rg '^(BUILD_SHA|META_CAPI_ENABLED|META_B2C_BOT_CAPI_ENABLED|META_B2C_BOT_TEST_MODE)='
```

Observed:

- `infra2-api-1`, `infra2-db-1`, `infra2-web-1` are healthy.
- API health build SHA: `c2635f30c6cc`.
- `/BUILD_SHA` endpoint returned `404`; use `/health.build.buildSha` as current runtime source.
- Meta flags:
  - `META_CAPI_ENABLED=true`
  - `META_B2C_BOT_CAPI_ENABLED=true`
  - `META_B2C_BOT_TEST_MODE=false`
- Active bots from health: 2.

## Live Bot Inventory

Active DB bots:

| Bot | Template | Delivery | Slug | Surface |
| --- | --- | --- | --- | --- |
| Cartie Client Bot | `CLIENT_LEAD` | `POLLING` | `cartie` | `LEAD` |
| B2B | `B2B` | `POLLING` | `cardealer_lviv_bot` | `B2B` |

Scenario inventory:

- Cartie Client Bot: 6 active scoped scenarios: `buy`, `info`, `lang`, `sell`, `status`, `support`.
- B2B: 7 active scoped scenarios: `help`, `inventory_add`, `inventory_my`, `inventory_price`, `inventory_sold`, `offer`, `request`.
- Global/unscoped: 11 active scenarios.

Session snapshot:

- `Cartie Client Bot`: mostly `CL_MENU`, with 2 old `CL_MINIAPP_CONTACT` sessions.
- `B2B`: sessions across `START`, `B2B_UNREG`, `B2B_REG_COMPANY`, `B2B_MENU`.

MiniApp public smokes:

- `/api/miniapp/config?slug=cartie` returns `ok=true`, template `CLIENT_LEAD`, build `c2635f30c6cc`.
- `/api/miniapp/config?slug=cardealer_lviv_bot` returns `ok=true`, template `B2B`, build `c2635f30c6cc`.
- `cartie` inventory status `AVAILABLE` returned 14 items.
- `cardealer_lviv_bot` inventory returned 20 items.

## Flow Map

1. Telegram updates enter through polling or `POST /api/telegram/webhook/:botId`.
2. Webhook path validates `X-Telegram-Bot-Api-Secret-Token` before returning 200 and processing async.
3. Pipeline order is `resolveBotTenant -> dedup -> enrichContext -> normalize -> saveMessage -> routeMyChatMember -> routeChatJoinRequest -> routeUpdate -> emitEvent`.
4. `routeUpdate` dispatches `inline_query`, `callback_query`, `web_app_data`, `message`, and `channel_post`.
5. `CLIENT_LEAD` `/start` uses `buildClientLeadMiniAppKeyboard()`, which intentionally emits canonical `/p/app/{slug}` web_app URLs with no section query params.
6. MiniApp frontend reads Telegram launch context and blocks writes when `initData` is missing.
7. B2C lead submit goes through `POST /api/miniapp/lead-intents`, creates a pending intent, then finalizes after Telegram contact share.
8. `POST /api/miniapp/requests` is now B2B-only for write actions; non-B2B lead writes are rejected there.
9. Meta Pixel/CAPI events are emitted from MiniApp telemetry and finalized lead/contact stages. New event-source URL sanitization strips Telegram WebApp URL fragments/params before Meta logs.

## Findings

### P1 - `initData` Is Used In GET Query Strings

Evidence:

- Frontend builds authenticated read URLs with `initData` query params in `apps/web/src/services/miniappApi.ts`.
- Backend reads `req.query.initData` for:
  - `/miniapp/b2b/me`
  - `/miniapp/b2b/requests/my`
  - `/miniapp/b2b/requests/active`
  - `/miniapp/b2b/variants/received`
  - `/miniapp/b2b/admin/fit-queue`
  - `/miniapp/requests/my`
  - `/miniapp/requests/status`

Impact: Telegram `initData` is bearer auth material. Putting it in URLs can leak it through logs, browser history, reverse proxies, and referrers.

Recommended fix: move authenticated reads to POST body or a dedicated non-logged header, keep existing HMAC validation, and add `Cache-Control: no-store` on signed MiniApp responses.

### P1 - Public Preview Events Can Send Meta CAPI With Caller-Supplied Carriers

Evidence:

- `/api/miniapp/events` permits read-only preview events without `initData` when `visitorId` is present.
- Same route can map events to Meta CAPI when `META_CAPI_ENABLED=true`, forwarding caller-supplied `fbp`, `fbc`, `eventSourceUrl`, and action source, plus request IP/UA.

Impact: anyone with a public slug can pollute Meta Pixel/CAPI telemetry for allowed preview event types. This is not account takeover, but it is tracking-quality and attribution poisoning.

Recommended fix: require verified `initData` for outbound Meta sends, or keep unauthenticated preview events internal-only. If public CAPI is intentionally kept, enforce first-party origin/host checks, rate limits, and reject arbitrary carrier fields.

### P1 - Historical Request Payloads Contain Telegram WebApp Data In `tracking.eventSourceUrl`

Evidence from DB SELECT:

- `B2bRequest` rows with event URL: 24.
- Rows where event URL contains `tgWebAppData`: 24.
- Date range: `2026-05-19 11:59:24 UTC` through `2026-05-27 11:22:37 UTC`.
- `IntegrationEventLog` Meta rows checked: 0 `tgWebAppData` hits.

Impact: new Meta sends are sanitized, but historical DB payloads still hold Telegram-signed launch data in request payloads. That is PII/auth-like material at rest.

Recommended fix: write and review a one-off DB cleanup migration/script that sanitizes `payload.tracking.eventSourceUrl` and `event_source_url` in `B2bRequest`, preserving only safe URL path and non-sensitive marketing params. Back up first.

### P2 - Event Source URL Sanitizers Miss `initData` Param Variants

Evidence:

- Current sanitizers strip `tgWebAppData`, Telegram hash/signature/auth params, and user params.
- They do not strip `initData`, `init_data`, `telegramInitData`, or `telegram_init_data`.

Impact: once URL-query auth exists in the app, copied or propagated URLs can still leak signed init material if these parameter names appear.

Recommended fix: add these variants to both frontend and backend sanitizers, then add tests.

### P2 - MiniApp Event Payload Sanitizer Uses Exact Key Matching

Evidence:

- Sensitive event keys are checked via exact lowercase names.
- Variants such as `full_name`, `phone_raw`, `telegram_user`, and `access_token` are not blocked by the current key set.

Impact: sanitized MiniApp payloads can still persist or reach Meta `custom_data` if a caller uses common snake_case variants.

Recommended fix: normalize keys before matching, or better, use an allowlist for Meta `custom_data`.

### P2 - Bot Delivery Mode Has Two Sources Of Truth

Evidence:

- Prisma has `BotConfig.deliveryMode`.
- Runtime `BotManager` behavior was reported by subagent as reading JSON config delivery mode in bot runtime path.

Impact: changing the DB column alone may not change runtime behavior.

Recommended fix: consolidate delivery-mode resolution into one helper that prefers the typed column and only falls back to JSON for legacy rows. Add a test.

### P3 - Template Scenarios Exist, But Runtime Uses Specialized Handlers

Evidence:

- Presets create scoped scenarios and commands for `CLIENT_LEAD` and `B2B`.
- Runtime routes those template bots mostly through specialized handlers and MiniApp flows.

Impact: admin users can think scenario graph edits drive the main client/B2B flows when they may not. That is product/admin UX drift, not immediate outage.

Recommended fix: document which flows are hardcoded template flows vs scenario-engine flows in the admin UI/codemap.

### P3 - Persisted Menu Config Still Contains Section Query Params

Evidence:

- DB `menuConfig.buttons` for active bots still contains URLs with `entry`, `status`, `type`, and an old `v`.
- Current `/start` reply keyboard for `CLIENT_LEAD` overrides this with canonical URLs.

Impact: current user-facing `/start` flow is fixed, but config remains confusing and can regress if dynamic menu rendering is reused.

Recommended fix: sync persisted menu config to canonical base URLs after the API contract is settled.

## Tracking State

Last 24h DB summary:

- `IntegrationEventLog` rows: 73.
- `META_PIXEL`: 19.
- `META_B2C_BOT`: 4.
- MiniApp internal actions: 12.

Latest verified production B2C CAPI event remains successful:

- integration: `META_B2C_BOT`
- action: `Lead`
- status: `SUCCESS`
- createdAt: `2026-05-27 11:22:37 UTC`
- `events_received=1`
- `testEventCodeUsed=false`
- payload summary user keys included `ph`, `external_id`, `fbp`

Current gap for EMQ: no new fake PII was sent. Real latest B2C CAPI payload has phone, external id, and fbp, but no fbc, email, IP, or UA. MiniApp finalized Pixel events now can carry phone/fbp/IP/UA when present, but historical finalized requests show no IP/UA in request payload because they were created before the latest carrier patch.

## Verification

Safe runtime checks passed:

- compose services healthy
- API `/health` OK
- MiniApp config for both active slugs OK
- inventory reads OK

Targeted test command:

```bash
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public miniAppLeadHandoff.routes.test.ts miniappTrackingEvents.web.test.ts
```

Result: 88 passed, 1 failed.

Failed test:

- `miniAppLeadHandoff.routes.test.ts` - "lists active B2B network requests without exposing requester contacts"

Observed failure: test expects `where.requesterPartnerId = { not: seller_partner_1 }`, while current code uses `requesterPartnerId: { not: null }` plus `NOT: { requesterPartnerId: seller_partner_1 }`. The runtime query is more explicit; the test appears stale unless product intended a different Prisma shape.

## Next Fix Order

1. Stop sending `initData` in query strings for authenticated reads.
2. Gate Meta CAPI sends from `/api/miniapp/events` behind verified `initData`, or disable CAPI for preview events.
3. Extend URL and payload sanitizers with tests.
4. Prepare a backup-first cleanup for historical `B2bRequest.payload.tracking.eventSourceUrl`.
5. Consolidate bot delivery mode source of truth.
6. Update codemap/admin copy for template-vs-scenario ownership.
