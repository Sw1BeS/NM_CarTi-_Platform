# Telegram Bots + MiniApp Audit (2026-02-23)

## Scope
- Server: `apps/server`
- Web: `apps/web`
- Runtime/DB/Bot API: проверка live-конфигурации (без изменения данных)

## Environment
- Repo root: `/srv/cartie`
- Monorepo: `apps/server`, `apps/web`
- Webhook endpoint contract присутствует: `POST /api/telegram/webhook/:botId` (`apps/server/src/modules/Communication/telegram/core/telegram.routes.ts:17`)
- Secret header check: `X-Telegram-Bot-Api-Secret-Token` (`apps/server/src/modules/Communication/telegram/core/telegram.routes.ts:19`, `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts:28`)
- `allowed_updates` включает требуемые типы (`apps/server/src/modules/Communication/telegram/core/telegramAdmin.service.ts:33`)

## Live Bot/API Verification
- Active bots in DB:
  - `Cartie Client Bot` (`CLIENT_LEAD`) id `cmlz1iy8500x9swgppukznbui`
  - `B2B` (`B2B`) id `cmlz1n2rk00xjswgpclqbh9hx`
- Both bots currently in polling (`deliveryMode=POLLING`)
- Webhook URL empty (`getWebhookInfo.url = ""`) for both bots

### Verified chat IDs for migration
- `CLIENT_LEAD`
  - `channelId = -1003662808163` (channel `CARTIE_CHANNEL`)
  - `adminChatId = -1003785260526` (supergroup `CARTIE_GROUP`)
- `B2B`
  - `channelId = -1003818257920` (channel `CarDealer Lviv`)
  - `adminChatId = -1003702407477` (supergroup `CarDealer Lviv`)
- Central queue chat
  - `-1003785260526` via relay bot `cmlz1iy8500x9swgppukznbui` (`@Cartie_Client_Bot`)

## Legacy IDs mismatch (input vs validated)
| Source | Legacy/Input | Validated Bot API dialog id | Result |
|---|---:|---:|---|
| Client channel | `3662808163` | `-1003662808163` | convertible MTProto/raw -> dialog id |
| Client admin group | `5097128570` / DB had `8373865923` | `-1003785260526` | legacy and DB values mismatched current real admin group |
| B2B channel | `3818257920` | `-1003818257920` | convertible MTProto/raw -> dialog id |
| B2B admin group | `5286062875` | `-1003702407477` | provided raw id does not resolve as active admin group |

## Expectation vs Fact
| Area | Expectation | Fact | Evidence |
|---|---|---|---|
| Group `/start` keyboard | Buttons visible in groups | Reply keyboard sent without chat type branching; group UX unreliable | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:129`, `apps/server/src/modules/Communication/bots/scenario-engine/adapters/telegram.adapter.ts:41` |
| Webhook contract | Fixed endpoint + secret + allowed updates | Contract implemented and correct | `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts:17`, `apps/server/src/modules/Communication/telegram/core/telegramAdmin.service.ts:33` |
| Identity in Inbox/messages | tg id/username/name visible | Backend has fields, UI/types underused | `apps/server/src/routes/legacyMessaging.routes.ts:171`, `apps/web/src/types/bot.types.ts:174`, `apps/web/src/pages/app/Inbox.tsx:828` |
| B2B contact privacy | No contacts in channel/public group | Channel/requester redaction partly present; admin gets contacts | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:214`, `apps/server/src/modules/Communication/bots/scenario-engine/actions/dealer-flow.actions.ts:340` |
| B2B tenant routing | Partner groups only their events + central sees all | No explicit partner->adminGroup map; mostly single adminChat route | `apps/server/prisma/schema.prisma:878`, `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:1679` |
| Whitelist onboarding | Unauthorized request -> approve/reject flow | Request creation exists, approve/reject callback flow missing | `apps/server/src/services/b2bWhitelist.service.ts:35`, `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts:90` |
| MiniApp navigation | Stable scroll + back in all sections + TG BackButton | No TG BackButton integration, no viewport CSS var strategy, inconsistent local back | `apps/web/src/pages/public/MiniApp.tsx:127`, `apps/web/src/pages/public/MiniApp.tsx:1099`, `apps/web/src/pages/public/MiniApp.tsx:1530` |
| Channel post URL generation | Works for normalized IDs and legacy raw IDs | Logic assumes `-100...` already normalized | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:1601`, `apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts:142` |

## P0/P1 Issues

### P0
1. Wrong/legacy chat IDs in `BotConfig` break routing and admin queue targeting.
   - Affects `channelId/adminChatId` and any dependent URL generation.
2. Group keyboard strategy incorrect (reply keyboard used in groups).
   - Required fix: deterministic private vs group/supergroup strategy with inline buttons.
3. B2B multi-tenant routing incomplete (no explicit `PartnerCompany ↔ adminGroupChatId`).
4. Whitelist flow incomplete (no actionable approve/reject path from access request card).
5. MiniApp scroll/back issues inside Telegram WebApp.

### P1
1. Inbox identity regression at UI/type level (`username`, `firstName`, etc. not reliably surfaced).
2. Lead DTO misses `telegramUserId`/`telegramName` output despite payload storage.
3. `channelPostUrl` builder should be centralized and robust to normalized/non-normalized IDs.
4. Support escalation message in client flow uses default chat (missing explicit admin target) in one path.
   - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:309`

## Root Causes (with code pointers)
1. Chat ID normalization absent as shared utility
   - no centralized conversion; scattered `replace('-100', '')` assumptions in:
     - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:1601`
     - `apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts:142`
2. Keyboard strategy not tied to `chat.type`
   - context currently stores `chatId/userId`, not typed chat metadata:
     - `apps/server/src/modules/Communication/telegram/core/types.ts:18`
     - `apps/server/src/modules/Communication/telegram/scenarios/middlewares/enrichContext.ts:68`
3. B2B routing coupled to single bot-level admin chat
   - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:1679`
   - `apps/server/src/modules/Communication/bots/scenario-engine/actions/b2b.actions.ts:9`
4. Whitelist lifecycle incomplete
   - request creation exists (`apps/server/src/services/b2bWhitelist.service.ts:51`), but no approve/reject handlers.
5. MiniApp navigation/viewport not integrated with Telegram BackButton and viewport stable height APIs
   - `apps/web/src/pages/public/MiniApp.tsx:127`

## Data Migration Required
1. Normalize `BotConfig.channelId/adminChatId` to Bot API dialog ids (string values):
   - `CLIENT_LEAD`: `channelId=-1003662808163`, `adminChatId=-1003785260526`
   - `B2B`: `channelId=-1003818257920`, `adminChatId=-1003702407477`
2. Recompute existing `B2bRequest.channelPostUrl` and `ChannelPost.payload.channelPostUrl` for affected channel IDs.
3. Schema change:
   - add `PartnerCompany.adminGroupChatId String?` + index
4. Optional backfill:
   - map known partner companies to their admin group chat where identifiable from existing routing/events.

## Non-negotiable Constraints Compliance Check
- Webhook contract path/header/allowed_updates: ✅ already compliant
- Store Telegram IDs as string: ✅ schema uses `String`
- No contacts in B2B channel/public group: ⚠ partially compliant, must keep hard guard in all new routes
- No bot proliferation / no per-surface inventories: ✅ maintain existing architecture
