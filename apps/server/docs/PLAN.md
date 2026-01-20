# Unified Orchestration Plan: Audit, Deploy, Verify

## 🎯 Objective
Complete a full cycle of audit, deployment, and verification for the Cartie v2 system.
**Target Domain:** `https://cartie2.umanoff-analytics.space`

---

## 👥 Agent Roles & Responsibilities

| Agent | Focus Area | Key Tasks |
|-------|------------|-----------|
| **🔍 Code Auditor**<br>(`backend-specialist` + `frontend-specialist`) | **Audit & Best Practices** | • Audit module logic (Server & Web)<br>• Identify anti-patterns & improvements<br>• Verify "Growth Areas" |
| **🚀 DevOps Engineer**<br>(`devops-engineer`) | **Deployment** | • `git commit` & `git push`<br>• Database Migrations<br>• Production Build & Service Restart |
| **🧪 Test Engineer**<br>(`test-engineer`) | **Verification** | • valid functional checklist<br>• Verify prodURL access<br>• **CRITICAL:** Ensure all modules accessible to ANY account |

---

## 📅 Execution Phases

### Phase 1: Codebase Audit & Analysis (Pre-Flight)
**Agents:** `backend-specialist`, `frontend-specialist`
1.  **Refactor & Clean:** Brief cleanup of uncommitted files (ensure clean state).
2.  **Audit:**
    *   Review `apps/server/src/modules` for modularity and logic.
    *   Review `apps/web/src` for component structure.
3.  **Report**: Generate `docs/IMPROVEMENTS.md` containing:
    *   Current errors/weaknesses.
    *   Zones for growth/refactoring.
    *   Best practice gaps.

### Phase 2: Production Deployment
**Agent:** `devops-engineer`
1.  **Version Control**:
    *   Stage all changes (`git add .`).
    *   Commit with message: "feat(release): Stage A complete with system customization".
    *   Push to remote repository.
2.  **Database**:
    *   Run pending migrations (`system_customization_fields`).
    *   Update Prisma Client.
3.  **Build & Deploy**:
    *   Build Backend & Frontend.
    *   Restart PM2 services.
    *   Verify Nginx config (if needed).

### Phase 3: Post-Deployment Verification
**Agent:** `test-engineer`
1.  **Production Health Check**:
    *   Visit `https://cartie2.umanoff-analytics.space`.
    *   Login verification (multiple account types if possible, or generic user).
2.  **Access Control Audit**:
    *   **Requirement**: "All modules available to ANY account".
    *   Verify routing guards and API middleware don't block valid users.
3.  **Deliverables**:
    *   Create `docs/CHECKLIST.md`: A concrete, step-by-step checklist for checking every system function.

---

## ✅ Verification Criteria
- [ ] Application is accessible at `https://cartie2.umanoff-analytics.space`.
- [ ] Login works.
- [ ] All uncommitted changes are safely pushed.
- [ ] `docs/CHECKLIST.md` exists and is populated.
- [ ] `docs/IMPROVEMENTS.md` exists.
