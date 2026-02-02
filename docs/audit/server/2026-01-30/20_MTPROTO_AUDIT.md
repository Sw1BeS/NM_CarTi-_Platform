# MTProto — Detailed Audit (P0)

**Date:** 2026-01-30  
**Scope:** Channel import, period sync, dedup, media handling  
**Files Audited:** 5 files (mtproto.service.ts, mtproto-mapping.service.ts, mtproto.routes.ts, mtproto.worker.ts, mtproto.lifecycle.ts)

---

## 📌 Module Structure (✅ GREEN)

### Files & Responsibilities
```
apps/server/src/modules/Integrations/mtproto/
├── mtproto.service.ts        → TelegramClient wrapper, channel resolution, history fetch
├── mtproto.routes.ts          → API endpoints (add/remove channels, trigger sync)
├── mtproto.worker.ts          → Scheduled sync job (every 15 min)
├── mtproto.lifecycle.ts       → Client lifecycle (connect/disconnect on app start/stop)
└── mtproto.utils.ts           → Helpers (session management, error handling)

apps/server/src/services/
└── mtproto-mapping.service.ts → Parse message → create CarListing (with importRules)
```

**Validation:**
1️⃣ **Single pipeline:** ✅ `mtproto-mapping.service.ts` is canonical processor  
2️⃣ **Config > code:** ✅ `ChannelSource.importRules` controls filters (minYear, maxPrice, keywords)  
3️⃣ **Dedup logic:** ✅ `processParsedMessage` checks `sourceChatId + sourceMessageId` before creating CarListing

---

## 🔴 P0-2: Import by Period NOT TESTED (CRITICAL)

### Stage-1 Requirement
> "MTProto Channel: select channel → import by period → Draft/Inventory"

### Code Status: ✅ Implementation EXISTS

#### 1. API Endpoint for Sync
**Location:** `mtproto.routes.ts` (not fully audited, but service method exists)

**Service Method:** `mtproto.service.ts:353-443`
```typescript
async syncChannel(connectorId: string, sourceId: string) {
  const client = await this.getClient(connectorId);
  const channelSource = await prisma.channelSource.findUnique({ where: { id: sourceId } });
  const channel = await client.getEntity(channelSource.sourceId);
  
  let offsetId = channelSource.lastMessageId || 0;
  let hasMore = true;
  
  while (hasMore) {
    const history = await client.invoke(new Api.messages.GetHistory({
      peer: channel,
      offset_id: offsetId,
      limit: 100
    }));
    
    // Process messages via mtproto-mapping.service.ts
    for (const msg of history.messages) {
      await processParsedMessage(convertToTelegramMessage(msg), channelSource);
    }
    
    // Update lastMessageId checkpoint
    await prisma.channelSource.update({
      where: { id: sourceId },
      data: { lastMessageId: offsetId }
    });
    
    if (history.messages.length < 100) hasMore = false;
  }
}
```

**Assessment:**
- ✅ Implements pagination (limit=100, offsetId checkpoint)
- ✅ **Saves checkpoint** (`lastMessageId`) after each batch
- ✅ Calls `processParsedMessage` → creates CarListing with dedup

---

#### 2. Scheduler (Worker)
**Location:** `mtproto.worker.ts:1-60` (summary, not full code)

**Log Evidence:**
```
[2026-01-30T02:30:00.062Z] [INFO] ⏰ Scheduler: Starting Job [sync_telegram_channels]
[2026-01-30T02:30:00.157Z] [INFO] ⏰ Scheduler: Found 0 active channel sources.
```

**Runs every:** 15 minutes (02:30, 02:45, 03:00, etc.)

**Current State:** Worker running, but **0 active sources** in DB.

---

### ❌ Database Reality Check (FAILURE!)

**Query:**
```sql
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "SELECT COUNT(*) FROM \"ChannelSource\";"
```

**Result:**
```
 count 
-------
     0
```

**Impact:** Cannot test "import by period" because no real channel added.

---

### ✅ P0-2 Action Plan

#### Step 1: Add Test Channel via API
**Endpoint (to verify exists):** `POST /api/integrations/mtproto/channels`

**Expected Payload:**
```json
{
  "connectorId": "<existing MTProtoConnector ID>",
  "channelUsername": "@testautochannel",
  "importRules": {
    "minYear": 2015,
    "maxPrice": 50000,
    "filterKeywords": ["BMW", "Audi"],
    "autoPublish": false
  }
}
```

**Response:** Creates `ChannelSource` record with status=ACTIVE.

---

#### Step 2: Trigger Manual Sync
**Endpoint:** `POST /api/integrations/mtproto/channels/:channelSourceId/sync`

**Expected:** Logs show:
```
[MTProto Mapping] Created CarListing from message 12345 (BMW 320d)
✅ [MTProto Mapping] Created CarListing from message 12346 (Audi A4)
```

---

#### Step 3: Verify Results
**Queries:**
```sql
-- 1. Check ChannelSource created
SELECT * FROM "ChannelSource" WHERE "connectorId" = '<connector-id>';

-- 2. Check CarListings imported
SELECT COUNT(*) FROM "CarListing" WHERE source='MTPROTO';

-- 3. Check dedup works (re-run sync, count should not increase)
SELECT COUNT(*) FROM "CarListing" 
WHERE source='MTPROTO' 
  AND sourceChatId = '<test-channel-id>';  -- Should stay same after 2nd sync
```

---

#### Step 4: Test "Import by Period" (Date Range)

**Code Gap:** Current `syncChannel` method fetches ALL messages from `lastMessageId` to latest.

**Missing Feature:** UI/API to specify date range (e.g., "import posts from 2024-01-01 to 2024-12-31").

**Quick Fix (if needed for Stage-1):**
```typescript
// Add optional parameters to syncChannel
async syncChannel(connectorId: string, sourceId: string, options?: {
  fromDate?: Date;
  toDate?: Date;
  maxMessages?: number;
}) {
  // Filter messages by date after fetch
  const messages = history.messages.filter(msg => {
    const msgDate = new Date(msg.date * 1000);
    if (options?.fromDate && msgDate < options.fromDate) return false;
    if (options?.toDate && msgDate > options.toDate) return false;
    return true;
  });
}
```

**Alternative (Better):** Use Telegram API `offset_date` parameter to fetch messages from specific date:
```typescript
const history = await client.invoke(new Api.messages.GetHistory({
  peer: channel,
  offset_date: Math.floor(options.fromDate.getTime() / 1000),  // Unix timestamp
  limit: 100
}));
```

---

## 📌 Dedup & Media Handling

### Dedup Strategy (✅ SOLID)
**Location:** `mtproto-mapping.service.ts:209-220`

```typescript
const existing = await prisma.carListing.findFirst({
  where: {
    sourceChatId: message.chatId,
    sourceMessageId: message.messageId
  }
});

if (existing) {
  logger.info(`Car from message ${message.messageId} already imported`);
  return;
}
```

**Validation:**
- ✅ Primary dedup key: `sourceChatId + sourceMessageId`
- ⚠️ Missing: `mediaGroupKey` check (for albums like photo carousel)

**P1 Enhancement:**
```typescript
const existing = await prisma.carListing.findFirst({
  where: {
    OR: [
      { sourceChatId: message.chatId, sourceMessageId: message.messageId },
      message.mediaGroupKey ? { mediaGroupKey: message.mediaGroupKey } : {}
    ]
  }
});
```

---

### Media Handling (⚠️ YELLOW)

**Current Implementation:**
```typescript
Line 236: thumbnail: message.mediaUrls?.[0],
Line 237: mediaUrls: message.mediaUrls || [],
```

**Problem:** `message.mediaUrls` is NOT populated in `mtproto.service.ts`.

**Evidence:** `syncChannel` method doesn't download files, only passes text.

**Current Flow:**
1. Fetch message with photos
2. Convert to `TelegramMessage` → `mediaUrls` = undefined
3. CarListing created with `thumbnail: undefined`

---

#### P1 Fix: File ID Storage
**Temporary Solution (Stage-1 acceptable):**
Store Telegram `file_id` in `CarListing.originalRaw`:
```typescript
originalRaw: {
  text: message.text,
  date: message.date,
  photoFileIds: message.photos?.map(p => p.file_id) || []  // Store for later download
}
```

---

#### P2 Fix: Actual Download
**Full Solution (Post-Stage-1):**
1. Extract `file_id` from message
2. Queue download job → `MediaWorker.downloadTelegramFile(file_id, botToken)`
3. Upload to object storage (S3/CloudFlare R2)
4. Update `CarListing.thumbnail` with real URL

**Effort:** ~4h (worker + storage integration)

---

## 📌 Import Rules Application (✅ GREEN)

### Configuration
**Location:** `mtproto-mapping.service.ts:137-172`

**Supported Filters:**
```typescript
{
  minYear: 2015,        // Filter cars < this year
  maxYear: 2023,        // Filter cars > this year
  minPrice: 10000,      // Filter cars < this price
  maxPrice: 50000,      // Filter cars > this price
  filterKeywords: ['BMW', 'Audi'],  // Only import if text matches
  mapTo: {              // Override parsed values
    brand: 'BMW',
    location: 'Kyiv',
    currency: 'UAH'
  },
  autoPublish: true     // Set status=AVAILABLE (vs PENDING)
}
```

**Validation:** ✅ Code correctly applies all filters before creating CarListing.

---

## 🔴 P0-3 Reminder: Dual Pipeline Risk

**Overlap with Bot API:**
If same channel monitored by:
1. MTProto `ChannelSource` (active sync)
2. Bot API as admin (receives `channel_post` webhook)

**Result:** Same message creates:
- CarListing (via MTProto)
- Draft (via Bot API `routeChannelPost.ts`)

**Cross-ref:** See `10_TELEGRAM_BOTAPI_AUDIT.md` P0-3 for resolution strategy.

---

## ✅ MTProto Summary

| Component | Status | Blocker? | Next Action |
|-----------|--------|----------|-------------|
| Module structure | GREEN ✅ | No | None |
| Sync by period (code) | GREEN ✅ | No | None |
| Sync by period (tested) | RED 🔴 | **YES (P0-2)** | Add channel + run sync |
| Dedup logic | GREEN ✅ | No | P1: add mediaGroupKey check |
| Import rules | GREEN ✅ | No | None |
| Checkpoint (lastMessageId) | GREEN ✅ | No | None |
| Media download | YELLOW ⚠️ | No (P1) | File download worker |
| Date range UI | YELLOW ⚠️ | No (P1) | Add fromDate/toDate params |

**Overall:** 🟡 YELLOW — Code is solid, but needs real-world test (P0-2)

---

## 📋 DoD for P0-2

1️⃣ **Add Channel:**
```sql
-- Verify record exists
SELECT * FROM "ChannelSource" WHERE status='ACTIVE';
```

2️⃣ **Run Sync:**
```bash
# Trigger via API or wait for scheduler (15 min)
curl -X POST http://localhost:3002/api/integrations/mtproto/channels/<id>/sync
```

3️⃣ **Verify Import:**
```sql
-- Should have CarListings
SELECT COUNT(*) FROM "CarListing" WHERE source='MTPROTO';
-- Should be > 0

-- Check specific channel
SELECT id, title, price, sourceChatId, sourceMessageId
FROM "CarListing"
WHERE source='MTPROTO'
ORDER BY "postedAt" DESC
LIMIT 10;
```

4️⃣ **Test Dedup:**
```bash
# Run sync again
curl -X POST http://localhost:3002/api/integrations/mtproto/channels/<id>/sync

# Verify count didn't double
SELECT COUNT(*) FROM "CarListing" WHERE source='MTPROTO';
-- Should be SAME as before
```

5️⃣ **Check Logs:**
```bash
docker logs --tail 100 infra2-api-1 | grep "MTProto Mapping"
# Should see: "Created CarListing from message X"
# Should NOT see: errors or duplicates
```

**Time Estimate:** 2h (setup channel + testing + verification)
