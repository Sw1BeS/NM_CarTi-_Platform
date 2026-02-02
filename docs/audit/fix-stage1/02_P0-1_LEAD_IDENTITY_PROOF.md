# P0-1: Lead Identity Fix Proof

## 1. Code Logic verified
**File:** `src/modules/Communication/telegram/core/leadService.ts`

```typescript
// Verified implementation of fallback logic
const normalizeLeadName = (input: LeadCreateInput) => {
  const raw = String(input.name || '').trim();
  const telegramName = String(input.telegramName || '').trim();
  if (raw && !isGenericName(raw)) return raw; // Keeps human names
  if (telegramName) return telegramName;      // Falls back to TG Name
  return raw || 'Client';
};

// Verified persistence of TG fields
payload: {
  telegramChatId: input.chatId || undefined,
  telegramUserId: telegramUserId || undefined,
  telegramUsername: input.telegramUsername || undefined,
  telegramName: input.telegramName || undefined  // <--- FIXED
}
```

## 2. Regression Test
**File:** `src/modules/Communication/telegram/core/leadIdentity.test.ts`
Tests added:
- `should persist telegramName and telegramUsername`
- `should fallback to telegramUsername if no name provided`
- `should merge missing tg fields into existing lead`

## 3. Database Validation
Previous leads were missing `telegramName`. New leads created via updated pipeline will populate this field.
SQL Query for ongoing monitoring:
```sql
SELECT id, "clientName", payload->>'telegramName' as tg_name 
FROM "Lead" 
WHERE "createdAt" > NOW() - INTERVAL '1 hour';
```
