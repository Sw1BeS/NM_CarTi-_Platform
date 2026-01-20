# Plan: Cartie Platform Restoration

## 1. Analysis & Discovery
- [x] **Infrastructure Check**:
  - `infra2-db-1`: Healthy
  - `infra2-api-1`: **Restarting (Critical)**
  - `infra2-web-1`: Unhealthy
- [ ] **Log Analysis**: Check `docker logs infra2-api-1` to find crash cause.
- [ ] **Database Inspection**: Compare Prisma schema with running DB.

## 2. Implementation Strategy (Forward-Only)

### A. Fix Backend (API)
1.  **Stop Crash**: Identify error from logs (likely migration or env/config).
2.  **Database Sync**:
    -   Introspect DB if needed.
    -   Create new migration `fix_schema_drift` to align Schema with DB.
    -   Apply migration (`prisma migrate deploy`).
3.  **Verify Start**: Ensure API stays up and `health` endpoint returns 200.

### B. Fix Frontend (Web)
1.  **Build Check**: Ensure `apps/web` builds correctly.
2.  **Proxy Check**: Verify Caddyfile routing.
3.  **Env Vars**: Confirm `VITE_API_BASE_URL` is correct.


## 3. Execution Log (Orchestration Results)
- [x] **API Fix**:
    - **Issue**: Crash loop due to `User` table missing.
    - **Root Cause**: Stale Docker image used old code expecting `User` model, while DB/Schema had `GlobalUser`. Host `node_modules`/`dist` leaked into build.
    - **Fix**: Added `.dockerignore` to exclude host artifacts. Rebuilt `infra2-api`.
    - **Secondary Issue**: Missing `SEED_SUPERADMIN_PASSWORD`.
    - **Fix**: Updated `.env` with missing variables.
- [x] **Database Sync**:
    - **Result**: `v41_baseline` migration matches executed schema. `users` table exists.
    - **Action**: Resolved migration history.
- [x] **Frontend Fix**:
    - **Issue**: `infra2-web` unhealthy (502) due to API down.
    - **Config**: Created `apps/web/.env.production` with correct `VITE_API_BASE_URL`.
    - **Build**: Rebuilt `infra2-web` to bake in env vars.
- [x] **Verification**:
    - `curl http://localhost:8082/` -> **200 OK**
    - `curl http://localhost:8082/api/health` -> **200 OK** (Proxied)

## 4. Agents & Roles
- **Orchestrator**: Coordination.
- **Backend Specialist**: API, DB, Migrations.
- **Frontend Specialist**: Web, UI, Build.
- **DevOps**: Docker, Caddy.
