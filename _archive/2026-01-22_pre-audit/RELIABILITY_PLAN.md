# 🛡️ Infrastructure & Deployment Audit Plan

## 📋 Executive Summary
A structural issue in the deployment pipeline caused "Silent Failures" where the frontend container reported healthy uptime (>1h) despite a new deployment attempt. This audit identifies the root causes across CI/CD, Containerization, and Caching layers and proposes a "Zero-Trust" deployment strategy.

## 🕵️ Deep Dive Audit

### 1. The "Sticky Container" Issue
**Observation:** `infra2-web-1` persistence across deployments.
**Technical Analysis:**
- Docker Compose `up` prioritizes stability. If the Service Configuration (env vars, ports, volumes) hasn't changed, it avoids restarting the container unless it explicitly detects an Image ID mismatch.
- **Vulnerability:** If the `build` step updates the image tag (e.g., `latest`) but the container runtime doesn't vigorously check the manifest digest, it continues running the "old" `latest`.
- **Verdict:** Relying on implicit update detection is unsafe for production.

### 2. Caching & Persistence
- **Caddy:** Configured with `no-cache` (Correct). Browser caching is likely not the issue.
- **Docker Layer Caching:** `Dockerfile.web` copies `package.json` first. If dependencies haven't changed, it uses cached `node_modules`. This is efficient but typically safe.
- **Frontend Assets:** Vite generates hashed filenames (e.g., `index-CmU28z4r.js`). If the container doesn't restart, Caddy serves the OLD `index.html` which points to OLD hashed files. New hashed files are physically missing from the old container's `/srv/www`.

### 3. Deployment Script (`deploy_infra2.sh`)
- **Current Flow:** `pull` -> `build` -> `up`.
- **Gap:** Lacks explicit "cleanup" or "rotation" logic.
- **Missing Safety:** No pre-deployment health check of the *new* artifact before switching.

---

## 🛠️ Remediation Strategy: "Immutable Deployments"

### Phase 1: Hardening the Script (The Fix)
We will refactor `deploy_infra2.sh` to enforce **Immutable Infrastructure** principles locally.

1.  **Explicit Image Tagging:** Instead of implicit tags, we will treat every build as unique (or enforce recreation).
2.  **Force Recreation:** Use `--force-recreate` to mandate the destruction of the old container.
3.  **Orphan Cleanup:** Use `--remove-orphans` and `image prune` to prevent disk saturation.

### Phase 2: Docker Composition Optimizations
Update `docker-compose.cartie2.prod.yml`:
- **Restart Policy:** Enhance `restart: unless-stopped` with explicit healthcheck dependencies.
- **Lifecycle:** Ensure `stop_grace_period` is appropriate for Caddy/Node.

### Phase 3: Frontend Validation
- **Build Verification:** Implement a check that verifies the `dist/index.html` generation time *before* the container starts.

---

## 📅 Execution Plan

### Step 1: Immediate Remediation (Completed)
> **Status:** ✅ COMPLETED
> **Executed:** 2026-01-21 19:15 UTC

- Action: `docker stop` -> `docker rm` -> `docker start` (manual recovery was required).
- Result: Container `infra2-web-1` is serving fresh content (verified via HTTP headers).

### Step 2: Pipeline Engineering (Implemented)
> **Status:** ✅ IMPLEMENTED

- **Modified:** `infra/deploy_infra2.sh`
- **Changes:** Added `--force-recreate`, `--remove-orphans`, and `docker image prune`.

### Step 3: Validation (Verified)
> **Status:** ✅ VERIFIED

- **Infrastructure:** `infra2-web-1` running.
- **Application:** HTTP 200 OK confirmed.
- **Freshness:** Verified `Last-Modified` header matches deployment time.

## 🤝 User Action Required
Approve this architectural shift to **"Aggressive Recreation"** logic to prevent future stale states.
