# PHASE 2: PERFORMANCE ANALYSIS

**Date**: 2026-01-27  
**Audit Phase**: 2 of 10  
**Repository**: `/srv/cartie`

---

## EXECUTIVE SUMMARY

This phase analyzes performance characteristics of the Cartie platform, identifying bottlenecks, optimization opportunities, and baseline metrics for future improvements.

### Performance Score: **6.0/10**

**Key Findings**:
- ⚠️ Frontend bundle: **1.5MB** (single JS file) - needs code splitting
- ⚠️ Largest backend file: **1,636 LOC** (`scenario.engine.ts`) - complexity risk
- ⚠️ Monolithic `apiRoutes.ts`: **1,283 LOC** - should be modularized
- ⚠️ **45 `findMany` queries** - potential N+1 query risks
- ⚠️ **28 `include:` statements** - eager loading may impact performance
- ✅ Dual-write v4.1 flag enabled but reads controlled
- ⚠️ No query performance monitoring detected

---

## 1. FRONTEND PERFORMANCE

### 1.1 Bundle Size Analysis

**Production Build**: `apps/web/dist`

| Metric | Value | Status | Target |
|--------|-------|--------|--------|
| **Total Bundle Size** | 1.6 MB | ⚠️ Large | <1 MB |
| **Main JS Bundle** | 1.5 MB | ⚠️ Large | <500 KB |
| **Code Splitting** | No | ❌ Missing | Yes |
| **Lazy Loading** | Limited | ⚠️ Partial | Full |


**Critical Issue**: Single monolithic JavaScript bundle (`index-qHz2QeCS.js` = 1.5MB)

**Impact**:
- Slow initial page load (3-5s on 3G)
- Poor Time to Interactive (TTI)
-Likely fails Core Web Vitals (LCP, FID, CLS)
- High memory usage on mobile devices

**Recommendation**: Implement route-based code splitting (see Section 6.1)

### 1.2 Largest Frontend Files

**Top 10 Largest Components**:

| File | LOC | Status | Recommendation |
|------|-----|--------|----------------|
| ContentCalendar.tsx | 764 | ⚠️ Very Large | Split into sub-components |
| MiniApp.tsx | 715 | ⚠️ Very Large | Extract logic to hooks/services |
| Inventory.tsx | 691 | ⚠️ Very Large | Split into filters, list, modal components |
| Settings.tsx | 571 | ⚠️ Large | Extract sections to separate pages |
| Content.tsx | 486 | ⚠️ Large | Split Editor/List views |
| Search.tsx | 477 | ⚠️ Large | Extract filter logic |
| Requests.tsx | 430 | ✅ Acceptable | Monitor growth |
| MTProtoManager.tsx | 420 | ⚠️ Large | Extract connection logic |
| Inbox.tsx | 366 | ✅ Acceptable | - |
| CompanySettings.tsx | 347 | ✅ Acceptable | - |

**Metrics**:
- **Files >500 LOC**: 4 files (11% of pages)
- **Files >400 LOC**: 8 files (23% of pages)
- **Average Page Size**: ~388 LOC

**Risk**: Large components are harder to maintain, test, and may cause unnecessary re-renders.

### 1.3 Frontend Dependencies Impact

**Heavy Dependencies** (estimated impact on bundle):

| Package | Size (est.) | Usage | Optimization |
|---------|-------------|-------|--------------|
| react-dom | ~130 KB | Core | None |
| framer-motion | ~50 KB | Animations | Tree-shake unused features |
| recharts | ~200 KB | Charts | Lazy load |
| reactflow | ~150 KB | Flow diagrams | Lazy load |
| lexical + plugins | ~200 KB | Rich text | Lazy load |
| axios | ~13 KB | HTTP | ✅ Small |
| lucide-react | ~50 KB | Icons | Tree-shake unused icons |

**Total Estimated**: ~793 KB (before app code)

**Recommendation**: 
- Lazy load charts (`recharts`) only on Dashboard
- Lazy load flow editor (`reactflow`) only on Scenarios page
- Lazy load rich text (`lexical`) only when editing content

### 1.4 Core Web Vitals (Estimated)

*Note: Actual measurement requires browser testing*

| Metric | Estimated | Target | Status |
|--------|-----------|--------|--------|
| **LCP** (Largest Contentful Paint) | ~3.5s | <2.5s | ⚠️ Likely  fail |
| **FID** (First Input Delay) | ~150ms | <100ms | ⚠️ Borderline |
| **CLS** (Cumulative Layout Shift) | Unknown | <0.1 | ? |
| **TTFB** (Time to First Byte) | ~200ms | <600ms | ✅ Good |

**Recommendation**: Run Lighthouse audit and add performance monitoring (see Phase 7).

---

## 2. BACKEND PERFORMANCE

### 2.1 Largest Backend Files

**Top 10 Largest TypeScript Files**:

| File | LOC | Status | Issue |
|------|-----|--------|-------|
| scenario.engine.ts | 1,636 | ❌ Critical | Monolithic engine, hard to test |
| apiRoutes.ts | 1,283 | ❌ Critical | God object anti-pattern |
| routeMessage.ts | 843 | ⚠️ Very Large | Complex message routing |
| bot.service.ts | 508 | ⚠️ Large | Extract sub-services |
| requests.routes.ts | 398 | ✅ Acceptable | Well-structured |
| dto.ts | 326 | ✅ Acceptable | Type definitions (expected) |
| readService.ts (v41) | 320 | ✅ Acceptable | Dual-read logic |
| integration.service.ts | 311 | ✅ Acceptable | Multiple integrations |
| seedTemplates.ts | 308 | ✅ Acceptable | Seed data (expected large) |
| entityRoutes.ts | 305 | ✅ Acceptable | Dynamic entities |

**Critical Issues**:

1. **scenario.engine.ts (1,636 LOC)** ❌
   - Single responsibility principle violation
   - Hard to unit test
   - Difficult to extend with new node types
   - **Recommendation**: Extract node handlers to separate files

2. **apiRoutes.ts (1,283 LOC)** ❌
   - Violates vertical slice architecture
   - Mixes multiple concerns (bots, leads, drafts, scenarios, messages)
   - Should be split into module-specific route files
   - **Recommendation**: Migrate routes to respective modules

3. **routeMessage.ts (843 LOC)** ⚠️
   - Complex conditional logic
   - May have performance impact on high message volumes
   - **Recommendation**: Profile under load, consider state machine pattern

### 2.2 Database Query Patterns

**Query Statistics**:

| Query Type | Count | Risk Level | Notes |
|------------|-------|------------|-------|
| `findMany` | 45 | ⚠️ Moderate | Potential N+1 queries |
| `include:` | 28 | ⚠️ Moderate | Eager loading (can be slow) |
| `prisma.*` (total direct calls) | 375+ | ⚠️ High | Should use repositories |

**Analysis**:

1. **Direct Prisma Calls (375+)**:
   - Found primarily in `apiRoutes.ts` (200+ calls)
   - Violates repository pattern
   - Hard to optimize, mock, or cache
   - **Recommendation**: Complete migration to repository layer (currently ~80%)

2. **`findMany` Queries (45 instances)**:
   - Risk of N+1 queries (fetching in loops)
   - No pagination detected in some endpoints
   - **Examples to audit**:
     - `botMessage.findMany` (message history)
     - `lead.findMany` (lead listing)
     - `scenario.findMany` (scenario lookup)
   - **Recommendation**: Add pagination, limit defaults, use cursor-based pagination

3. **`include:` Statements (28 instances)**:
   - Eager loading can fetch unnecessary data
   - May load large related collections
   - **Recommendation**: Use `select` for specific fields, profile slow queries

### 2.3 Database Indexing

**Schema Analysis** (`prisma/schema.prisma`):

**Indexed Fields** (detected `@@index` directives):
- Need to manually count in Phase 6 detailed audit

**Potential Missing Indexes** (high-traffic queries):
- `Lead.createdAt` (for sorting recent leads)
- `BotMessage.chatId` (for message history lookup)
- `CarListing.status` (for inventory filtering)
- `B2bRequest.status` (for request filtering)
- `Scenario.companyId` (for multi-tenant queries)

**Recommendation**: Enable Prisma query logging and analyze slow queries (>100ms).

### 2.4 API Response Time (Baseline)

*Note: Requires runtime profiling with actual load*

**Estimated Response Times** (based on code complexity):

| Endpoint Category | Estimated Time | Complexity |
|-------------------|----------------|------------|
| **Simple CRUD** (e.g., GET /bots) | <50ms | Low |
| **List with filters** (e.g., GET /leads) | 100-300ms | Medium |
| **Scenario execution** (POST /telegram/webhook) | 200-500ms | High |
| **MTProto operations** (channel parsing) | 1-3s | Very High |
| **Dual-write operations** (v4.1 enabled) | +20-50ms | Medium |

**Concerns**:
- No response time SLAs defined
- No performance monitoring (APM) detected
- No rate limiting on expensive endpoints

**Recommendation**:
1. Add middleware to log response times
2. Set SLA targets (e.g., 95th percentile <200ms)
3. Add APM tool (e.g., Prisma Accelerate, New Relic, DataDog)

### 2.5 Memory & CPU Concerns

**Potential Issues**:

1. **MTProto In-Memory Clients**:
   - `mtproto.service.ts` stores clients in `Map<string, TelegramClient>`
   - Risk: Memory leak if clients not cleaned up
   - Risk: Lost connections on server restart
   - **Recommendation**: Persist sessions, implement cleanup timeout

2. **Scenario Engine Execution**:
   - `scenario.engine.ts` (1,636 LOC) runs synchronously
   - Complex scenarios may block event loop
   - **Recommendation**: Move to worker queue (BullMQ)

3. **Large File Uploads** (if any):
   - No streaming detected
   - Risk: High memory usage for image/video uploads
   - **Recommendation**: Use streaming, multer with disk storage

---

## 3. DATABASE PERFORMANCE

### 3.1 Schema Complexity

**Metrics**:
- **Total Models**: 60
- **Legacy Models**: ~30 (active)
- **v4.1 Models**: ~30 (dual-write enabled but limited use)
- **Total Schema Lines**: 1,393 LOC

**Performance Impact**:

1. **Dual-Write Overhead**:
   - Feature flag `USE_V4_DUAL_WRITE=true`
   - Every write operation hits 2 models (legacy + v4.1)
   - Estimated overhead: **+20-50ms per write**
   - **Impact**: Moderate (acceptable for gradual migration)

2. **Complex Relationships**:
   - Many-to-many relationships (e.g., `Membership`, `EntityRecord`)
   - Nested includes can cause query explosion
   - **Recommendation**: Profile joins, add composite indexes

### 3.2 Migration Performance

**Observations**:
- Prisma migrations run via `npm run prisma:migrate`
- No migration performance issues reported in docs
- **Risk**: Large schema changes may lock tables

**Recommendation**: 
- Test migrations on production-size dataset
- Use `prisma migrate deploy` (zero-downtime)
- Monitor migration duration in CI/CD

### 3.3 Connection Pooling

**Current Config** (from `.env`):
```
DATABASE_URL=postgresql://cartie:***@localhost:5433/cartie_db?schema=public
```

**Missing**:
- `connection_limit` parameter (defaults to 10)
- `pool_timeout` parameter (defaults to 10s)

**Recommendation**:
```
DATABASE_URL=postgresql://...?connection_limit=20&pool_timeout=20
```

Adjust based on concurrent user load.

---

## 4. INTEGRATION PERFORMANCE

### 4.1 External API Calls

**Integrations**:
- **Telegram Bot API**: Webhook/polling + message sending
- **MTProto/GramJS**: Channel parsing (worker-based)
- **Meta CAPI**: Event tracking
- **SendPulse**: Email/SMS
- **Autoria**: Car listing API

**Performance Concerns**:

1. **Synchronous External Calls**:
   - No timeout configuration detected
   - Risk: Hanging requests if external API is slow
   - **Recommendation**: Add `axios` timeout (5-10s), retry logic

2. **No Circuit Breaker**:
   - External API failures may cascade
   - **Recommendation**: Implement circuit breaker pattern (e.g., `opossum`)

3. **MTProto Worker**:
   - `mtproto.worker` runs in separate process (good)
   - No performance metrics tracked
   - **Recommendation**: Add worker health monitoring

### 4.2 Webhook Performance

**Telegram Webhook** (`/api/telegram/webhook`):
- Processes updates synchronously
- Calls `ScenarioEngine` (1,636 LOC) inline
- Risk: Timeout if scenario is complex (>30s)
- **Recommendation**: Return 200 OK immediately, process in background queue

---

## 5. CACHING STRATEGY

### 5.1 Current Caching

**Detected**:
- ❌ No Redis or in-memory cache detected
- ❌ No HTTP caching headers (ETag, Cache-Control)
- ❌ No Prisma query result caching

**Impact**: Every request hits the database, even for static data.

### 5.2 Caching Opportunities

**High-Impact Candidates**:

| Data Type | Endpoint | Cache Duration | Impact |
|-----------|----------|----------------|--------|
| **Scenarios** | GET /scenarios | 15 min | High (rarely change) |
| **Templates** | GET /templates | 1 hour | High (static) |
| **Normalization** Data (car models) | GET /normalization | 1 day | High (reference data) |
| **Bot Configs** | GET /bots | 5 min | Medium (change infrequently) |
| **User Sessions** | Auth middleware | In-memory | High (every request) |

**Recommendation**: Implement Redis caching for above endpoints.

---

## 6. OPTIMIZATION RECOMMENDATIONS

### 6.1 Frontend Optimizations (High Priority)

**1. Implement Code Splitting** (Impact: ⭐⭐⭐⭐⭐)

```tsx
// apps/web/src/App.tsx
import { lazy, Suspense } from 'react';

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Inventory = lazy(() => import('./pages/app/Inventory'));
const Requests = lazy(() => import('./pages/app/Requests'));
// ... repeat for all pages

// Wrap routes:
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    {/* ... */}
  </Routes>
</Suspense>
```

**Expected Result**: Bundle size reduction from 1.5MB → 200-300 KB initial + lazy chunks

**2. Lazy Load Heavy Dependencies** (Impact: ⭐⭐⭐⭐)

```tsx
// Only load recharts on Dashboard
const Charts = lazy(() => import('./components/Charts'));

// Only load reactflow on Scenarios
const FlowEditor = lazy(() => import('./modules/Telegram/flow/ScenarioFlowEditor'));

// Only load lexical on Content pages
const RichTextEditor = lazy(() => import('./components/RichTextEditor'));
```

**Expected Result**: -400 KB from initial bundle

**3. Optimize Lucide Icons** (Impact: ⭐⭐)

```tsx
// Instead of:
import * as Icons from 'lucide-react';

// Use:
import { Home, Settings, User } from 'lucide-react';
```

**Expected Result**: -30 KB from bundle

**4. Add Bundle Analyzer** (Impact: ⭐⭐⭐)

```bash
npm install --save-dev rollup-plugin-visualizer
```

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true, filename: 'dist/stats.html' })
  ]
});
```

### 6.2 Backend Optimizations (High Priority)

**1. Refactor `apiRoutes.ts`** (Impact: ⭐⭐⭐⭐⭐)

Move routes to respective modules:
- Bot routes → `modules/Communication/bots/bots.routes.ts`
- Lead routes → `modules/Sales/leads/leads.routes.ts`
- Draft routes → `modules/Communication/content/drafts.routes.ts`
- Scenario routes → `modules/Communication/scenarios/scenarios.routes.ts`

**Result**: Improved maintainability, better code organization

**2. Complete Repository Pattern Migration** (Impact: ⭐⭐⭐⭐)

CurrentPrisma calls: 375+
- Repository calls: ~80%

**Goal**: 100% repository coverage

**Benefits**:
- Easier to add caching layer
- Better testability
- Centralized query optimization

**3. Add Query Performance Monitoring** (Impact: ⭐⭐⭐⭐⭐)

```typescript
// apps/server/src/services/prisma.ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: [
    { level: 'query', emit: 'event' },
    { level: 'error', emit: 'stdout' },
    { level: 'warn', emit: 'stdout' },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 100) { // Log slow queries
    console.warn(`[SLOW QUERY] ${e.duration}ms: ${e.query}`);
  }
});
```

**Result**: Identify slow queries for optimization

**4. Add Pagination Defaults** (Impact: ⭐⭐⭐)

```typescript
// All findMany calls should have:
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

await prisma.lead.findMany({
  take: Math.min(pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  skip: (page - 1) * pageSize,
  // ...
});
```

**Result**: Prevent accidental full-table scans

**5. Implement Response Time Middleware** (Impact: ⭐⭐⭐⭐)

```typescript
// apps/server/src/middleware/performance.middleware.ts
export const performanceMiddleware = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 200) {
      console.warn(`[SLOW API] ${req.method} ${req.path}: ${duration}ms`);
    }
    // Send to monitoring service (e.g., DataDog)
  });
  next();
};
```

**Result**: Real-time performance visibility

### 6.3 Database Optimizations (Medium Priority)

**1. Add Missing Indexes** (Impact: ⭐⭐⭐⭐)

```prisma
model Lead {
  // ...
  @@index([createdAt])
  @@index([status, companyId])
  @@index([botId, createdAt])
}

model BotMessage {
  // ...
  @@index([chatId, createdAt])
}

model CarListing {
  // ...
  @@index([status, companyId])
  @@index([updatedAt])
}
```

**Result**: Faster filtering and sorting queries

**2. Optimize Dual-Write** (Impact: ⭐⭐)

If v4.1 migration is not proceeding, consider:
- Set `USE_V4_DUAL_WRITE=false`
- Remove v4.1 write overhead

**Result**: -20-50ms per write operation

**3. Enable Prisma Query Caching** (Impact: ⭐⭐⭐)

Consider Prisma Accelerate (paid) or implement custom caching:

```typescript
import NodeCache from 'node-cache';
const queryCache = new NodeCache({ stdTTL: 300 }); // 5 min

export const cachedFindMany = async (model, args, cacheKey) => {
  const cached = queryCache.get(cacheKey);
  if (cached) return cached;
  
  const result = await prisma[model].findMany(args);
  queryCache.set(cacheKey, result);
  return result;
};
```

---

## 7. PERFORMANCE TESTING PLAN

### 7.1 Frontend Testing

**Tools**:
- **Lighthouse CI**: Automated performance testing
- **WebPageTest**: Real-world performance metrics
- **Chrome DevTools**: Manual profiling

**Tests**:
1. **Lighthouse Audit** (all pages)
   - Performance score > 90
   - Accessibility score > 95
   - Best Practices score > 90
   - SEO score > 90

2. **Core Web Vitals**
   - LCP < 2.5s
   - FID < 100ms
   - CLS < 0.1

3. **Bundle Size Tracking**
   - Monitor bundle size in CI/CD
   - Alert if bundle grows > 10%

### 7.2 Backend Testing

**Tools**:
- **Artillery**: Load testing
- **k6**: API performance testing
- **Prisma Studio**: Query analysis

**Tests**:
1. **Load Testing** (simulate 100 concurrent users)
   - API endpoints should handle 100 req/s
   - 95th percentile response time < 200ms
   - Zero errors under normal load

2. **Stress Testing** (simulate 500 concurrent users)
   - Identify breaking point
   - Test graceful degradation
   - Monitor memory/CPU usage

3. **Database Query Profiling**
   - Find queries > 100ms
   - Analyze execution plans
   - Add indexes as needed

### 7.3 Integration Testing

**Tests**:
1. **Telegram Webhook Performance**
   - Process 50 webhooks/second
   - Response time < 100ms (return 200 OK)
   - Background processing < 2s

2. **MTProto Channel Parsing**
   - Parse 1000 messages/hour
   - Memory usage < 500 MB
   - Zero crashes over 24h

---

## 8. BASELINE METRICS (Current State)

### 8.1 Code Metrics

| Category | Metric | Value |
|----------|--------|-------|
| **Backend** | Total LOC | 14,801 |
| | Largest file | 1,636 LOC Engine) |
| | Files > 500 LOC | 4 files |
| | Avg file size | 141 LOC |
| **Frontend** | Total LOC | 19,306 |
| | Largest file | 764 LOC (Calendar) |
| | Files > 500 LOC | 4 files |
| | Avg file size | 175 LOC |

### 8.2 Bundle Metrics

| Metric | Value |
|--------|-------|
| Production build size | 1.6 MB |
| Main JS bundle | 1.5 MB |
| Code splitting | No |
| Lazy loading | Minimal |

### 8.3 Database Metrics

| Metric | Value |
|--------|-------|
| Total models | 60 |
| `findMany` queries | 45 |
| `include:` statements | 28 |
| Direct Prisma calls | 375+ |
| Repository adoption | ~80% |

---

## 9. PRIORITY MATRIX

### 9.1 Quick Wins (1-2 days, High Impact)

1. ✅ Add code splitting (Impact: ⭐⭐⭐⭐⭐)
2. ✅ Lazy load heavy dependencies (Impact: ⭐⭐⭐⭐)
3. ✅ Add query performance logging (Impact: ⭐⭐⭐⭐⭐)
4. ✅ Add response time middleware (Impact: ⭐⭐⭐⭐)
5. ✅ Add pagination defaults (Impact: ⭐⭐⭐)

**Estimated Effort**: 1-2 days  
**Expected Impact**: 50% bundle size reduction, visibility into slow queries

### 9.2 Medium-Term (1-2 weeks, High Impact)

1. ✅ Refactor `apiRoutes.ts` (Impact: ⭐⭐⭐⭐⭐)
2. ✅ Complete repository pattern migration (Impact: ⭐⭐⭐⭐)
3. ✅ Add database indexes (Impact: ⭐⭐⭐⭐)
4. ✅ Implement Redis caching (Impact: ⭐⭐⭐⭐)
5. ✅ Add Lighthouse CI (Impact: ⭐⭐⭐)

**Estimated Effort**: 1-2 weeks  
**Expected Impact**: 30-40% API response time improvement

### 9.3 Long-Term (1-2 months, Strategic)

1. ✅ Refactor Scenario Engine (Impact: ⭐⭐⭐⭐)
2. ✅ Move to background queue (BullMQ) (Impact: ⭐⭐⭐⭐)
3. ✅ Implement APM monitoring (Impact: ⭐⭐⭐⭐⭐)
4. ✅ Split large components (Impact: ⭐⭐⭐)
5. ✅ Optimize v4.1 dual-write OR remove (Impact: ⭐⭐⭐)

**Estimated Effort**: 1-2 months  
**Expected Impact**: Scalable architecture, production-ready monitoring

---

## 10. NEXT STEPS

### Phase 3: Integration Health (Immediate Next)

1. **Audit External APIs** (Days 5-6)
   - Test Telegram Bot API reliability
   - Analyze MTProto client lifecycle
   - Review Meta CAPI, SendPulse integration health
   - Check error handling and retry logic

2. **Security Review of Integrations**
   - Verify API key storage
   - Test webhook signature validation
   - Review OAuth flows (if any)

### Questions for User (Performance)

Before implementing optimizations:

1. **Bundle Size Priority**:
   - Is initial load speed a critical concern?
   - Should we prioritize code splitting immediately?

2. **Database Performance**:
   - Are there any known slow endpoints in production?
   - What is acceptable response time for heavy operations (e.g., report generation)?

3. **Monitoring Tools**:
   - Do you have existing APM tools (New Relic, DataDog, etc.)?
   - Budget for performance monitoring services?

4. **v4.1 Dual-Write**:
   - Is v4.1 migration actively being pursued?
   - If not, should we disable dual-write to improve performance?

---

**Report Prepared by**: Antigravity AI Agent  
**Report Date**: 2026-01-27  
**Next Phase**: Integration Health (Phase 3)  
**Status**: ✅ Performance Analysis Complete
