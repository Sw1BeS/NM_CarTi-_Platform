# Telegram Bots + MiniApp Recheck Audit (2026-02-23)

## Scope
- Runtime truth recheck after prior stabilization rollout.
- Focus: Telegram bots delivery/setup integrity, B2B routing determinism, Inbox identity quality, MiniApp UX quality.

## Runtime Snapshot
- Repo HEAD: `9884824` (`main`).
- Running API `BUILD_SHA`: `98848246f1f2e61be80f400036c2eea5dad74e76`.
- API health reports same build SHA: `http://127.0.0.1:3002/health`.
- Active containers: `infra2-api-1`, `infra2-web-1`, `infra2-db-1` (healthy).
- Deployed web index asset hash (local/prod): `assets/index-DkXMvn6W.js`.
- Local development build artifact hash (`apps/web/dist/index.html`): `assets/index-axrUTZOd.js` (different local artifact, not deployed).

## Expected vs Fact
| Area | Expected | Fact | Status |
|---|---|---|---|
| Webhook contract | `POST /api/telegram/webhook/:botId`, secret header, required updates configured | Contract path/header present in code; bots currently run with `deliveryMode=POLLING`, `getWebhookInfo.url` empty, `allowed_updates` empty in live Bot API response | ⚠️ P1 |
| Canonical bot chats | Verified chat IDs for both bots | DB values match live `getChat` (`CLIENT_LEAD`: `-1003662808163/-1003785260526`, `B2B`: `-1003818257920/-1003702407477`) | ✅ |
| Menu button | `web_app` menu button for each bot | Live `getChatMenuButton` returns `type=web_app` with MiniApp URLs for both bots | ✅ |
| B2B routing mode | Single deterministic flow-first mode (no dual runtime branches) | Env-gated legacy fallback branch still in runtime | ❌ P0 |
| Contact privacy | No seller contacts in channel/partner group/requester surfaces | Redaction exists in places, but queue notifications still pass `includeContact: true` payload to partner/central queues | ⚠️ P0 |
| Inbox identity | TG identity visible and complete | `telegramUserId`/`telegramUsername` present, but `telegramName` empty in recent leads (4/4 in last 14 days) | ❌ P0 |
| MiniApp UX polish | No raw artifacts (`alert`, mock blocks, debug logs), consistent back/scroll/premium UI | `alert()`, `console.*`, and mock activity block still present | ❌ P0 |

## Evidence (file references)
- B2B dual-mode env branch:
  - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:1228`
  - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:1282`
  - `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts:55`
  - `apps/server/src/modules/Communication/bots/scenario-engine/runtime/update-handler.ts:81`
- Legacy env still declared:
  - `apps/server/src/config/env.ts:29`
  - `apps/server/src/config/env.ts:49`
- MiniApp raw UX artifacts:
  - `apps/web/src/pages/public/MiniApp.tsx:399`
  - `apps/web/src/pages/public/MiniApp.tsx:1358`
  - `apps/web/src/pages/public/MiniApp.tsx:1509`
  - `apps/web/src/pages/public/DealerPortal.tsx:94`
  - `apps/web/src/pages/public/DealerPortal.tsx:201`
- Contact-bearing notifications path:
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/dealer-flow.actions.ts:379`
  - `apps/server/src/modules/Communication/bots/scenario-engine/actions/dealer-flow.actions.ts:402`
- Lead identity mapping present but name quality gap visible in data:
  - `apps/server/src/services/dto.ts:171`
  - `apps/server/src/routes/legacyMessaging.routes.ts:186`

## Data Extracts (runtime truth)
### Enabled bots
- `cmlz1iy8500x9swgppukznbui` (`CLIENT_LEAD`) `deliveryMode=POLLING`
- `cmlz1n2rk00xjswgpclqbh9hx` (`B2B`) `deliveryMode=POLLING`

### Telegram live checks
- `getMe`: OK for both bots (`@Cartie_Client_Bot`, `@CarDealer_Lviv_Bot`).
- `getChat(channelId/adminChatId)`: IDs and chat types consistent with DB.
- `getChatMenuButton`: web_app configured for both bots.
- `getWebhookInfo`: URL empty for both bots (polling mode), required `allowed_updates` not present in live webhook config.

### Lead identity quality (last 14 days)
- Total recent leads: `4`
- Missing `telegramUserId`: `0` (0%)
- Missing `telegramUsername`: `0` (0%)
- Missing `telegramName`: `4` (100%)

## P0 / P1 Findings
### P0
1. B2B runtime still supports dual paths via `TELEGRAM_B2B_LEGACY_FALLBACK`.
2. Contact privacy policy is not hardened with a single explicit routing contract for all queue surfaces.
3. MiniApp still has raw UX artifacts (`alert`, mock data, debug logs).
4. Historical/new lead identity still misses `telegramName` in DB payload in observed sample.

### P1
1. Live delivery mode and webhook configuration are inconsistent with strict webhook-first operational expectations.
2. Deploy gates do not yet enforce Telegram live integrity checks as hard blockers.

## Migration / Backfill Needs
1. Identity backfill for `Lead.payload.telegramName`:
   - Source priority: existing payload name > `@telegramUsername` > `clientName` (without creating duplicates).
2. No schema migration required for this recheck scope.

## Recommended Next Actions
1. Harden deploy gates with mandatory Telegram live verification and post-migrate sync scripts.
2. Remove B2B legacy dual-mode runtime branch.
3. Enforce redaction contract in routing/renderer with unit coverage.
4. Run idempotent identity backfill and verify Inbox/Leads rendering with real data.
5. Complete MiniApp wave 1 + wave 2 refactor from this release plan.
