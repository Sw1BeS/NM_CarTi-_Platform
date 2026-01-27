# AUDIT PHASE 1: DISCOVERY & MAPPING

**Date**: 2026-05-22
**Status**: Completed

## 1. PLATFORM OVERVIEW

Cartie is a B2B automotive platform with deep Telegram integration, built as a monolithic repository with a clear separation between frontend (React/Vite) and backend (Express/Prisma).

### 1.1 Metrics (Lines of Code)

| Component | Path | Files | LOC (Estimated) | Notes |
|-----------|------|-------|-----------------|-------|
| **Backend API** | `apps/server/src` | ~300 | ~14,800 | Matches initial estimate. High density in `apiRoutes.ts`. |
| **Frontend UI** | `apps/web/src` | ~350 | ~19,300 | Larger than estimated (12k). Likely due to UI components and scenario builder logic. |
| **Database Schema** | `apps/server/prisma/schema.prisma` | 1 | 1,393 | Complex dual-write schema (Legacy + v4.1). |
| **Infrastructure** | `infra/` | 5 | ~200 | Docker Compose + Caddy setup. |
| **Documentation** | `docs/` | 10 | ~3,000 | Good coverage in `ARCHITECTURE.md`. |

### 1.2 Module Map

#### Backend (`apps/server/src/modules`)
The backend is structured by domain, but routed inconsistently (some via `modules/`, some via `apiRoutes.ts`).

- **Core**: Authentication, Companies (Multi-tenancy), System Settings, Templates, Superadmin.
- **Communication**: Bots (Telegram), Scenarios (Logic Engine), Messaging (Inbox/Outbox).
- **Integrations**: MTProto (Channel parsing), Meta (Pixel/CAPI), SendPulse (Email/SMS), WhatsApp/Viber (Webhooks), Autoria (Car listings).
- **Inventory**: Car Listings (CRUD, Search, Import).
- **Sales**: B2B Requests, Channel Posts.
- **v4.1 Migration**: Dual-write logic for transitional architecture.

#### Frontend (`apps/web/src/pages/app`)
The frontend reflects the backend modules but adds significant UI logic for builders.

- **Core Pages**: Dashboard, Settings, Companies.
- **Communication**: Telegram Hub, Inbox, Leads, Content Calendar.
- **Builders**: Scenario Builder (Visual Flow), Automation Builder (ReactFlow).
- **Inventory**: Inventory Management (Grid/List), Import.
- **Sales**: Requests, Proposals.

---

## 2. TECHNOLOGY STACK ANALYSIS

### 2.1 Backend (`apps/server`)
- **Runtime**: Node.js (Version unpinned in `package.json`, assumed LTS).
- **Framework**: Express 4.18.2 (Outdated, v5 available).
- **ORM**: Prisma 5.10.2 (Slightly outdated, v6 available).
- **Language**: TypeScript 5.3.3.
- **Key Libraries**:
  - `telegram`: GramJS wrapper for MTProto.
  - `cheerio`: HTML parsing for car sites.
  - `zod`: Validation (v3).
  - `node-cron`: Scheduled tasks.
  - `vitest`: Testing.

**Findings**:
- `express` is on v4.x, while v5 is stable.
- `prisma` is on v5.x, but v6 is available.
- `zod` usage is extensive but scattered.

### 2.2 Frontend (`apps/web`)
- **Framework**: React 19.2.3 (Cutting edge).
- **Build Tool**: Vite 6.2.0.
- **Styling**: Tailwind CSS 4.1.18.
- **State Management**: React Context (No Redux/Zustand seen yet).
- **Routing**: React Router DOM 7.11.0.
- **Editor**: Lexical 0.39.0 (Rich text).
- **Visuals**: ReactFlow 11.11.4 (Scenario builder), Framer Motion 12.27.5.

**Findings**:
- Frontend stack is extremely modern (React 19, RR7, Tailwind 4).
- Dependency health is excellent.

---

## 3. ARCHITECTURE MAPPING

### 3.1 Current vs. Documented
The architecture largely matches `docs/ARCHITECTURE.md`, but with some notable deviations in implementation details.

- **Routing**: The documentation suggests a clean modular routing, but `apps/server/src/routes/apiRoutes.ts` acts as a massive "catch-all" controller (approx. 800 LOC) handling Bots, Messages, Scenarios, Leads, Drafts, and Users directly.
  - **Risk**: High coupling, hard to test, violates Single Responsibility Principle.
- **Dual-Write**: The v4.1 migration strategy (Dual Write) is implemented but adds significant complexity to the schema and services.
- **Service Layer**: Services exist (`apps/server/src/services`), but `apiRoutes.ts` bypasses them frequently, calling `prisma` directly.

### 3.2 Key Architectural Patterns
- **Monolithic API**: Single Express app serving all domains.
- **Worker Processes**:
  - `content.worker.ts`: Scheduled posts.
  - `mtproto.worker.ts`: Telegram channel parsing (running in same process or separate? Need to confirm execution mode).
- **Repository Pattern**: Partially implemented (`apps/server/src/repositories`), but not consistently used.
- **Frontend-Backend Contract**: REST API (JSON). No shared types package (Types duplicated or manually synced).

---

## 4. CRITICAL FINDINGS (PHASE 1)

1.  **"God Router" (`apiRoutes.ts`)**:
    - Contains logic for 14 different domains.
    - Mixes auth, validation, database calls, and response formatting.
    - **Recommendation**: Refactor into dedicated controllers/routes immediately.

2.  **Inconsistent Layering**:
    - Some modules use `Controller -> Service -> Repository -> DB`.
    - `apiRoutes` uses `Route -> DB` directly.
    - **Recommendation**: Enforce Service/Repository pattern.

3.  **Frontend Complexity**:
    - The frontend is larger than the backend (19k vs 15k LOC).
    - Suggests heavy business logic on the client side (e.g., Scenario Builder).
    - **Recommendation**: Audit frontend state management for performance.

4.  **Dependency Versions**:
    - Backend dependencies are slightly lagging (Express 4, Prisma 5).
    - Frontend is bleeding edge (React 19).
    - **Recommendation**: Upgrade backend to match modern standards (Express 5, Prisma 6) to avoid tech debt gap.

---

## 5. NEXT STEPS (PHASE 2: PERFORMANCE)

-   Analyze the performance impact of the "God Router".
-   Profile the `ScenarioEngine` and `MTProtoWorker`.
-   Check database query performance (especially with the dual-write schema).
-   Audit frontend bundle size given the heavy dependencies (Lexical, ReactFlow).
