# 🎼 Master Plan: Cartie2 Reliability & Optimization

## 🎯 Objective
Achieve 100% deployment reliability, verify system integrity through deep audits, and prevent regression of container/update issues.

## 👥 Agent Orchestration
| Phase | Focus Area | Responsible Agent |
|-------|------------|-------------------|
| **0** | Critical Fixes | `backend-specialist` |
| **1** | Deployment & Infra | `devops-engineer` |
| **2** | Backend Audit | `backend-specialist` |
| **3** | Frontend Audit | `frontend-specialist` |
| **4** | Verification | `quality-assurance` |

---

## 📅 Roadmap

### Phase 0: Immediate Critical Fixes (Prerequisite)
> **Goal:** Resolve known blocking errors in logs.
- [ ] **Database Schema:** Fix `SystemSettings.sendpulseId does not exist` (Create & Run Migration).
- [ ] **API Stability:** Investigate and resolve `Bot Loop Error (404)` which may be linked to missing DB columns or API routes.

### Phase 1: Infrastructure & Deployment Hardening
> **Goal:** "Work out containers correctly" so update errors don't repeat.
- [ ] **Harden `deploy_infra2.sh`:**
    - Add strict post-deployment verification (check all 3 containers).
    - Implement "Atomic Deploy" pattern (don't stop until new build is ready).
- [ ] **Self-Healing Monitor (`monitor.sh`):**
    - Cron script to check `infra2-web-1`, `infra2-api-1`, `infra2-db-1`.
    - Auto-restart if down > 1 minute.
- [ ] **Container Configuration:**
    - Review `restart` policies (ensure `always` or `unless-stopped`).
    - Verify `healthcheck` intervals and timeout settings.

### Phase 2: Backend Deep Audit
> **Goal:** Ensure API robustness and code quality.
- [ ] **Route Security:** Audit all routes for missing `authenticateToken` / `requireRole` (like the one fixed recently).
- [ ] **Error Handling:** Verify global error handler captures and logs all exceptions (prevent silent crashes).
- [ ] **Performance:** Check for "N+1" queries in Prisma usage.
- [ ] **Logs:** Ensure clean signal-to-noise ratio (reduce spammy logs).

### Phase 3: Frontend Deep Audit
> **Goal:** UI/UX perfection and build verification.
- [ ] **Build Verification:** Ensure `vite build` produces optimized chunks without errors.
- [ ] **Console Audit:** Open app and eliminate all console errors/warnings (React keys, invalid DOM nesting).
- [ ] **Environment Check:** Verify all ENV variables are correctly baked in during build.
- [ ] **Responsiveness:** Quick check of mobile view for critical flows (Login, Dashboard).

### Phase 4: Verification & Handover
- [ ] **Full E2E Test:** Run a complete flow (Login -> Dashboard -> Requests).
- [ ] **Disaster Recovery Drill:** Manually kill a container and watch it auto-recover.
- [ ] **Final Report:** detailed audit findings and fixes.
