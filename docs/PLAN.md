# Implementation Plan & Checklist

## Phase 3: Immediate Execution (P0/P1)

### 3.1 Deployment Stability (P0)
- [x] **Refactor `infra/deploy_prod.sh`**:
  - Enforce `PROJECT="infra2"`.
  - Use `docker compose -p $PROJECT down --remove-orphans`.

### 3.2 Data & Feature Access (P0)
- [x] **Remove Feature Flags**:
  - Updated `constants.ts` to all true.

### 3.3 Module Decomposition (P1)
- [x] **Frontend Routing**:
  - Fixed `App.tsx` routes.
  - Implemented `IntegrationsLayout` with sub-routes.
- [x] **Telegram Hub**:
  - Cleaned up artifacts.
  - UI now supports MTProto vs Bot tabs.

### 3.4 Data Injection (P1)
- [x] **Seeds**:
  - Added `seedMTProto` to `seed.ts`.
  - Injects connected demo account for visualization.

## Phase 4: Future Improvements (Proposals)

### Proposal A: Queue-Based Architecture
Use BullMQ/Redis for Telegram ingestion.
- **Why:** Decouples MTProto handling (which is slow/heavy) from the HTTP API.
- **Action:** Extracted `mtproto.worker.ts` is a good start, but needs true async queue.

### Proposal B: Event Bus (Outbox Pattern)
- **Why:** "Isolated islands" problem.
- **Action:** Expand `PlatformEvent` usage in `mtproto-mapping.service.ts`.

### Proposal C: Repository Layer
- **Why:** `prisma` calls are scattered.
- **Action:** Enforce strict Service -> Repository -> Database flow.

## Verification
- [x] **Build:** `tsc` checks passed for new modules.
- [x] **Logic:** Mapping service correctly parses car data from text.
- [x] **Routing:** Verified API structure.
