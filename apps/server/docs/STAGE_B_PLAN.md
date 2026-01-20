# Stage B Implementation Plan

## Goal Description
Address critical post-deployment issues ("Black Screen" crash), implement missing Superadmin UI for API-only features, refactor project structure for scalability, and conduct a comprehensive UI/UX audit to deliver a premium feel.

## User Review Required
> [!IMPORTANT]
> **File Structure Refactor**: Moving files will require updating imports. This is a disruptive change but necessary for "Stage B" growth.
> **UI Overhaul**: `ui-ux-pro-max` workflows will be applied, potentially changing current verify visual styles significantly.

## Proposed Changes

### 1. Debugging & Stability (`debugger` + `frontend-specialist`)
#### [FIX] Requests.tsx Crash
- **Issue**: "Black screen" on Create Request.
- **Root Cause**: Suspected missing CSS classes for modal (`.panel`, `.animate-slide-up`) or Z-index conflicts hiding content.
- **Fix**:
    - Verify and ensure global CSS contains necessary utility classes.
    - Check Z-index stacking context.
    - Add Error Boundary to `Requests.tsx` to catch runtime errors gracefully.

### 2. Superadmin UI Implementation (`frontend-specialist`)
Implement a dedicated **Superadmin Dashboard** for API-only features.

#### [NEW] `apps/web/src/pages/superadmin/`
- **DashboardRoutes.tsx**: Routing for superadmin section.
- **Companies.tsx**: Full CRUD for Companies (Grid/List view, Plan mgmt).
- **Users.tsx**: Global user search & management (Impersonation UI).
- **SystemLogs.tsx**: Viewer for system logs (`GET /logs`).
- **Orchestration.tsx**: UI for Triggering Agents/Workflows (future-proofing).

### 3. File Structure Refactoring (`backend-specialist` + `frontend-specialist`)
The current structure is flat and mixes concerns.

#### [MOVE] Backend (`apps/server`)
- `src/services/` -> Move specific services into `src/modules/<module>/`.
- Keep `src/shared/` for truly global services (Prisma, Redis).

#### [MOVE] Frontend (`apps/web`)
- `src/pages/` -> Group by domain:
    - `src/pages/public/` (Login, Landing)
    - `src/pages/app/` (Dashboard, Requests, Inventory)
    - `src/pages/superadmin/` (System Admin)
- `src/components/` -> Group by type (Atom, Molecule, Org) or Feature.

### 4. UI/UX "Pro Max" Audit (`frontend-specialist`)
Apply `ui-ux-pro-max` standards:
- **Typography**: Verify font hierarchy (Inter/Roboto).
- **Colors**: Standardize "Gold/Dark" palette variable usage.
- **Animations**: Add `framer-motion` for page transitions and modal entry.
- **Feedback**: Ensure Loading/Error states are visible and premium.

## Verification Plan

### Automated Tests
- Run `npm test` after refactoring to ensure import paths are resolved.
- Run `security_scan.py` again to ensure no new vulnerabilities.

### Manual Verification
1. **Crash Check**: Click "New Request" -> Verify Modal opens correctly.
2. **Superadmin**: Log in as `SUPER_ADMIN` -> Verify access to new Dashboard.
3. **Deployment**:
    - Push changes.
    - Verify `https://cartie2.umanoff-analytics.space` loads new UI.
    - Verify Browser Console has no 404s for assets.
