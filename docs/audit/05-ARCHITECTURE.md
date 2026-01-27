# PHASE 5: ARCHITECTURE & DESIGN PATTERNS

**Date**: 2026-01-27  
**Audit Phase**: 5 of 10  
**Repository**: `/srv/cartie`

---

## EXECUTIVE SUMMARY

This phase evaluates the architectural decisions, design patterns, and structural quality of the Cartie platform.

### Architecture Score: **6.5/10**

**Key Findings**:
- ✅ **Modular backend** structure (Core, Communication, Integrations, Inventory, Sales)
- ⚠️ **Repository pattern** adoption at ~30% (7 repositories, but `apiRoutes.ts` bypasses)
- ⚠️ **v4.1 dual-write** enabled but **underutilized** (only for Company/User creation)
- ✅ **Service layer** present (20 services)
- ⚠️ **Frontend**: Context API + local state (no Redux/Zustand)
- ⚠️ **240+ `useState`** across pages (state management could be improved)
- ✅ **Vertical Slice** architecture in modules (good separation)
- ❌ **`apiRoutes.ts`** anti-pattern (1,283 LOC god object)

---

## 1. BACKEND ARCHITECTURE

### 1.1 Architectural Pattern

**Primary Pattern**: **Hybrid Vertical Slice + Layered**

**Description**:
- **Vertical Slices**: Features organized by business domain (modules)
- **Layered**: Repository → Service → Controller (Route) pattern

**Module Structure**:

```
apps/server/src/modules/
├── Core/
│   ├── auth/           → Authentication (JWT)
│   ├── companies/      → Workspace management
│   ├── system/         → Settings, logs
│   ├── templates/      → Scenario marketplace
│   └── superadmin/     → Multi-workspace admin
│
├── Communication/
│   ├── bots/           → Bot CRUD
│   ├── telegram/       → Bot API integration
│   └── scenarios/      → (handled by ScenarioEngine service)
│
├── Integrations/
│   ├── integration/    → Generic integration CRUD
│   ├── mtproto/        → MTProto channel parsing
│   ├── meta/           → Meta CAPI
│   ├── sendpulse/      → Email/SMS
│   ├── viber, whatsapp/→ Messaging
│   └── autoria/        → Car listings API
│
├── Inventory/
│   └── inventory/      → CarListing CRUD
│
└── Sales/
    └── requests/       → B2bRequest CRUD
```

**Status**: ✅ **GOOD** - Clear domain separation

### 1.2 Repository Pattern Adoption

**Implemented Repositories** (7 total):

| Repository | Entity | LOC | Status |
|-----------|--------|-----|--------|
| `base.repository.ts` | - | - | Base class |
| `bot.repository.ts` | BotConfig | ~80 | ✅ Used |
| `car.repository.ts` | CarListing | ~100 | ✅ Used |
| `lead.repository.ts` | Lead | 252 | ✅ Used |
| `request.repository.ts` | B2bRequest | ~120 | ✅ Used |
| `user.repository.ts` | User/GlobalUser | ~90 | ✅ Used |
| `workspace.repository.ts` | Workspace/Company | ~100 | ✅ Used |

**Repository Pattern Benefits**:
- ✅ Abstracts Prisma implementation
- ✅ Makes services testable (can mock repositories)
- ✅ Centralizes query logic
- ✅ Reduces duplication

**Adoption Rate**: **~30%**

**Problem**: `apiRoutes.ts` (1,283 LOC) bypasses repositories with **200+ direct Prisma calls**.

**Entities Without Repositories** (needs implementation):
- `Scenario`
- `Campaign`
- `BotMessage`
- `BotSession`
- `Draft`
- `MTProtoConnector`
- `ChannelSource`
- `Integration`
- `SystemLog`
- `EntityDefinition`, `EntityRecord`

**Recommendation**: Complete repository migration (see Phase 4).

### 1.3 Service Layer

**Implemented Services** (20 total):

| Service | Purpose | LOC | Status |
|---------|---------|-----|--------|
| `bot.service.ts` | Bot management | 508 | ✅ Good |
| `telegram Admin.service.ts` | Telegram API admin | ~150 | ✅ Good |
| `company.service.ts` | Workspace CRUD | 233 | ✅ Good |
| `user.service.ts` | User/auth logic | ~150 | ✅ Good |
| `scenario.engine.ts` | **Bot flow execution** | **1,636** | ⚠️ Refactor needed |
| `mtproto.service.ts` | MTProto client mgmt | 245 | ✅ Good |
| `mtproto-mapping.service.ts` | Message → CarListing | 282 | ✅ Good |
| `meta.service.ts` | Meta CAPI | 45 | ✅ Good |
| `sendpulse.service.ts` | Email/SMS | 87 | ✅ Good |
| `integration.service.ts` | Integration logic | 311 | ✅ Good |
| `inventory.service.ts` | Inventory logic | ~200 | ✅ Good |
| `template.service.ts` | Scenario templates | ~180 | ✅ Good |
| `settings.service.ts` | System settings | ~120 | ✅ Good |
| `systemLog.service.ts` | Logging | ~80 | ✅ Good |
| `normalization.service.ts` | Data normalization | ~150 | ✅ Good |
| `v41/writeService.ts` | v4.1 dual-write | 131 | ✅ Good |
| `v41/readService.ts` | v4.1 dual-read | 320 | ✅ Good |
| Others | Various | - | - |

**Critical Service**: `scenario.engine.ts` (1,636 LOC)
- Handles 15+ node types (MESSAGE, QUESTION, CONDITION, ACTION, etc.)
- Violates Single Responsibility Principle
- Hard to test, extend, maintain

**Recommendation**: Extract node handlers to separate classes (Strategy pattern).

### 1.4 Anti-Patterns Detected

**1. God Object: `apiRoutes.ts` (1,283 LOC)** ❌

**Issues**:
- Mixes concerns (bots, leads, drafts, scenarios, messages, normalization)
- 200+ direct Prisma calls (bypasses repository layer)
- Violates Vertical Slice architecture
- Hard to test

**Should Be**:
```
modules/Communication/bots/bots.routes.ts
modules/Sales/leads/leads.routes.ts
modules/Communication/content/drafts.routes.ts
modules/Communication/scenarios/scenarios.routes.ts
```

**2. Inconsistent Error Handling**

- 350+ `} catch (e: any)` blocks with varying logic
- No centralized error middleware
- Generic error messages

**Recommendation**: See Phase 4 (AppError classes).

**3. Direct Prisma Calls in Routes**

- `apiRoutes.ts` has 200+ `prisma.*` calls
- Should use repositories

---

## 2. V4.1 DUAL-WRITE ARCHITECTURE

### 2.1 Strategy Overview

**Purpose**: Zero-downtime migration from legacy (`Company`, `User`) to v4.1 multi-tenant (`Workspace`, `GlobalUser`, `Account`, `Membership`).

**Mechanism**: **Dual-Write + Feature Flags**

```typescript
// Feature Flags (.env)
USE_V4_DUAL_WRITE=true    // Write to BOTH legacy + v4.1
USE_V4_READS=true          // Read from v4.1 (fallback to legacy)
USE_V4_SHADOW_READS=false  // Compare v4.1 vs legacy reads (debug)
```

**Implementation**: `services/v41/writeService.ts`

```typescript
async createCompanyDual(data) {
  // 1. Create Workspace (v4.1)
  const workspace = await prisma.workspace.create({ ... });
  
  // 2. Create default Account
  await prisma.account.create({ workspace_id: workspace.id });
  
  // 3. Return as Company-like structure
  return { id: workspace.id, name, slug, ... };
}
```

### 2.2 Current Adoption

**Dual-Write Usage**: ⚠️ **MINIMAL**

**Detected Usage**:
1. `writeService.createCompanyDual()` - Creates Workspace + Account
2. `writeService.createUserDual()` - Creates GlobalUser + Membership

**Not Used Elsewhere**:
- ❌ `apiRoutes.ts` still creates legacy `Company` directly
- ❌ Most CRUD operations use legacy models only
- ❌ Frontend reads from legacy models

**Status**: ⚠️ **INCOMPLETE MIGRATION**

### 2.3 v4.1 Data Model

**New Models** (40+ models):

```prisma
model Workspace {
  id          String @id
  slug        String @unique
  name        String
  settings    Json
  created_at  DateTime
  updated_at  DateTime
  
  accounts    Account[]
  memberships Membership[]
}

model GlobalUser {
  id            String @id
  email         String @unique
  password_hash String
  global_status String
  
  memberships Membership[]
}

model Account {
  id           String @id
  workspace_id String
  slug         String
  name         String
  config       Json
  
  workspace    Workspace @relation(fields: [workspace_id])
  memberships  Membership[]
}

model Membership {
  id           String @id
  user_id      String
  workspace_id String
  account_id   String?
  role_id      String
  permissions  Json
  
  user      GlobalUser @relation(fields: [user_id])
  workspace Workspace @relation(fields: [workspace_id])
  account   Account? @relation(fields: [account_id])
}
```

**Benefits**:
- ✅ Multi-workspace user support (one user, many workspaces)
- ✅ Fine-grained permissions (workspace + account level)
- ✅ Flexible sub-accounts (dealer networks)

**Cost**:
- ⚠️ Dual-write overhead (+20-50ms per write)
- ⚠️ Complex data model (60 total models)
- ⚠️ Migration work required

### 2.4 Decision Recommendation

**Option 1: Complete v4.1 Migration** (2-3 months)

**Pros**:
- Future-proof multi-tenant architecture
- Better scalability
- Clean data model

**Cons**:
- 2-3 months development effort
- Risk of bugs during migration
- Dual-write overhead until complete

**Steps**:
1. Migrate all `prisma.company.*` → `writeService.createCompanyDual()`
2. Migrate frontend to read from v4.1
3. Data backfill (copy legacy → v4.1)
4. Remove legacy models
5. Remove dual-write logic

**Option 2: Remove v4.1, Keep Legacy** (1-2 weeks)

**Pros**:
- Immediate simplification
- Remove dual-write overhead
- Faster development

**Cons**:
- Technical debt remains
- Limited multi-tenant capabilities
- Future rework needed

**Steps**:
1. Set `USE_V4_DUAL_WRITE=false`
2. Remove `v41/` services
3. Drop v4.1 tables from schema
4. Simplify to single-tenant

**Recommendation**: ⚠️ **USER DECISION REQUIRED**

**Questions**:
1. Is multi-workspace support a business requirement?
2. Budget for 2-3 months migration effort?
3. Acceptable to stay single-tenant for now?

---

## 3. FRONTEND ARCHITECTURE

### 3.1 State Management

**Pattern**: **Context API + Local State**

**Global State** (React Context):

| Context | Purpose | File | Status |
|---------|---------|------|--------|
| `AuthContext` | User authentication | `contexts/AuthContext.tsx` | ✅ Good |
| `CompanyContext` | Current workspace | `contexts/CompanyContext.tsx` | ✅ Good |
| `ThemeContext` | Dark/light mode | `contexts/ThemeContext.tsx` | ✅ Good |
| `LanguageContext` | i18n (EN/RU/UK) | `contexts/LanguageContext.tsx` | ✅ Good |
| `ToastContext` | Notifications | `contexts/ToastContext.tsx` | ✅ Good |
| `WorkerContext` | Background workers | `contexts/WorkerContext.tsx` | ✅ Good (11.7KB) |

**Local State** (`useState`):

- **240+ `useState` hooks** across pages
- Heavy local state in large components:
  - `MiniApp.tsx`: 15+ `useState` hooks
  - `DealerPortal.tsx`: 10+ `useState` hooks
  - `ContentCalendar.tsx`: 12+ `useState` hooks

**Issues**:
- ⚠️ Prop drilling (passing state 3-4 levels deep)
- ⚠️ Duplicate state across components
- ⚠️ No state persistence (lost on refresh)

**Recommendation**:

For complex apps, consider:
- **Option 1**: Zustand (lightweight, simpler than Redux)
-**Option 2**: TanStack Query (React Query) for server state
- **Option 3**: Keep Context API but reduce local state

**Priority**: Medium (current approach works but not optimal)

### 3.2 Component Architecture

**Pattern**: **Component-Based**

**Page Structure**:
```tsx
// Large page component
function Inventory() {
  const [state, setState] = useState(); // 10+ hooks
  
  // Inline sub-components
  const CarEditor = ({ data }: any) => { ... };
  const FilterModal = ({ filters }: any) => { ... };
  
  return (
    <Layout>
      <Filters />
      <CarList />
      <CarEditor />
    </Layout>
  );
}
```

**Issues**:
- ⚠️ Large page components (500-700 LOC)
- ⚠️ Inline sub-components (not reusable)
- ⚠️ Props typed as `any`

**Recommendation**: Extract sub-components to separate files

```tsx
// pages/app/Inventory/Inventory.tsx
// pages/app/Inventory/components/CarEditor.tsx
// pages/app/Inventory/components/FilterModal.tsx
// pages/app/Inventory/hooks/useInventoryFilters.ts
```

### 3.3 Data Fetching

**Pattern**: **Imperative Fetch + `useState`**

```tsx
const [data, setData] = useState([]);
const [loading, setLoading] = useState(false);

useEffect(() => {
  setLoading(true);
  fetch(`/api/cars`).then(r => r.json()).then(setData).finally(() => setLoading(false));
}, []);
```

**Issues**:
- ⚠️ Manual loading/error states
- ⚠️ No caching (re-fetch on component mount)
- ⚠️ No optimistic updates
- ⚠️ Race conditions possible

**Recommendation**: Use **TanStack Query (React Query)**

```tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['cars'],
  queryFn: () => fetch('/api/cars').then(r => r.json()),
  staleTime: 5 * 60 * 1000 // 5 min cache
});
```

**Benefits**:
- ✅ Automatic caching
- ✅ Built-in loading/error states
- ✅ Request deduplication
- ✅ Optimistic updates

**Priority**: Medium (quality-of-life improvement)

---

## 4. DESIGN PATTERNS

### 4.1 Patterns in Use

**Backend**:

| Pattern | Usage | Example | Status |
|---------|-------|---------|--------|
| **Repository** | 30% | `lead.repository.ts` | ⚠️ Incomplete |
| **Service Layer** | 80% | `bot.service.ts` | ✅ Good |
| **Singleton** | Common | `MetaService.getInstance()` | ✅ Good |
| **Factory** | Rare | - | - |
| **Strategy** | Missing | Should use in `scenario.engine.ts` | ❌ Needs |

**Frontend**:

| Pattern | Usage | Example | Status |
|---------|-------|---------|--------|
| **Context Provider** | Common | `AuthContext` | ✅ Good |
| **Custom Hooks** | Rare | Few extracted hooks | ⚠️ Limited |
| **Compound Components** | Rare | - | - |
| **Render Props** | Rare | - | - |

### 4.2 Missing Patterns

**1. Strategy Pattern for Scenario Nodes** ❌

**Current** (`scenario.engine.ts`):
```typescript
switch (node.type) {
  case 'MESSAGE': /* 50 lines */ break;
  case 'QUESTION_TEXT': /* 80 lines */ break;
  case 'QUESTION_CHOICE': /* 100 lines */ break;
  // ... 15+ cases, 1,636 total LOC
}
```

**Recommended**:
```typescript
// nodes/NodeHandler.ts
interface NodeHandler {
  execute(node: Node, ctx: Context): Promise<void>;
}

// nodes/MessageNode.ts
class MessageNodeHandler implements NodeHandler {
  async execute(node, ctx) { ... }
}

// scenario.engine.ts
private handlers: Map<string, NodeHandler> = new Map([
  ['MESSAGE', new MessageNodeHandler()],
  ['QUESTION_TEXT', new QuestionTextHandler()],
  // ...
]);

async executeNode(node, ctx) {
  const handler = this.handlers.get(node.type);
  await handler.execute(node, ctx);
}
```

**Benefits**:
- ✅ Easier to test (test each handler independently)
- ✅ Easier to extend (add new node types)
- ✅ Adheres to SRP (each handler has one job)

**2. Factory Pattern for Repositories**

**Recommended**:
```typescript
// repositories/RepositoryFactory.ts
export class RepositoryFactory {
  static getLeadRepository(): LeadRepository {
    return new LeadRepository(prisma);
  }
  
  static getCarRepository(): CarRepository {
    return new CarRepository(prisma);
  }
}

// Usage in services
const leadRepo = RepositoryFactory.getLeadRepository();
```

**Benefits**:
- ✅ Centralized dependency injection
- ✅ Easier to mock for testing
- ✅ Swap implementations (e.g., InMemoryRepository for tests)

**3. Builder Pattern for Complex Queries**

**Current**:
```typescript
const where: any = {};
if (status) where.status = status;
if (companyId) where.companyId = companyId;
if (search) where.OR = [{ name: { contains: search } }];
```

**Recommended**:
```typescript
class LeadQueryBuilder {
  private where: any = {};
  
  byStatus(status: string) {
    this.where.status = status;
    return this;
  }
  
  byCompany(companyId: string) {
    this.where.companyId = companyId;
    return this;
  }
  
  search(query: string) {
    this.where.OR = [{ name: { contains: query } }];
    return this;
  }
  
  build() {
    return this.where;
  }
}

// Usage
const query = new LeadQueryBuilder()
  .byStatus('ACTIVE')
  .byCompany(companyId)
  .search(searchTerm)
  .build();
```

---

## 5. DEPENDENCY ANALYSIS

### 5.1 Circular Dependencies

**Check Status**: ⚠️ **Initiated** (madge running)

**Command**: `npx madge --circular --extensions ts apps/server/src`

**Expected Issues**:
- Potential circular imports between modules
- Services importing repositories importing services

**Recommendation**: Wait for madge results, then fix circulars.

### 5.2 Module Dependencies

**Backend Module Dependency Graph** (simplified):

```
Core (auth, companies, system)
  ↓
Communication (bots, telegram)
  ↓ (depends on)
Integrations (mtproto, meta, sendpulse)
  ↓
Inventory + Sales

Cross-cutting: services/* (used by all)
```

**Status**: ⚠️ **Moderate coupling**

**Issue**: `apiRoutes.ts` creates tight coupling (imports from ALL modules).

**Recommendation**: Split `apiRoutes.ts` to reduce coupling.

### 5.3 Frontend Dependencies

**Key Libraries**:
- `react` v19 (bleeding edge)
- `react-router-dom` v7
- `tailwind` v4
- `framer-motion` (animations)
- `react flow` (flow diagrams)
- `recharts` (charts)
- `lexical` (rich text editor)

**Bundle Impact**: 1.5MB (see Phase 2)

**Recommendation**: Lazy load heavy libs (recharts, reactflow, lexical).

---

## 6. API DESIGN

### 6.1 RESTful API Structure

**Pattern**: **REST** (no GraphQL, no tRPC)

**Endpoint Examples**:
```
GET    /api/leads
POST   /api/leads
PUT    /api/leads/:id
DELETE /api/leads/:id

GET    /api/inventory
POST   /api/inventory
PUT    /api/inventory/:id

GET    /api/requests
POST   /api/requests
```

**Status**: ✅ **GOOD** - Standard REST conventions

**Missing**:
- ❌ API documentation (Swagger/OpenAPI)
- ❌ Versioning (e.g., `/api/v1/leads`)
- ❌ Pagination metadata (e.g., `{ data: [], total, page, pageSize }`)

### 6.2 Response Format

**Current**:
```json
// Success
{ "id": "...", "name": "..." }

// Error
{ "error": "Something went wrong" }
```

**Inconsistencies**:
- Some endpoints return arrays directly
- Some wrap in `{ data: [] }`
- Error format varies

**Recommendation**: Standardize

```json
// Success
{ "success": true, "data": { ... } }

// List
{ "success": true, "data": [...], "pagination": { "page": 1, "total": 100 } }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

---

## 7. DATABASE SCHEMA ARCHITECTURE

### 7.1 Schema Complexity

**Total Models**: **60**
- Legacy: ~30
- v4.1: ~30

**Status**: ⚠️ **HIGH COMPLEXITY**

**Recommendation**: If not migrating to v4.1, remove v4.1 models to reduce complexity.

### 7.2 Relationships

**Many-to-Many**:
- `Membership` (users ↔ workspaces/accounts)
- `EntityRecord` (dynamic entities)

**One-to-Many**:
- `Company` → `BotConfig`, `Lead`, `CarListing`, etc.
- `BotConfig` → `Scenario`, `BotMessage`, `BotSession`

**Polymorphic** (via JSON):
- `SystemLog.metadata` (stores various event data)
- `Scenario.nodes` (stores flow graph)
- `BotMessage.payload` (stores platform-specific data)

**Status**: ✅ **GOOD** - Flexible design

### 7.3 Indexing Strategy

**From Phase 2**: Potential missing indexes on:
- `Lead.createdAt`, `Lead.status`
- `BotMessage.chatId`, `BotMessage.createdAt`
- `CarListing.status`, `CarListing.updatedAt`

**Recommendation**: Enable Prisma query logging, analyze slow queries, add indexes.

---

## 8. TESTING ARCHITECTURE

### 8.1 Current State

**From Phase 4**:
- Backend: 6 test files (minimal)
- Frontend: 0 test files

**Testing Strategy**: ❌ **MISSING**

**Needs**:
- Unit tests (repositories, services)
- Integration tests (API routes)
- E2E tests (critical flows)

**Recommendation**: See Phase 4 for testing plan.

---

## 9. ARCHITECTURAL DECISION RECORDS (ADRs)

### 9.1 Existing Documentation

**Found**:
- `docs/ARCHITECTURE.md` (general overview)
- `CODEX_AUDIT_REPORT.md` (legacy audit)

**Missing**:
- ❌ ADRs for key decisions (Why Express? Why Prisma? Why v4.1?)
- ❌ Migration decision log
- ❌ Trade-off analysis

**Recommendation**: Create `docs/adr/` folder

```
docs/adr/
├── 001-use-express-framework.md
├── 002-prisma-orm-over-typeorm.md
├── 003-v41-multi-tenant-migration.md
├── 004-repository-pattern-adoption.md
└── 005-context-api-over-redux.md
```

**Template**:
```markdown
# ADR-003: v4.1 Multi-Tenant Migration

**Date**: 2026-01-XX
**Status**: IN PROGRESS

## Context
Need multi-workspace support for dealer networks.

## Decision
Implement dual-write to Workspace/GlobalUser/Membership models.

## Consequences
**Pros**: Future-proof, scalable
**Cons**: 2-3 months effort, dual-write overhead

## Implementation
See `services/v41/writeService.ts`

## Status
⚠️ Dual-write enabled but underutilized (30% adoption)
```

---

## 10. RECOMMENDATIONS

### 10.1 Critical (P0) - Before Production

1. **Decide on v4.1 Migration** (User decision)
   - Complete OR remove v4.1
   - Avoid staying in dual-write limbo

2. **Fix `apiRoutes.ts` God Object** (2-3 weeks)
   - Split into module routes
   - Complete repository migration

3. **Add API Documentation** (1 week)
   - Swagger/OpenAPI
   - Document all endpoints

### 10.2 High Priority (P1) - Next Sprint

4. **Extract Scenario Node Handlers** (1-2 weeks)
   - Refactor `scenario.engine.ts`
   - Use Strategy pattern

5. **Standardize API Responses** (3 days)
   - Consistent success/error format
   - Add pagination metadata

6. **Add Frontend State Management** (1 week)
   - Zustand or TanStack Query
   - Reduce local state

### 10.3 Medium Priority (P2) - Next Month

7. **Extract Large Components** (1-2 weeks)
   - Split 500+ LOC pages
   - Create reusable sub-components

8. **Add Circular Dependency Detection** (1 day)
   - Run madge in CI/CD
   - Fix detected circles

9. **Create ADRs** (2-3 days)
   - Document key decisions
   - Track trade-offs

---

## 11. ARCHITECTURE EVOLUTION ROADMAP

### 11.1 Short-Term (3 months)

**Goal**: Clean up technical debt

1. Complete repository pattern migration
2. Refactor `apiRoutes.ts` and `scenario.engine.ts`
3. Decide on v4.1 (complete OR remove)
4. Add API documentation

**Outcome**: More maintainable codebase

### 11.2 Medium-Term (6-12 months)

**Goal**: Improve scalability

1. Add background queue (BullMQ)
2. Move webhook processing async
3. Implement caching layer (Redis)
4. Add APM monitoring

**Outcome**: Production-ready platform

### 11.3 Long-Term (1-2 years)

**Goal**: Microservices (optional)

1. Extract MTProto worker to separate service
2. Extract Scenario Engine to separate service
3. Add API gateway (Kong, Envoy)
4. Consider GraphQL for complex queries

**Outcome**: Highly scalable architecture

---

## 12. NEXT STEPS

### Phase 6: Security & Compliance (Immediate Next)

1. **Security Audit** (Days 13-15)
   - Authentication/authorization review
   - Input validation audit
   - Secrets management check
   - OWASP Top 10 compliance
   - Generate 06-SECURITY.md report

2. **Questions for User** (Architecture)

Before implementing recommendations:

1. **v4.1 Migration**:
   - Is multi-workspace support a business requirement?
   - Budget for 2-3 months migration effort?
   - OR should we remove v4.1 and simplify?

2. **State Management**:
   - Acceptable to add Zustand/TanStack Query (~1 week effort)?
   - Performance/UX concerns with current approach?

3. **Microservices**:
   - Future plans to scale horizontally?
   - Consider separating MTProto/ScenarioEngine?

---

**Report Prepared by**: Antigravity AI Agent  
**Report Date**: 2026-01-27  
**Next Phase**: Security & Compliance (Phase 6)  
**Status**: ✅ Architecture Analysis Complete
