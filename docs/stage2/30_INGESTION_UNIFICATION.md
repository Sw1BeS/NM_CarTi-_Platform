# M3: Ingestion Unification (Already Implemented ✅)

## Analysis Summary
**Status:** M3 goals are **already achieved** in the current codebase.

## Unified Architecture

### Single Ingestion Service
**File:** `apps/server/src/services/channel-ingestion.service.ts`

Both MTProto and BotAPI use this **unified service** as the single source of truth for:
- Message normalization
- Car data extraction
- Rule application
- Deduplication
- Entity creation (CarListing or Draft)

### Integration Points

#### 1. MTProto Integration
**File:** `apps/server/src/services/mtproto-mapping.service.ts`

```typescript
const normalized = channelIngestionService.normalizeMessage({
    chatId, messageId, text, date,
    mediaUrls, mediaItems, mediaGroupKey,
    channelTitle, sourceUrl,
    sourceType: 'MTPROTO'  // ← Source identifier
});

const result = await channelIngestionService.upsertCarListingOrDraft({
    message: normalized,
    mode: 'INVENTORY',
    channelSource,
    sourceLabel: 'MTPROTO'
});
```

#### 2. BotAPI Integration
**File:** `apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts`

```typescript
const normalized = channelIngestionService.normalizeMessage({
    chatId, messageId, text, date,
    mediaUrls, mediaItems, mediaGroupKey,
    channelTitle, sourceUrl,
    sourceType: 'BOTAPI'  // ← Source identifier
});

const result = await channelIngestionService.upsertCarListingOrDraft({
    message: normalized,
    mode,  // INVENTORY or DRAFT_ONLY based on bot.config.channelMode
    companyId, botId,
    sourceLabel: 'TELEGRAM_CHANNEL'
});
```

## Unified Features

### Deduplication
**Constraint:** `@@unique([sourceChatId, sourceMessageId])` on `CarListing`
- **Both paths** respect this constraint
- Prevent duplicates across MTProto and BotAPI imports from the same channel

### Media Handling
- MTProto: `MTProtoService.extractMediaItems` → Downloads via GramJS
- BotAPI: `saveTelegramBotFile` → Downloads via Bot API
- **Both** produce `MediaItem[]` format consumed by `channelIngestionService`

### Mode Support
- **INVENTORY**: Creates `CarListing` (with dedup)
- **DRAFT_ONLY**: Creates `Draft` (for content calendar)

## Configuration

### MTProto
- Mode: Always `INVENTORY` (or `DRAFT_ONLY` for preview jobs)
- Rules: From `ChannelSource.importRules`

### BotAPI
- Mode: From `BotConfig.channelMode` (defaults to `CONTENT` → `DRAFT_ONLY`)
- Rules: None (direct ingestion, relies on signal detection)

## Verification
✅ **Single service** (`ChannelIngestionService`)  
✅ **Shared dedup** logic (sourceChatId + sourceMessageId)  
✅ **Normalized message** format  
✅ **Mode-aware** (INVENTORY vs DRAFT_ONLY)  
✅ **Source tracking** (sourceType: MTPROTO | BOTAPI)

## Conclusion
**M3 is complete.** No additional unification work is required. The architecture already follows best practices with a single ingestion service handling both paths.
