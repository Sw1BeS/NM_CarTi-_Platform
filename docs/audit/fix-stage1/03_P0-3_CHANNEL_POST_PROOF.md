# P0-3 Dual Pipeline Proof

## 1. Unified Pipeline Logic
- **File:** `src/modules/Communication/telegram/routing/routeChannelPost.ts`
- **Logic:**
  ```typescript
  const channelMode = (ctx.bot?.config as any)?.channelMode || 'CONTENT'; // Defaults to CONTENT
  const mode = channelMode === 'INVENTORY' ? 'INVENTORY' : 'DRAFT_ONLY';
  ```
- **Result:** `INVENTORY` mode creates `CarListing`, `CONTENT` creates `Draft`.

## 2. Bot Configuration
- **Action:** Updated active BotConfig `channelMode` to `INVENTORY`.
```sql
UPDATE "BotConfig"
SET config = jsonb_set(COALESCE(config,'{}'::jsonb), '{channelMode}', '"INVENTORY"')
WHERE id IN (SELECT id FROM "BotConfig" ORDER BY "createdAt" DESC LIMIT 1);
```

## 3. Deduplication (DB Level)
- **Constraint:** `CarListing` has `@@unique([sourceChatId, sourceMessageId])`.
- **Migration:** `npx prisma migrate deploy` executed.
- **Verification:**
  - Duplicate count check returned 0 rows.
  - Unique constraint exists in Schema.

## 4. Entity Separation
- `Draft` implies content planning.
- `CarListing` implies inventory item.
- No more "Auto-Draft" from BotAPI if mode is INVENTORY.
