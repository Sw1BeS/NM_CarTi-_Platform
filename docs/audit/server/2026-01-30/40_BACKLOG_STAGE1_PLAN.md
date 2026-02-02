# Stage-1 Backlog Plan (Execution Roadmap)

**Date:** 2026-01-30  
**Goal:** CarTié готов к продаже клиенту (Stage-1 readiness)  
**Timeline:** 1-2 days (assuming 1 engineer, 8-10h work)

---

## 📌 P0 Tasks (Blocking Stage-1)

### M1: Fix Lead TG Identity (P0-1)
**Priority:** CRITICAL  
**Effort:** 1-2h  
**Owner:** Backend dev

#### Tasks
1️⃣ **Verify Repository Implementation**
```bash
# Check if LeadRepository.createLead actually saves payload
grep -n "payload" apps/server/src/repositories/lead.repository.ts
```

2️⃣ **Create Test Lead**
```bash
# Send message to bot via Telegram
# Then query:
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT id, payload::jsonb->'telegramUsername', payload::jsonb->'telegramName'
  FROM \"Lead\"
  WHERE \"createdAt\" > NOW() - INTERVAL '10 minutes'
  ORDER BY \"createdAt\" DESC
  LIMIT 1;
"
```

**Expected:** `telegramUsername` and `telegramName` should NOT be NULL.

3️⃣ **Fix if Broken**
```typescript
// If payload not saved, update lead.repository.ts:createLead
async createLead(data: LeadCreateInput) {
  return prisma.lead.create({
    data: {
      // ...
      payload: data.payload || Prisma.JsonNull  // Ensure payload is saved
    }
  });
}
```

4️⃣ **Add Regression Test**
```typescript
// apps/server/src/modules/Communication/telegram/core/leadService.test.ts
it('should save telegramUsername and telegramName to payload', async () => {
  const result = await createOrMergeLead({
    botId: 'test-bot',
    companyId: 'test-company',
    chatId: '123456',
    userId: '123456',
    name: 'Test User',
    telegramUsername: 'testuser',
    telegramName: 'Test User Full',
    phone: '+1234567890',
    source: 'TELEGRAM'
  });
  
  expect(result.lead.payload).toMatchObject({
    telegramUsername: 'testuser',
    telegramName: 'Test User Full',
    telegramChatId: '123456',
    telegramUserId: '123456'
  });
});
```

5️⃣ **Run Test**
```bash
cd apps/server && npm test -- leadService.test.ts
```

#### DoD
- [ ] New lead created via webhook has `telegramUsername` and `telegramName` in payload
- [ ] Query: `SELECT COUNT(*) FROM "Lead" WHERE payload::jsonb->>'telegramName' IS NOT NULL;` → > 0
- [ ] Unit test passes

---

### M2: Test MTProto Channel Import (P0-2)
**Priority:** CRITICAL  
**Effort:** 2-3h  
**Owner:** Backend dev + QA

#### Tasks
1️⃣ **Find or Create MTProtoConnector**
```sql
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "SELECT * FROM \"MTProtoConnector\" LIMIT 1;"
```

**If None:** Create via UI or API (requires phone auth flow).

2️⃣ **Add Test Channel**
```bash
# Via API (adjust endpoint if different)
curl -X POST http://localhost:3002/api/integrations/mtproto/channels \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin-token>" \
  -d '{
    "connectorId": "<connector-id>",
    "channelUsername": "@testautochannel",
    "importRules": {
      "minYear": 2015,
      "maxPrice": 50000,
      "filterKeywords": ["BMW", "Audi"],
      "autoPublish": false
    }
  }'
```

3️⃣ **Trigger Manual Sync**
```bash
curl -X POST http://localhost:3002/api/integrations/mtproto/channels/<channel-source-id>/sync \
  -H "Authorization: Bearer <admin-token>"
```

4️⃣ **Verify Import**
```sql
-- Check CarListings created
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT COUNT(*) FROM \"CarListing\" WHERE source='MTPROTO';
"
# Should be > 0

-- Check dedup (run sync again, count should NOT increase)
```

5️⃣ **Check Logs**
```bash
docker logs --tail 100 infra2-api-1 | grep "MTProto Mapping"
# Should see: "✅ [MTProto Mapping] Created CarListing from message X"
```

#### DoD
- [ ] ChannelSource record exists with status=ACTIVE
- [ ] At least 1 CarListing created with source='MTPROTO'
- [ ] Re-running sync does NOT create duplicates (dedup works)
- [ ] Logs show successful import messages

---

### M3: Resolve Channel Post Dual Pipeline (P0-3)
**Priority:** CRITICAL  
**Effort:** 3-4h  
**Owner:** Backend dev + Product (decision)

#### Decision Required (Choose One)

**Option A: Draft → CarListing Flow**
- Channel posts create Draft
- Admin manually "publishes" to inventory
- Single source of truth: Draft first

**Option B: CarListing Direct (Recommended)**
- Channel posts for inventory go directly to CarListing
- Shared dedup: `sourceChatId + sourceMessageId`
- Bot config: `channelMode: 'INVENTORY'` | 'CONTENT'

#### Implementation (Option B)
1️⃣ **Update routeChannelPost.ts**
```typescript
// Line 40-81: Replace Draft creation with:
const channelMode = (ctx.bot?.config as any)?.channelMode || 'CONTENT';

if (channelMode === 'INVENTORY' && priceData.amount) {
  // Create CarListing using mtproto-mapping logic
  const channelSource = {
    id: 'bot-api-source',
    connectorId: 'bot-api',
    importRules: {}
  } as ChannelSource;
  
  await processParsedMessage({
    chatId: String(post.chat.id),
    messageId: post.message_id,
    text,
    date: new Date(post.date * 1000),
    mediaUrls: thumbnail ? [thumbnail] : [],
    mediaGroupKey: undefined
  }, channelSource);
} else {
  // Create Draft (existing logic)
  await prisma.draft.create({ ... });
}
```

2️⃣ **Add BotConfig.channelMode Field**
```prisma
// schema.prisma
model BotConfig {
  // ...
  config Json?  // Add: { channelMode: 'INVENTORY' | 'CONTENT' }
}
```

3️⃣ **Test Scenario**
```bash
# 1. Post in channel monitored by:
#    - MTProto ChannelSource (active)
#    - Bot API (channel admin)

# 2. Verify only ONE entity created:
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT COUNT(*) FROM \"CarListing\"
  WHERE sourceChatId = '<test-channel-id>'
    AND sourceMessageId = <test-message-id>;
"
# Should be 1 (not 2)
```

#### DoD
- [ ] Decision documented in `40_TG_CHANNELS_INGESTION.md`
- [ ] Code updated (Option A or B implemented)
- [ ] Test scenario: post in dual-monitored channel → single entity created
- [ ] No duplicate entries in CarListing or Draft

---

## 📌 P1 Tasks (Post-Stage-1, High Value)

### M4: Add CarListingRepository
**Priority:** P1  
**Effort:** 1h

#### Tasks
```typescript
// repositories/carListing.repository.ts (NEW)
export class CarListingRepository {
  constructor(private prisma: PrismaClient) {}
  
  async findBySourceMessage(chatId: string, messageId: number) {
    return this.prisma.carListing.findFirst({
      where: { sourceChatId: chatId, sourceMessageId: messageId }
    });
  }
  
  async createListing(data: CreateCarListingInput) {
    // Dedup
    const existing = await this.findBySourceMessage(data.sourceChatId, data.sourceMessageId);
    if (existing) return existing;
    
    return this.prisma.carListing.create({ data });
  }
}

// mtproto-mapping.service.ts (UPDATE)
import { CarListingRepository } from '../../repositories/carListing.repository.js';
const carRepo = new CarListingRepository(prisma);

// Line 225: Replace prisma.carListing.create with:
await carRepo.createListing({ ... });
```

#### DoD
- [ ] CarListingRepository created
- [ ] mtproto-mapping.service.ts uses repository
- [ ] No regressions (import still works)

---

### M5: MTProto File Download Worker
**Priority:** P1  
**Effort:** 4h

#### Tasks
1️⃣ **Extract File IDs from Messages**
```typescript
// mtproto.service.ts:syncChannel
// When processing message with photos:
const photoFileIds = message.media?.photo ? [message.media.photo.id] : [];

// Pass to processParsedMessage
await processParsedMessage({
  // ...
  mediaFileIds: photoFileIds  // New field
}, channelSource);
```

2️⃣ **Create Media Download Worker**
```typescript
// workers/mediaDownload.worker.ts
export class MediaDownloadWorker {
  async downloadTelegramFile(fileId: string, botToken: string) {
    // 1. Get file path via Bot API
    const fileInfo = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const { file_path } = await fileInfo.json();
    
    // 2. Download file
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${file_path}`;
    const fileBuffer = await fetch(fileUrl).then(r => r.arrayBuffer());
    
    // 3. Upload to S3/CloudFlare R2
    const s3Url = await uploadToStorage(fileBuffer, `telegram/${fileId}.jpg`);
    
    return s3Url;
  }
}
```

3️⃣ **Queue Download Jobs**
```typescript
// mtproto-mapping.service.ts:processParsedMessage
// After creating CarListing:
if (message.mediaFileIds?.length) {
  await prisma.mediaJob.create({
    data: {
      type: 'DOWNLOAD_TELEGRAM_FILE',
      payload: {
        fileIds: message.mediaFileIds,
        carListingId: carListing.id
      }
    }
  });
}
```

#### DoD
- [ ] Worker downloads files from Telegram
- [ ] Files uploaded to object storage
- [ ] CarListing.thumbnail updated with real URL
- [ ] UI displays images

---

### M6: Add "Import by Period" UI Control
**Priority:** P1  
**Effort:** 2h (frontend)

#### Tasks
1️⃣ **Add Date Range Picker to Channel Settings**
```tsx
// apps/web/components/MTProto/ChannelSettings.tsx
<DateRangePicker
  label="Import Period"
  onChange={(from, to) => setImportPeriod({ from, to })}
/>
```

2️⃣ **Update Sync Endpoint**
```typescript
// mtproto.routes.ts
router.post('/channels/:id/sync', async (req, res) => {
  const { fromDate, toDate, maxMessages } = req.body;
  
  await MTProtoService.syncChannel(connectorId, channelId, {
    fromDate: fromDate ? new Date(fromDate) : undefined,
    toDate: toDate ? new Date(toDate) : undefined,
    maxMessages: maxMessages || 1000
  });
  
  res.json({ ok: true });
});
```

3️⃣ **Update mtproto.service.ts::syncChannel**
```typescript
// Add offset_date param to Telegram API call
const history = await client.invoke(new Api.messages.GetHistory({
  peer: channel,
  offset_date: options?.fromDate ? Math.floor(options.fromDate.getTime() / 1000) : undefined,
  limit: 100
}));

// Filter by toDate
const messages = history.messages.filter(msg => {
  const msgDate = new Date(msg.date * 1000);
  if (options?.toDate && msgDate > options.toDate) return false;
  return true;
});
```

#### DoD
- [ ] UI has date range picker
- [ ] API accepts fromDate/toDate params
- [ ] Sync imports only messages in date range
- [ ] Test: import Jan 2024 posts → only Jan posts created

---

## 📌 P2 Tasks (Nice-to-Have)

### M7: Event-Driven Integrations
**Priority:** P2  
**Effort:** 2h

**Goal:** Remove direct MetaService/SendPulseService calls from leadService.

**See:** `30_CODE_STRUCTURE_AUDIT.md` → P2 Refactor section.

---

### M8: Remove ScenarioEngine Fallback
**Priority:** P2  
**Effort:** 30min (after bot migration)

**Prerequisite:** All bots migrated to `template`-based routing.

**See:** `30_CODE_STRUCTURE_AUDIT.md` → P1 Refactor section.

---

## 📋 Definition of Done (Stage-1)

### Client Onboarding
- [x] Bot webhook → Inbox/Leads works
- [ ] **P0-1:** Leads have `telegramName`/`telegramUsername` in payload
- [ ] **P0-2:** MTProto channel import tested + working
- [ ] **P0-3:** No duplicate entities from dual pipeline

### Infrastructure
- [x] Containers survive restart
- [x] Health endpoint green
- [x] Scheduler runs (sync_telegram_channels every 15min)

### Data Integrity
- [ ] **P0-1:** Lead dedup by `companyId + (telegramUserId || telegramChatId)`
- [ ] **P0-2:** CarListing dedup by `sourceChatId + sourceMessageId`
- [ ] No orphaned records

### Diagnostics
- [x] `/api/health` returns build SHA, uptime, DB latency
- [ ] Logs show clear error context (botId, chatId, updateType)
- [ ] Admin can see channel sync status in UI (P1)

---

## 📊 Quick Verification Commands (Copy-Paste)

### 1. Health Check
```bash
curl -fsS https://cartie2.umanoff-analytics.space/api/health | jq '.'
```

**Expected:**
```json
{
  "status": "ok",
  "build": { "buildSha": "caf2a1b..." },
  "database": { "status": "connected", "latency_ms": 1 },
  "bots": { "activeCount": 1 }
}
```

---

### 2. TG Webhook Smoke Test
```bash
# Send test webhook (replace with real bot token and secret)
curl -X POST https://cartie2.umanoff-analytics.space/api/telegram/webhook/cmkz42m4n0001iq3sxpbhq4ey \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: <secret>" \
  -d '{
    "update_id": 999999,
    "message": {
      "message_id": 1,
      "from": {
        "id": 123456789,
        "first_name": "Test",
        "last_name": "User",
        "username": "testuser"
      },
      "chat": { "id": 123456789, "type": "private" },
      "text": "/start"
    }
  }'
```

**Expected:** 200 OK

```bash
# Check lead created
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT id, \"clientName\", payload::jsonb->'telegramUsername', payload::jsonb->'telegramName'
  FROM \"Lead\"
  WHERE \"createdAt\" > NOW() - INTERVAL '10 minutes'
  ORDER BY \"createdAt\" DESC
  LIMIT 1;
"
```

**Expected:** New lead with `telegramUsername` and `telegramName` populated.

---

### 3. MTProto Sync Test
```bash
# Trigger sync (replace with real channel source ID)
curl -X POST http://localhost:3002/api/integrations/mtproto/channels/<channel-source-id>/sync \
  -H "Authorization: Bearer <admin-token>"
```

**Check results:**
```sql
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT COUNT(*) FROM \"CarListing\" WHERE source='MTPROTO';
"
```

**Expected:** Count > 0

---

### 4. DB Sanity Check (Dedup / Lead Names)
```bash
# Check leads without TG identity
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT COUNT(*) AS missing_identity
  FROM \"Lead\"
  WHERE payload::jsonb->>'telegramUsername' IS NULL
    AND payload::jsonb->>'telegramName' IS NULL
    AND (payload::jsonb->>'telegramChatId' IS NOT NULL OR payload::jsonb->>'telegramUserId' IS NOT NULL);
"
```

**Expected:** 0 (after P0-1 fix)

```bash
# Check for duplicate CarListings from same message
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
  SELECT sourceChatId, sourceMessageId, COUNT(*) as count
  FROM \"CarListing\"
  WHERE sourceChatId IS NOT NULL
  GROUP BY sourceChatId, sourceMessageId
  HAVING COUNT(*) > 1;
"
```

**Expected:** 0 rows (no duplicates)

---

### 5. Compose Status
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**Expected:**
```
NAMES          STATUS                  PORTS
infra2-web-1   Up X hours (healthy)   127.0.0.1:8082->8080/tcp
infra2-api-1   Up X hours (healthy)   127.0.0.1:3002->3001/tcp
infra2-db-1    Up X hours (healthy)   127.0.0.1:5433->5432/tcp
```

---

## 🎯 Execution Order (Recommended)

| Milestone | Task | Priority | Effort | Blocking? |
|-----------|------|----------|--------|-----------|
| M1 | Fix Lead TG Identity | P0 | 1-2h | YES |
| M2 | Test MTProto Import | P0 | 2-3h | YES |
| M3 | Resolve Dual Pipeline | P0 | 3-4h | YES |
| M4 | CarListingRepository | P1 | 1h | No |
| M5 | File Download Worker | P1 | 4h | No |
| M6 | Import Period UI | P1 | 2h | No |
| M7 | Event-Driven Integrations | P2 | 2h | No |
| M8 | Remove ScenarioEngine | P2 | 30min | No |

**Total Critical Path (M1-M3):** 6-9 hours  
**Total P0+P1:** 14-16 hours

---

## 📌 Final Checklist (Before Client Demo)

- [ ] All P0 tasks completed (M1-M3)
- [ ] Quick verification commands all pass
- [ ] No errors in last 100 log lines
- [ ] At least 1 real channel synced successfully
- [ ] At least 1 real lead created with TG identity
- [ ] Documentation updated (`40_TG_CHANNELS_INGESTION.md`)
- [ ] Team walkthrough completed (demo to PM/QA)

**Status Gate:** Stage-1 ready = ALL P0 tasks GREEN ✅
