# 🐛 Deployment Fix & Prevention Plan

## 🚨 Problem
The user does not see frontend changes on `cartie2.umanoff-analytics.space`.
**Root Cause:**
1.  **Immediate:** `infra2-web-1` container was stale (>1h uptime) despite build.
2.  **Systemic:** The `deploy_infra2.sh` script runs `build` then `up -d`, but Docker Compose sometimes skips recreation if it deems the configuration identical, even if the image content changed (if checksums aren't strictly tracked or using `latest` tag implicit behaviors). It lacks a mechanism to **guarantee** a fresh container start.

## 🧠 Brainstorm: Prevention Strategy

### Option A: Force Recreate Flag (Recommended)
Modify `deploy_infra2.sh` to use `docker compose ... up -d --force-recreate` or explicitly stop containers first.
✅ **Pros:** Deterministic. Guaranteed fresh state.
❌ **Cons:** Small downtime (seconds).

### Option B: Image Versioning
Script automatically updates `package.json` version or passes a `BUILD_ID` build arg to Docker to force cache invalidation.
✅ **Pros:** Zero downtime potential if using rolling updates (but docker-compose is single node).
❌ **Cons:** Complexity in version management.

### Option C: Prune-First Policy
Always run `docker image prune` and `docker system prune` before deploy.
✅ **Pros:** Clean disk.
❌ **Cons:** Slow builds (loses cache).

**Recommendation:** **Option A**. Update the deployment script to always force recreate the `web` and `api` containers during deployment to ensure the new code is live.

---

## 📅 Implementation Steps

### Phase 1: Immediate Fix (Approved)
- [x] Check container uptime (`docker ps`). (Result: >1h, confirmed stale)
- [ ] **Action:** `docker stop infra2-web-1 && docker rm infra2-web-1`.
- [ ] **Action:** `docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml up -d --build --force-recreate web`.
- [ ] **Verify:** Check uptime is `< 1 minute`.

### Phase 2: Future Prevention (New)
- [ ] **Modify Script:** Update `infra/deploy_infra2.sh`.
    - Change `docker compose ... up -d` to `docker compose ... up -d --force-recreate`.
    - Add explicit `docker image prune -f` after build to keep system clean.
- [ ] **Document:** Update `docs/RELIABILITY_PLAN.md` with "Deployment Protocol: Always Force Recreate".

## 🛡️ Verification Plan
- **Immediate:** `docker ps` shows new container.
- **Future:** Run `./infra/deploy_infra2.sh` (Dry Run / Test) to confirm it passes flags correctly.
