# AUDIT PHASE 2: PERFORMANCE ANALYSIS

**Date**: 2026-05-22
**Status**: Completed

## 1. BACKEND PERFORMANCE

### 1.1 Database Schema Analysis (`apps/server/prisma/schema.prisma`)

**Redundant Indexes**:
Several tables have overlapping indexes which consume write performance and storage without adding read value. Postgres composite indexes `(A, B, C)` can serve queries for `(A)`, `(A, B)`, and `(A, B, C)`.

-   **`CarListing`**:
    -   Existing: `[companyId]`, `[companyId, status]`, `[companyId, status, createdAt]`
    -   Recommendation: Keep only `[companyId, status, createdAt]` (and maybe `[companyId, createdAt]` if strictly needed).
-   **`B2bRequest`**:
    -   Existing: `[companyId]`, `[companyId, status]`, `[companyId, status, createdAt]`
    -   Recommendation: Consolidate to `[companyId, status, createdAt]`.
-   **`Lead`**:
    -   Existing: `[companyId]`, `[companyId, status]`, `[companyId, createdAt]`
    -   Recommendation: Review query patterns. If sorting by `createdAt` is common with `companyId`, keep `[companyId, createdAt]`.

**Missing Indexes**:
-   **`EntityRecord.data`**: No GIN index on the `data` JSONB column. Queries filtering by specific fields inside the dynamic entity will be full table scans.
-   **`CarListing.specs`**: No GIN index. Filtering by specific car specs (JSON) will be slow.

### 1.2 API Query Patterns (`apps/server/src/routes/apiRoutes.ts`)

**"God Router" Bottlenecks**:
The `apiRoutes.ts` file handles too many responsibilities, leading to inefficient data handling.

1.  **Memory-Intensive Aggregation (`/destinations`)**:
    -   **Pattern**: Fetches latest 500 `BotMessage` records and 500 `EntityRecord` items to compute the list of "Destinations" (chat partners) in memory.
    -   **Impact**: As message volume grows, this endpoint will become slower and consume more RAM. It limits the visibility to only recent interactions.
    -   **Fix**: Maintain a dedicated `Destination` table updated via event/trigger or standard write path, rather than deriving it on-read.

2.  **Inefficient Filtering (`/leads`)**:
    -   **Pattern**: Supports text search via `contains` on `clientName`, `phone`, `leadCode` with `OR` condition.
    -   **Impact**: `contains` queries often cannot use standard B-Tree indexes (requires `pg_trgm` extension and GIN/GiST indexes).
    -   **Fix**: Implement Full Text Search (FTS) or ensure `pg_trgm` is enabled and indexes are added for these columns.

3.  **Proxy Endpoint (`/proxy`)**:
    -   **Pattern**: Proxies requests to `auto.ria.com` and `olx.ua` via the backend to avoid CORS.
    -   **Impact**: Ties backend worker threads to external API latency. If AutoRia is slow, the Node.js event loop (or thread pool for DNS/SSL) might get congested.
    -   **Fix**: Use a dedicated microservice or ensure strict timeouts (currently 15s, might be too high for high traffic).

### 1.3 Service Layer Logic

-   **`mtproto.worker.ts`**: (Analysis pending detailed code review)
    -   Likely runs in the main process loop if not spawned correctly. `index.ts` calls `mtprotoWorker.startLiveSync()`. If this performs blocking operations, it will degrade API performance.

---

## 2. FRONTEND PERFORMANCE

### 2.1 Bundle Analysis (`apps/web/dist`)

**Critical Finding: No Code Splitting**
The build output shows a single massive JavaScript chunk:
-   `dist/assets/index-qHz2QeCS.js`: **1,553.03 kB** (gzip: 455.81 kB)

This single file contains the entire application logic, including heavy libraries that are only needed on specific routes.

**Heavy Dependencies (bundled eagerly):**
-   **Lexical Editor** (`@lexical/*`): Rich text editor logic.
-   **ReactFlow** (`reactflow`): Visual node editor logic (only needed for `/scenarios` and `/automations`).
-   **Recharts** (`recharts`): Charting library (only needed for `/dashboard`).
-   **Framer Motion** (`framer-motion`): Animation library.

**Impact**:
-   **Slow Initial Load**: Users must download 1.5MB of JS before seeing the Login screen.
-   **Wasted Bandwidth**: Users who never visit the Scenario Builder still download the editor code.

**Recommendation**:
1.  **Implement Lazy Loading**: Use `React.lazy` and `Suspense` for route-based code splitting in `App.tsx`.
    -   Lazy load `ScenarioBuilder`, `AutomationBuilder`, `Dashboard`, and `Editor` components.
2.  **Configure Manual Chunks**: Update `vite.config.ts` to separate vendor libraries into their own chunks.
    ```ts
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['@lexical/react', 'reactflow', 'recharts', 'framer-motion']
          }
        }
      }
    }
    ```

### 2.2 Asset Optimization
-   CSS bundle is small (~7kB), indicating efficient Tailwind usage.
-   Images/Fonts need verification (none large found in initial scan).

---

## 3. DATABASE PERFORMANCE

*Pending Query Plan Analysis*
