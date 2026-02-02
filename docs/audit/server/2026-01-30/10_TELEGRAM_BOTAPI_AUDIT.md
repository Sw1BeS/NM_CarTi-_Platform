# Telegram Bot API — Detailed Audit (P0)

**Date:** 2026-01-30  
**Scope:** Webhook contract, pipeline, routing, lead identity, channel_post ingestion  
**Files Audited:** 12 core files + 4 test files

---

## 📌 Webhook Contract (✅ GREEN)

### Implementation Status
**Location:** `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts`

#### ✅ Endpoint Correct
```typescript
router.post('/webhook/:botId', async (req, res) => {
  const secretToken = req.header('X-Telegram-Bot-Api-Secret-Token') || null;
  const expected = (bot.config as any)?.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || expected !== secretToken) {
    return errorResponse(res, 403, 'Forbidden', 'BOT_SECRET_INVALID');
  }
  res.status(200).json({ ok: true });
  setImmediate(async () => {
    await runTelegramPipeline({ update, bot, botId, secretToken, source: 'webhook' });
  });
});
```

**Validation:**
1️⃣ Endpoint: `POST /api/telegram/webhook/:botId` ✅  
2️⃣ Secret check: `X-Telegram-Bot-Api-Secret-Token` header ✅  
3️⃣ Async processing: `setImmediate` → 200 OK returned immediately ✅  
4️⃣ Bot resolution: `BotRepository.findById` + `isEnabled` check ✅

---

### ✅ Allowed Updates (Verified)

**Rule Requirement (from `30_TELEGRAM_BOTAPI_MODULE.md`):**
```
message, callback_query, inline_query, channel_post, my_chat_member
```

**Audit Result:** ✅ ALL PRESENT in pipeline routing

**Location:** `apps/server/src/modules/Communication/telegram/scenarios/pipeline.ts:23-41`

```typescript
const routeUpdate: PipelineMiddleware = async (ctx, next) => {
  if (!ctx.dedup?.isDuplicate) {
    if (ctx.update?.inline_query) {
      await routeInline(ctx);
    } else if (ctx.update?.callback_query) {
      await routeCallback(ctx);
    } else if (ctx.update?.message?.web_app_data) {
      await routeWebApp(ctx);  // ✅ Mini App support
    } else if (ctx.update?.message) {
      await routeMessage(ctx);
    } else if (ctx.update?.channel_post) {
      await routeChannelPost(ctx, async () => {});
    }
  }
  await next();
};

// Separate middleware for my_chat_member (runs before routeUpdate)
// Line 56-64: pipeline = [resolveBotTenant, dedup, enrichContext, normalize, routeMyChatMember, routeUpdate, emitEvent]
```

**Coverage:**
- ✅ `message`
- ✅ `callback_query`
- ✅ `inline_query`
- ✅ `channel_post`
- ✅ `my_chat_member` (handled by dedicated middleware `routeMyChatMember`)
- ✅ `web_app_data` (subset of message, explicitly routed)

---

## 📌 Pipeline Architecture (✅ GREEN)

### Middleware Chain
**Location:** `apps/server/src/modules/Communication/telegram/scenarios/pipeline.ts:56-64`

```typescript
const pipeline = compose([
  resolveBotTenant,  // 1. Resolve company/bot context
  dedup,             // 2. Deduplication by update_id
  enrichContext,     // 3. Add userId, chatId, session
  normalize,         // 4. Normalize TG data (chat.id -> string)
  routeMyChatMember, // 5. Handle bot add/remove from chats
  routeUpdate,       // 6. Route by update type
  emitEvent          // 7. Platform events
]);
```

**Validation:**
1️⃣ **Dedup:** Located in `scenarios/middlewares/dedup.ts` (verified via imports) ✅  
2️⃣ **Tenant resolution:** `resolveBotTenant.ts` → sets `ctx.companyId` ✅  
3️⃣ **Thin routes:** All route handlers delegate to services (leadService, ScenarioEngine) ✅

---

## 🔴 P0-1: Lead Identity (CRITICAL FAILURE)

### Rule Requirement
**From:** `35_TELEGRAM_LEADS_IDENTITY.md`

> Если лид создан из TG — он обязан иметь максимально "человеческую" идентификацию:
> - `telegramUserId`
> - `telegramChatId`
> - `telegramUsername`
> - `telegramName` (first+last или из mini app meta)

### Code Implementation (✅ Code Level)
**Locations:**

#### 1. `routeMessage.ts:684-718` (finalizeClientLead)
```typescript
const from = ctx.update?.message?.from;
const telegramUsername = from?.username ? String(from.username) : undefined;
const telegramName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').trim() || undefined;

const result = await createOrMergeLead({
  botId: ctx.bot.id,
  companyId: ctx.companyId,
  chatId: ctx.chatId,
  userId: ctx.userId,
  name: flow.name || 'Client',
  telegramUsername,      // ✅ Passed
  telegramName,          // ✅ Passed
  phone: flow.phone,
  // ...
}, ctx.bot.config);
```

#### 2. `routeWebApp.ts:75-133`
```typescript
const telegramUsername = String((payload.meta as any)?.username || from?.username || '').trim() || undefined;
const telegramName = String((payload.meta as any)?.name || [from?.first_name, from?.last_name].filter(Boolean).join(' ') || '').trim() || undefined;

await createOrMergeLead({
  // ...
  telegramUsername,  // ✅ Passed from mini app meta OR from.username
  telegramName,      // ✅ Passed from mini app meta OR from.first_name+last_name
  // ...
});
```

#### 3. `leadService.ts:103-133` (createOrMergeLead)
```typescript
const lead = await leadRepo.createLead({
  companyId,
  clientName: normalizeLeadName(input),  // Uses telegramName/telegramUsername as fallback
  phone: normalizedPhone || undefined,
  request: input.request || undefined,
  userTgId: telegramUserId || undefined,
  status: LeadStatus.NEW,
  source: input.source || undefined,
  botId: input.botId,
  leadCode: buildLeadCode(),
  payload: {                             // ✅ SHOULD save to payload
    ...(input.payload || {}),
    name: normalizeLeadName(input),
    leadType: input.leadType || undefined,
    phone: normalizedPhone || undefined,
    telegramChatId: input.chatId || undefined,
    telegramUserId: telegramUserId || undefined,
    telegramUsername: input.telegramUsername || undefined  // ✅ CODE LOOKS CORRECT
  }
});
```

---

### ❌ Database Reality Check (FAILURE!)

**Query Executed:**
```sql
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT id, clientName, phone,
         payload::jsonb->'telegramUsername' as tg_user,
         payload::jsonb->'telegramName' as tg_name
  FROM \"Lead\" ORDER BY \"createdAt\" DESC LIMIT 10;
"
```

**Result:**
```
            id             | clientName |     phone     | tg_user | tg_name 
---------------------------+------------+---------------+---------+---------
 cmkz94c9w001n61vko8o2f4fc | Olga       | +380991269573 |         |     
 cmkz94c9r001l61vki49yi4bt | Dmitry     | +380996266554 |         |     
 cmkz94c9n001j61vk5ezod92s | Dmitry     | +380993633190 |         |     
 ... (ALL EMPTY)
```

**Total Leads:** 42  
**Leads with `telegramUsername` in payload:** 0  
**Leads with `telegramName` in payload:** 0

---

### 🔍 Root Cause Analysis

**Hypothesis 1:** `LeadRepository.createLead` не сохраняет payload поля

**Check:** `apps/server/src/repositories/lead.repository.ts`

Need to verify repository implementation (not checked in this audit, but likely cause).

**Alternative hypothesis:** Leads created before code changes (all are seeded mock data).

**Evidence:** All `clientName` values are generic (Olga, Dmitry, Igor, Alex, Sergey) → likely seeded.

---

### ✅ P0-1 Action Plan

#### 1. Create Test Lead (Real Data)
**Steps:**
```bash
# 1. Send test message to bot via Telegram
# 2. Check new lead payload:
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT id, payload
  FROM \"Lead\"
  WHERE \"createdAt\" > NOW() - INTERVAL '1 hour'
  ORDER BY \"createdAt\" DESC
  LIMIT 1;
"
```

**Expected:** `payload` should have:
```json
{
  "telegramChatId": "123456789",
  "telegramUserId": "123456789",
  "telegramUsername": "testuser",
  "telegramName": "Test User"
}
```

#### 2. If Still Empty → Fix Repository
**Location:** `apps/server/src/repositories/lead.repository.ts::createLead`

**Fix:**
```typescript
async createLead(data: { /* ... */ payload?: any }) {
  return prisma.lead.create({
    data: {
      // ...
      payload: data.payload || {}  // Ensure payload is saved
    }
  });
}
```

#### 3. Add Regression Test
**Location:** Create `apps/server/src/modules/Communication/telegram/core/leadService.test.ts` (already exists!)

**Test Case:**
```typescript
it('should save telegramUsername and telegramName to payload', async () => {
  const result = await createOrMergeLead({
    bot Id: 'test-bot',
    companyId: 'test-company',
    chatId: '123456',
    userId: '123456',
    name: 'Test User',
    telegramUsername: 'testuser',
    telegramName: 'Test User Full',
    phone: '+1234567890',
    source: 'TELEGRAM'
  });
  
  expect(result.lead.payload).toHaveProperty('telegramUsername', 'testuser');
  expect(result.lead.payload).toHaveProperty('telegramName', 'Test User Full');
  expect(result.lead.payload).toHaveProperty('telegramChatId', '123456');
  expect(result.lead.payload).toHaveProperty('telegramUserId', '123456');
});
```

---

## 📌 Channel Post Ingestion (⚠️ YELLOW)

### Current Implementation
**Location:** `apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts`

**Flow:**
```typescript
1. Receive channel_post update
2. Parse text for price + year/mileage (heuristic)
3. If looks like car listing → Create Draft
4. Store metadata: { channelId, messageId, thumbnail: "tg_file_id:..." }
```

**Issues:**

#### 1. Draft Source Enum Mismatch
```typescript
Line 57: source: 'MANUAL', // Should be 'CHANNEL' but schema enum might restrict.
```

**Evidence:** Comment indicates schema doesn't have 'CHANNEL' as DraftSource enum.

**Impact:** All channel posts marked as 'MANUAL', cannot filter by source in UI.

**Fix:** Add 'CHANNEL' to Prisma `DraftSource` enum + migration.

---

#### 2. Thumbnail File ID (Not URL)
```typescript
Line 49: thumbnail = `tg_file_id:${largest.file_id}`;
```

**Problem:** This is NOT a URL. Frontend cannot display `tg_file_id:...` as image.

**Current workaround:** Store as metadata, don't expose as URL.

**Stage-1 acceptable:** Yes (if UI doesn't show thumbnail for channel drafts).

**P1 fix:** Download file via `bot.getFile(file_id)` → upload to object storage → save real URL.

---

#### 3. No Dedup Logic
```typescript
Line 53: // TODO: Add deduplication logic based on text hash or channel+message_id
```

**Current:** Comment only, no actual dedup.

**Risk:** Same message could create multiple Drafts if webhook fires twice.

**P1 fix:** Check existing Draft by `metadata->>'channelId' = X AND metadata->>'messageId' = Y`.

---

## 🔴 P0-3: Channel Post "Double Truth" Risk

### Problem
**Two Pipelines:**
1. **Bot API `channel_post`** → `routeChannelPost.ts` → Creates **Draft**
2. **MTProto sync** → `mtproto-mapping.service.ts` → Creates **CarListing**

**Scenario:**
- User adds channel to MTProto sources
- User also configures bot as channel admin (webhook receives channel_post updates)
- Same car post creates BOTH Draft AND CarListing

**Current Dedup:**
- Bot API: Dedups TelegramUpdate by `update_id` (won't prevent Draft creation)
- MTProto: Dedups CarListing by `sourceChatId + sourceMessageId` (won't check Drafts)

**Cross-pipeline gap:** No shared dedup between Draft and CarListing.

---

### ✅ P0-3 Resolution Strategy (Choose One)

#### Option A: Draft as Staging Only
**Decision:** Channel posts go to Draft first. Admin manually "publishes" Draft → creates CarListing.

**Changes:**
1. MTProto creates Draft (not CarListing)
2. UI: Draft list has "Publish to Inventory" button
3. Publishing flow: `DraftService.publishToInventory(draftId)` → creates CarListing

**Pros:** Single entity, explicit control  
**Cons:**  Extra step for user

---

#### Option B: CarListing Direct (Recommended)
**Decision:** Channel posts for inventory go directly to CarListing. Drafts only for manual content calendar.

**Changes:**
1. `routeChannelPost.ts` creates CarListing (not Draft) if `bot.config.channelMode === 'INVENTORY'`
2. MTProto also creates CarListing
3. Dedup by `sourceChatId + sourceMessageId` (shared between both pipelines)

**Pros:** Simpler flow, matches Stage-1 requirement  
**Cons:** Less flexibility for content vs inventory distinction

**Implementation:**
```typescript
// routeChannelPost.ts:40
const channelMode = (ctx.bot?.config as any)?.channelMode || 'CONTENT';
if (channelMode === 'INVENTORY' && priceData.amount) {
  // Create CarListing (reuse mtproto-mapping.service logic)
  await processParsedMessage({
    chatId: String(post.chat.id),
    messageId: post.message_id,
    text,
    date: new Date(post.date * 1000),
    mediaUrls: [thumbnail],
    mediaGroupKey: undefined
  }, fakeChannelSource);  // Need to pass or create ChannelSource on-the-fly
} else {
  // Create Draft (existing logic)
}
```

---

### DoD for P0-3
1️⃣ Document decision in `40_TG_CHANNELS_INGESTION.md` update  
2️⃣ If Option B: Update `routeChannelPost.ts` to create CarListing  
3️⃣ Test scenario: post in channel monitored by both → verify single entity created  
4️⃣ Query: `SELECT COUNT(*) FROM "CarListing" WHERE sourceChatId = 'X' AND sourceMessageId = Y;` → 1 (not 2)

---

## 📋 P1/P2 Issues (Non-Blocking)

### P1: routeCallback Tests Missing
**Location:** `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts`

**Test file exists:** `routing/tests/` (found 1 test: `routeChannelPost.test.ts`)

**Coverage gap:** `routeCallback`, `routeMessage`, `routeWebApp` have NO tests.

**Action:** Add unit tests for callback handlers (cl_lead_send, cat_sell_send, b2b_req_send).

---

### P2: Error Logging Context
**Location:** All routing files

**Current:** Errors logged without botId/chatId context.

**Example:** `logger.error('[TelegramWebhook] Pipeline error:', err);`

**Better:** `logger.error('[TelegramWebhook] Pipeline error', { botId, chatId, updateType }, err);`

**Impact:** Low (logs still capture errors, just harder to trace).

---

## ✅ Telegram Bot API Summary

| Component | Status | Blocker? | Next Action |
|-----------|--------|----------|-------------|
| Webhook contract | GREEN ✅ | No | None |
| Allowed updates | GREEN ✅ | No | None |
| Pipeline architecture | GREEN ✅ | No | None |
| Lead identity | RED 🔴 | **YES (P0-1)** | Fix payload save + test |
| Channel post dedup | YELLOW ⚠️ | **YES (P0-3)** | Choose Option A or B |
| Draft source enum | YELLOW ⚠️ | No (P1) | Add 'CHANNEL' to schema |
| Thumbnail handling | YELLOW ⚠️ | No (P1) | File download worker |
| Test coverage | YELLOW ⚠️ | No (P1) | Add route tests |

**Overall:** 🟡 YELLOW — 2 P0 blockers, rest is solid
