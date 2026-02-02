# Code Structure Audit (P1)

**Date:** 2026-01-30  
**Scope:** Module boundaries, thin routes, owner-of-data, duplicate pipelines  
**Methodology:** Static analysis of imports, service layers, route handlers

---

## 📌 Module Map (Source of Truth)

### Backend Structure (`apps/server/src`)

```
modules/
├── Communication/
│   ├── telegram/
│   │   ├── core/
│   │   │   ├── telegram.routes.ts        [ENTRY] Webhook endpoint
│   │   │   ├── leadService.ts            [LOGIC] Lead create/merge
│   │   │   ├── types.ts                  [CONTRACT] PipelineContext
│   │   │   └── events/eventEmitter.ts    [EVENT] Platform events
│   │   ├── scenarios/
│   │   │   ├── pipeline.ts               [ORCHESTRATOR] Middleware chain
│   │   │   └── middlewares/              [MIDDLEWARE] dedup, enrichContext, normalize
│   │   ├── routing/
│   │   │   ├── routeMessage.ts           [HANDLER] Message flows (CLIENT_LEAD, CATALOG, B2B)
│   │   │   ├── routeWebApp.ts            [HANDLER] Mini app submissions
│   │   │   ├── routeCallback.ts          [HANDLER] Inline button callbacks
│   │   │   ├── routeChannelPost.ts       [HANDLER] Channel posts → Draft
│   │   │   ├── routeInline.ts            [HANDLER] Inline queries
│   │   │   └── routeMyChatMember.ts      [HANDLER] Bot add/remove
│   │   └── messaging/outbox/
│   │       └── telegramOutbox.ts         [OUTBOUND] Send TG messages
│   └── bots/
│       └── scenario.engine.ts            [LEGACY] Flow-based scenarios (being replaced)
├── Integrations/
│   ├── mtproto/
│   │   ├── mtproto.routes.ts             [ENTRY] MTProto API
│   │   ├── mtproto.service.ts            [LOGIC] TelegramClient wrapper
│   │   ├── mtproto.worker.ts             [WORKER] Scheduled sync job
│   │   └── mtproto.lifecycle.ts          [LIFECYCLE] Client connect/disconnect
│   ├── meta/
│   │   └── meta.service.ts               [INTEGRATION] Meta CAPI events
│   └── sendpulse/
│       └── sendpulse.service.ts          [INTEGRATION] Email marketing
├── Inventory/
│   ├── normalization/                    [UTILITY] Brand/model/city normalization
│   └── [routes/services]                 [CRUD] CarListing management
├── Content/
│   └── [Draft, Calendar modules]         [PUBLISHING] Content scheduling
└── Core/
    ├── templates/                        [TEMPLATE] Message templates
    └── [Workspace, User, Settings]       [FOUNDATION] Platform core

services/
├── prisma.js                             [DATA] Prisma client singleton
├── mtproto-mapping.service.ts            [MAPPER] TG message → CarListing
├── dto.js                                [TRANSFORM] Request/Lead mapping
├── cardRenderer.js                       [FORMATTER] Lead/Request cards
└── taxonomy.js                           [ML] Brand detection

repositories/
├── bot.repository.ts                     [DATA] BotConfig CRUD
├── lead.repository.ts                    [DATA] Lead CRUD + dedup
├── request.repository.ts                 [DATA] Request CRUD
├── workspace.repository.ts               [DATA] Workspace CRUD
└── user.repository.ts                    [DATA] User CRUD
```

---

## ✅ Thin Routes Validation

### Rule Requirement
> "Роуты должны быть тонкими: только парсинг req, вызов сервиса, возврат res"

### Audit Results

#### ✅ PASS: `telegram.routes.ts` (43 lines)
```typescript
router.post('/webhook/:botId', async (req, res) => {
  const { botId } = req.params;
  const secretToken = req.header('X-Telegram-Bot-Api-Secret-Token') || null;
  const bot = await botRepo.findById(botId);  // 1. Resolve bot
  if (!bot || !bot.isEnabled) {
    return errorResponse(res, 404, 'Bot not found', 'BOT_NOT_FOUND');
  }
  const expected = (bot.config as any)?.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || expected !== secretToken) {  // 2. Validate secret
    return errorResponse(res, 403, 'Forbidden', 'BOT_SECRET_INVALID');
  }
  res.status(200).json({ ok: true });  // 3. Return 200 immediately
  setImmediate(async () => {
    await runTelegramPipeline({ update: req.body, bot, botId, secretToken, source: 'webhook' });  // 4. Delegate to pipeline
  });
});
```

**Assessment:** ✅ Thin — no business logic, delegates to `pipeline.ts`.

---

#### ⚠️ ACCEPTABLE: `routeMessage.ts` (854 lines)
**Contains:** State machine handlers for CLIENT_LEAD, CATALOG, B2B flows.

**Why not "thin"?**
- Lines 126-666: `handleClientLead`, `handleCatalog`, `handleB2B` are state handlers
- These are UI flow orchestrators, not route handlers

**Technically:** These are HANDLERS (called by pipeline), not routes (HTTP endpoints).

**Verdict:** ✅ ACCEPTABLE — separation correct (route → pipeline → handler → service).

---

## 📌 Owner of Data (No Duplicate Merge Logic)

### Rule: Repository Pattern
> "Каждая сущность имеет репозиторий, вся логика работы с БД — там"

### Audit Results

#### ✅ PASS: LeadRepository
**Location:** `repositories/lead.repository.ts`

**Methods:**
```typescript
- createLead(data)
- findById(id)
- findDuplicate(scope, criteria)  // Dedup logic HERE, not in service ✅
- updatePayload(id, payload)
- findByPhone(phone)
```

**Validation:** No `prisma.lead.create()` in `leadService.ts`, only `leadRepo.createLead()` ✅

---

#### ⚠️ VIOLATION: CarListing Direct Create
**Location:** `mtproto-mapping.service.ts:225-251`

```typescript
await prisma.carListing.create({  // ❌ Direct Prisma call, should use CarListingRepository
  data: { ... }
});
```

**Assessment:** P1 refactor — create `CarListingRepository`.

**Impact:** Low (code works, just violates pattern).

---

## 🔴 Duplicate Pipelines (Two Truths)

### Problem: Channel Posts
**Already documented in `10_TELEGRAM_BOTAPI_AUDIT.md` P0-3.**

**Summary:**
- `routeChannelPost.ts` → Draft
- `mtproto-mapping.service.ts` → CarListing
- No cross-pipeline dedup

---

### Problem: Lead Creation Paths (Minor)
**Multiple callers:**
1. `routeMessage.ts::finalizeClientLead`
2. `routeMessage.ts::finalizeCatalogSell`
3. `routeWebApp.ts`
4. (potentially) `routeCallback.ts` for confirmations

**All call:** `createOrMergeLead` ✅

**Verdict:** ✅ SINGLE TRUTH — all paths converge to one service.

---

## 📌 Legacy vs v4.1 (No "Double Truth" Found)

### Investigation
**Checked:** Prisma migrations, code comments for "legacy" / "v4" / "deprecated".

**Findings:**
1️⃣ `scenario.engine.ts` marked as [LEGACY] in code (line 12: "Old flow-based system")
2️⃣ New routing (`routeMessage.ts`) co-exists with Scenario Engine
3️⃣ **Current flow:** Routing tries new handlers first, falls back to ScenarioEngine

**Code:**
```typescript
// routeMessage.ts:671
const handledScenario = await ScenarioEngine.handleUpdate(ctx.bot, ctx.session, ctx.update).catch(() => false);
if (handledScenario) return true;  // If old scenario handled it, stop

// Otherwise, use new template-based routing
if (ctx.bot.template === 'CLIENT_LEAD') return handleClientLead(ctx, text);
```

**Assessment:** ✅ NO DUAL WRITE — one data path (ScenarioEngine OR new routing, not both).

**P1 Task:** Remove ScenarioEngine after all bots migrated to templates.

---

## 📌 Tight Coupling Analysis

### Coupling Graph (High-Level)
```
telegram.routes.ts
  → runTelegramPipeline
    → pipeline middlewares
      → routeMessage / routeWebApp / routeCallback
        → leadService.createOrMergeLead
          → leadRepo.createLead / findDuplicate
            → prisma.lead

mtproto.service.ts
  → syncChannel
    → processParsedMessage (mtproto-mapping.service.ts)
      → prisma.carListing.create  ❌ Should use CarListingRepository
```

**Issues:**
1️⃣ **mtproto-mapping.service.ts** directly calls Prisma (violates repository pattern) → P1 fix
2️⃣ **leadService.ts** imports MetaService, SendPulseService (side effects in domain logic) → ⚠️ Acceptable for now

---

## 📌 Module Boundaries (Enforceability)

### Clear Boundaries ✅
```
Communication (Telegram) → Integrations (MTProto) ✅ No cross-imports
Communication → Inventory (normalization utils) ✅ One-way dependency
Communication → Core (leadService → Workspace/BotConfig) ✅ Top-down
```

### Leaky Abstractions ⚠️
```
leadService.ts imports:
- MetaService (Integrations/meta) ✅ OK (platform event)
- SendPulseService (Integrations/sendpulse) ⚠️ Should be event-driven

Current: leadService directly calls SendPulseService.syncContact()
Better: Emit 'lead.created' event → SendPulseWorker subscribes
```

**Impact:** Low (works), but harder to test leadService in isolation.

**P2 Refactor:** Move integration calls to event handlers.

---

## ✅ Code Structure Summary

| Aspect | Status | Issues | Priority |
|--------|--------|--------|----------|
| Thin routes | GREEN ✅ | None | - |
| Repository pattern | YELLOW ⚠️ | CarListing direct Prisma | P1 |
| Module boundaries | GREEN ✅ | Minor coupling in leadService | P2 |
| Duplicate pipelines | YELLOW ⚠️ | Channel Post (P0-3) | P0 |
| Legacy vs v4.1 | GREEN ✅ | ScenarioEngine fallback | P1 (cleanup) |
| Owner of data | GREEN ✅ | Clear ownership | - |

**Overall:** 🟢 GREEN — Architecture is sound, minor refactors needed

---

## 📋 Minimal Refactor Suggestions

### P1: Create CarListingRepository
**Why:** Consolidate all CarListing CRUD + dedup logic.

**Changes:**
```typescript
// repositories/carListing.repository.ts (NEW)
export class CarListingRepository {
  async createListing(data: CreateCarListingInput) {
    // Dedup by sourceChatId + sourceMessageId
    const existing = await prisma.carListing.findFirst({
      where: {
        sourceChatId: data.sourceChatId,
        sourceMessageId: data.sourceMessageId
      }
    });
    if (existing) return existing;
    
    return prisma.carListing.create({ data });
  }
}

// mtproto-mapping.service.ts (UPDATED)
import { CarListingRepository } from '../../repositories/carListing.repository.js';
const carRepo = new CarListingRepository(prisma);

// Line 225: Replace prisma.carListing.create with:
await carRepo.createListing({ ... });
```

**Effort:** 1h  
**Impact:** Better testability, enforces dedup pattern

---

### P2: Event-Driven Integrations
**Why:** Remove direct coupling from leadService to MetaService/SendPulseService.

**Changes:**
```typescript
// leadService.ts (UPDATED)
// Remove MetaService.sendEvent(), SendPulseService.syncContact() calls
// Keep only: emitPlatformEvent({ eventType: 'lead.created', ... })

// integrations/meta/meta.worker.ts (NEW)
eventBus.on('lead.created', async (payload) => {
  await MetaService.getInstance().sendEvent('Lead', { ... });
});

// integrations/sendpulse/sendpulse.worker.ts (NEW)
eventBus.on('lead.created', async (payload) => {
  await SendPulseService.getInstance().syncContact({ ... });
});
```

**Effort:** 2h  
**Impact:** Cleaner separation, easier to add new integrations

---

### P1: Remove ScenarioEngine Fallback
**Why:** Simplify routing, remove legacy code path.

**Prerequisite:** Migrate all bots to `template` field (CLIENT_LEAD, CATALOG, B2B).

**Changes:**
```typescript
// routeMessage.ts (UPDATED)
// Line 671: Remove ScenarioEngine.handleUpdate fallback
export const routeMessage = async (ctx: PipelineContext) => {
  if (!ctx.bot || !ctx.session) return false;
  
  // No scenario fallback, only template routing
  const message = ctx.update?.message;
  const text = message?.text || '';
  
  if (ctx.bot.template === 'CLIENT_LEAD') return handleClientLead(ctx, text);
  if (ctx.bot.template === 'CATALOG') return handleCatalog(ctx, text);
  if (ctx.bot.template === 'B2B') return handleB2B(ctx, text);
  
  return false;
};
```

**Effort:** 30min (after migration completed)  
**Impact:** Reduces code complexity, removes dual logic path

---

## 📌 Files Requiring Attention

### P0 (Blocking Stage-1)
- `apps/server/src/modules/Communication/telegram/core/leadService.ts` → Fix payload save (P0-1)
- `apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts` → Resolve dual pipeline (P0-3)

### P1 (Post-Stage-1 Cleanup)
- `apps/server/src/services/mtproto-mapping.service.ts` → Add CarListingRepository
- `apps/server/src/modules/Communication/bots/scenario.engine.ts` → Remove fallback

### P2 (Future Refactor)
- `apps/server/src/modules/Communication/telegram/core/leadService.ts` → Event-driven integrations
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts` → Split into smaller handlers

**Total Refactor Effort:** ~5-6 hours (P1+P2 combined)
