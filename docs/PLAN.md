# Implementation Plan & Checklist

## Phase 3: Immediate Execution (P0/P1)

### 3.1 Deployment Stability (P0)
- [ ] **Refactor `infra/deploy_prod.sh`**:
  - Enforce `PROJECT="infra2"`.
  - Use `docker compose -p $PROJECT down --remove-orphans`.
  - Remove fuzzy "cleanup_old" logic that relies on grep.
  - Ensure `docker build` and `docker up` use the explicit project name.

### 3.2 Data & Feature Access (P0)
- [ ] **Remove Feature Flags**:
  - Update `apps/server/src/utils/constants.ts`: Set all flags to `true`.
  - Clean up `seed.ts` logic to not depend on flags (simplify).
  - Verify `AuthContext` or frontend `constants` don't hide UI.

### 3.3 Module Decomposition (P1)
- [ ] **Frontend Routing**:
  - `App.tsx`: Remove duplicate `/requests`.
  - `App.tsx`: Split `/integrations` into sub-routes.
- [ ] **Integrations Page**:
  - Create `IntegrationsLayout` with navigation.
  - Create sub-pages: `MetaPage`, `TelegramPage`, `SendPulsePage`.
- [ ] **Telegram Hub**:
  - Delete `TelegramHub.bak.tsx`.
  - Separate "Bot Management" from "MTProto Parsing" in UI.

### 3.4 Data Injection (P1)
- [ ] **Seeds**:
  - Ensure `MTProtoConnector` is created with a "CONNECTED" status for demo.
  - Create a "Main Channel" and "Chat Group" in seeds linked to the bot.

## Phase 4: Future Improvements (Proposals)

### Proposal A: Queue-Based Architecture
Use BullMQ/Redis for Telegram ingestion.
- **Why:** Decouples MTProto handling (which is slow/heavy) from the HTTP API.
- **How:** `worker:content` already exists? Enhance it to handle all incoming TG updates.

### Proposal B: Event Bus (Outbox Pattern)
- **Why:** "Isolated islands" problem.
- **How:** `PlatformEvent` table is a start. Make it the central "Outbox". All state changes (Lead created, Car added) emit an event -> consumers update stats, trigger scenarios, notify TG.

### Proposal C: Repository Layer
- **Why:** `prisma` calls are scattered.
- **How:** Enforce `src/repositories/*`. forbid `prisma.*` in `src/services/*`.

## Checklists

### Pre-Deploy
- [ ] `git status` clean.
- [ ] `infra/deploy_prod.sh` committed.

### Smoke Check
- [ ] `./infra/deploy_prod.sh` completes.
- [ ] `curl http://localhost:3002/health` -> 200.
- [ ] Backend: `docker logs infra2-api-1` (no crash).
- [ ] Frontend: Login works.
- [ ] Integrations page loads.
