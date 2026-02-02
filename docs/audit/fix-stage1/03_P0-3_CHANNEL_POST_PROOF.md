# P0-3: Channel Post Pipeline Proof

## 1. Dedup Constraint
**Status:** ✅ ENFORCED
**Schema:** `@@unique([sourceChatId, sourceMessageId])` in `CarListing`.

## 2. Database Integrity Check
**Query:**
```sql
SELECT "sourceChatId", "sourceMessageId", COUNT(*) 
FROM "CarListing" 
GROUP BY "sourceChatId", "sourceMessageId" 
HAVING COUNT(*) > 1;
```
**Result:** `0 rows` (No duplicates).

## 3. Configuration Update
**Status:** ✅ UPDATED
**Command:**
```sql
UPDATE "BotConfig" SET config = jsonb_set(..., '{channelMode}', '"INVENTORY"')
```
**Effect:** New channel posts will be treated as `INVENTORY` (creating CarListing) instead of `CONTENT` (Draft), utilizing the dedup constraint.

## 4. Pipeline Logic
**File:** `src/modules/Communication/telegram/routing/routeChannelPost.ts`
```typescript
const channelMode = (ctx.bot?.config as any)?.channelMode || 'CONTENT';
const mode = channelMode === 'INVENTORY' ? 'INVENTORY' : 'DRAFT_ONLY';
// ...
await channelIngestionService.upsertCarListingOrDraft({ mode, ... });
```
