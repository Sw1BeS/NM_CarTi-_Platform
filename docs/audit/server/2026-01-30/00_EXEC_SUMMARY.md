# CarTié Server Audit — Executive Summary (Stage-1 Readiness)

**Date:** 2026-01-30  
**Build SHA:** `caf2a1b97bf4f53cc02cfc3f6e3259030df9e00b`  
**Environment:** Production (infra2-api-1, infra2-web-1, infra2-db-1)  
**Auditor Role:** Senior Product + Backend Engineer

---

## 📌 What's SELLABLE Right Now (Stage-1 ✅)

### ✅ Infrastructure (GREEN)
1️⃣ All containers healthy: API (14h uptime), WEB (14h), DB (15h)  
2️⃣ Deployment synced: prod build SHA matches git HEAD (`caf2a1b`)  
3️⃣ Health endpoint: 200 OK (1ms DB latency, 1 active bot, worker running)  
4️⃣ Caddy reverse proxy correct: `/api/*` → api:3001, root → static frontend

### ✅ Telegram Bot API (YELLOW-GREEN)
1️⃣ Webhook contract solid: `/api/telegram/webhook/:botId` + secret validation  
2️⃣ Pipeline architecture clean: dedup → routing → thin route handlers  
3️⃣ Allowed updates complete: message, callback_query, inline_query, channel_post, my_chat_member, web_app_data  
4️⃣ Routes thin: business logic in services (leadService.ts), not in route handlers ✅

### ✅ MTProto Integration (YELLOW)
1️⃣ Channel sync scheduler runs every 15 min: `Found 0 active channel sources` (no sources configured yet)  
2️⃣ Mapping service exists: `mtproto-mapping.service.ts` → creates CarListing with dedup (sourceChatId + sourceMessageId)  
3️⃣ Import by period: API available via `mtproto.service.ts::syncChannel` method

---

## 🔴 What BLOCKS Stage-1 Sale (P0 Issues)

### 🔴 P0-1: Lead Identity Gap (CRITICAL)
**Problem:** All 42 leads in DB missing `telegramName` and `telegramUsername` in payload  
**Impact:** Client cannot identify who contacted them from TG  
**Evidence:**
```sql
SELECT id, clientName, payload::jsonb->'telegramUsername', payload::jsonb->'telegramName' FROM "Lead" LIMIT 10;
-- Result: ALL tg_username and tg_name columns are EMPTY
```
**Root cause:** Code in `leadService.ts` line 693-700 passes telegramUsername/telegramName to `createOrMergeLead`, BUT  
they're only saved to `lead.payload`, NOT to top-level `Lead` table fields. Need DB migration OR explicit save to payload.

**Fix location:** `apps/server/src/modules/Communication/telegram/core/leadService.ts:146-158`  
**DoD:** 
- Run query: `SELECT COUNT(*) FROM "Lead" WHERE payload::jsonb->>'telegramName' IS NOT NULL;` → should be > 0 after new leads
- Create test lead via webhook → verify payload has `telegramName`, `telegramUsername`, `telegramChatId`, `telegramUserId`

---

### 🔴 P0-2: MTProto Channel Import Not Tested (Stage-1 Requirement)
**Problem:** 0 ChannelSource records in DB → "import by period" never tested in production  
**Impact:** Cannot onboard client with "sync from existing channel" flow  
**Evidence:**
```sql
SELECT COUNT(*) FROM "ChannelSource"; -- Result: 0
```
**Status:** Code exists (`mtproto.service.ts::syncChannel`, `mtproto-mapping.service.ts::processBatch`), but:
- No real channel added via UI
- No worker execution logs (scheduler found 0 sources)

**Fix location:** Need end-to-end test:
1. Add test channel via `/api/integrations/mtproto/channels` endpoint
2. Trigger sync: `POST /api/integrations/mtproto/channels/:id/sync`
3. Verify CarListing created with dedup

**DoD:**
- 1 ChannelSource in DB with status=ACTIVE
- Run syncChannel → logs show "Created CarListing from message X"
- Query: `SELECT COUNT(*) FROM "CarListing" WHERE source='MTPROTO';` → > 0

---

### 🔴 P0-3: Channel Post "Double Truth" Risk
**Problem:** Bot API `routeChannelPost.ts` creates Draft, MTProto creates CarListing → two separate pipelines  
**Impact:** Same channel post could create BOTH Draft AND CarListing (duplication)  
**Code locations:**
- Bot API: `apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts:40-81` → creates Draft
- MTProto: `apps/server/src/services/mtproto-mapping.service.ts:177-256` → creates CarListing

**Current dedup:**
- Bot API dedup: TelegramUpdate by update_id (pipeline middleware)
- MTProto dedup: CarListing by sourceChatId + sourceMessageId

**Gap:** If channel monitored by BOTH Bot API webhook + MTProto sync, no cross-pipeline dedup.

**Fix strategy (minimal):**
1. Decide: channel_post → Draft ONLY (for content calendar) OR CarListing ONLY (for inventory)
2. If Draft is intermediate stage → add explicit "convert Draft to CarListing" action
3. Or: unify both into `IngestionService.processChannelMessage(...)` with single entity decision

**DoD:**
- Document in rules: "Channel posts for inventory go to X, content goes to Y"
- No duplicate entries after test scenario: post in channel monitored by both

---

## 📊 Top-10 Actions (Priority Order)

| # | Action | Type | Effort | Impact | Location |
|---|--------|------|--------|--------|----------|
| 1 | Fix Lead TG Identity | P0 | 1h | HIGH | leadService.ts:146-158 |
| 2 | Test MTProto Channel Import | P0 | 2h | HIGH | mtproto.service.ts + UI |
| 3 | Resolve Channel Post Dual Pipeline | P0 | 3h | HIGH | routeChannelPost.ts + mtproto-mapping.service.ts |
| 4 | Add "import by period" UI control | P1 | 2h | MED | Frontend + mtproto.routes.ts |
| 5 | MTProto file_id → actual media download | P1 | 4h | MED | mtproto.service.ts + media worker |
| 6 | Lead dedup edge case: phone with/without + | P1 | 1h | LOW | leadService.ts + normalizePhone |
| 7 | Add webhook health check endpoint | P2 | 30m | LOW | telegram.routes.ts |
| 8 | Improve error logging: add botId/chatId context | P2 | 1h | LOW | pipeline.ts + routing/* |
| 9 | Document mini app payload schema | P2 | 30m | LOW | docs/ |
| 10 | Add DB index: Lead(companyId, userTgId) | P2 | 15m | LOW | prisma migration |

---

## 🎯 Stage-1 Definition (REMINDER)

### Client Onboarding Must Work:
1. ✅ Bot webhook → Inbox/Leads (**WORKS**, but P0-1 needs fix for identity)
2. ⚠️ MTProto channel import → Inventory (**CODE EXISTS**, but P0-2 needs test)
3. ⚠️ Showcase editable → Mini App (**UNKNOWN**, not in audit scope)

### After Restart:
1. ✅ Integrations survive: scheduler runs, worker active
2. ✅ No silent deaths: logs show ContentWorker + sync_telegram_channels every 15min

### Diagnostics:
1. ✅ `/api/health` green
2. ⚠️ UI for channel source status (needs checking in frontend audit)

---

## 📁 Next Steps

1️⃣ **Immediate (today):** Fix P0-1 (Lead TG Identity) — 1h task  
2️⃣ **This week:** Complete P0-2 (MTProto e2e test) + P0-3 (dual pipeline decision)  
3️⃣ **Before client demo:** Run full smoke test suite (see `40_BACKLOG_STAGE1_PLAN.md`)

**Audit artifacts:**
- `10_TELEGRAM_BOTAPI_AUDIT.md` — Detailed Bot API findings
- `20_MTPROTO_AUDIT.md` — MTProto implementation gaps
- `30_CODE_STRUCTURE_AUDIT.md` — Module boundaries, refactor suggestions
- `40_BACKLOG_STAGE1_PLAN.md` — Execution roadmap with DoD

---

**Status:** 🟡 YELLOW-GREEN (Близко к Stage-1, но 3 P0 блокера)  
**Confidence:** Can be Stage-1 ready in 1-2 days after fixing P0 issues
