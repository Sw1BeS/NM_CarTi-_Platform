# Cartie v2.0 Strategic Master Plan

## 1. System Audit & Integrity Analysis `[Audit]` `[Integrity]`
### 1.1 Codebase Assessment
- **Architecture**: Monorepo (Turborepo style) with `apps/server` (Express/Prisma) and `apps/web` (Vite/React).
- **Backend Quality**: Mixed.
    - ✅ `companies` module follows best practices (Routes -> Service -> DB).
    - ❌ `inventory` module is brittle (Routes -> DB directly).
    - ❌ `bots` module relies on a monolithic `ScenarioEngine` (1700+ lines) handling parsing, logic, and UI.
- **Frontend Quality**: Component-based, but types are duplicated manually from backend.

### 1.2 Knowledge Base Structure
This plan establishes the following Documentation Standard:
- `docs/ARCHITECTURE.md`: High-level design & diagrams.
- `docs/MODULES.md`: Specific module documentation (Inventory, Bots).
- `docs/API.md`: API Contract & Interfaces.

---

## 2. Integrity & Refactoring Steps `[Integrity]`
To ensure stability before expansion:
1.  **Standardize Inventory Module**: Refactor `inventory` to use `InventoryService`. Remove DB logic from controllers.
2.  **Decompose Bot Engine**: Split `ScenarioEngine` into:
    - `MessageDispatcher`: Entry point.
    - `FlowHandlers`: Individual strategy classes (DealerFlow, UserFlow).
    - `ParserService`: Isolated logic for AutoRia/Web scraping.
3.  **Frontend Type Safety**: Implement `graphql-codegen` or Prisma type generation for Frontend to enforce "Single Source of Truth".

---

## 3. GitHub & Collaboration Workflow `[GitHub]`
### 3.1 Branching Strategy
Adoption of **Trunk-Based Development** for agility:
- `main`: Production-ready code. Auto-deploys to Prod.
- `stage`: Integration testing. Auto-deploys to Stage.
- `feat/*`: Feature branches. PR required to merge to `stage`.

### 3.2 CI/CD Pipeline (GitHub Actions)
- **CI**: On every PR -> Run `tsc`, `eslint`, and `vitest`.
- **CD**: On merge to `main` -> Build Docker images -> Push to Registry -> Webhook to Portainer/Video.

---

## 4. Strategic Roadmap (Addressing 23 User Wishes)

### Phase A: The Universal Core (Weeks 1-4)
*Focus: Wishes 1, 2, 12, 14, 18, 22*
- **Objective**: Break free from "Hardcoded Entities".
- **Action**: Fully implement the **Entity-Attribute-Value (v4.1)** architecture managed by `v41/readService.ts`.
- **Feature**: "Universal Entity Builder" on Frontend. Users can define "Car", "Yacht", "Real Estate" without DB migrations.
- **Data Normalization**: Implement `NormalizationService` (Middleware) that maps raw inputs (e.g., "БМВ") to canonical Tags ("BMW") automatically.

### Phase B: The Bot Ecosystem (Weeks 5-8)
*Focus: Wishes 4, 6, 7, 13, 16, 20*
- **Objective**: Smarter, Free, Unlimited Bots.
- **Action**: Extract `ParserService` from `ScenarioEngine`.
- **Feature**: "Universal Parser Interface". Admin pastes a URL -> System uses CSS Selectors defined in Template -> Extracts Data. No API costs.
- **Micro-Animations**: Add "Typing...", "Uploading photo..." states to Bot interactions for Premium feel.

### Phase C: Super Admin & Customization (Weeks 9-12)
*Focus: Wishes 5, 8, 9, 11, 19, 21*
- **Objective**: Whitelabel & UI/UX Excellence.
- **Action**: Build `SuperAdmin` Panel in `apps/web`.
- **Capabilities**:
    - Manage Tenants (Workspaces).
    - Upload Logos/Fonts per Tenant.
    - Toggle Modules (e.g., "Enable AutoRia Parser" for Tenant A).
- **Mobile-First**: Redesign `apps/web` with CSS Grid/Touch-first controls.

### Phase D: Analytics & Reporting (Weeks 13+)
*Focus: Wishes 10, 15, 17, 23*
- **Objective**: Data-driven decisions.
- **Action**: Connect `ClickHouse` or `Tinybird` (optional) or optimize Postgres Aggregations.
- **Feature**: "Report Builder". Drag-and-drop UI to chart "Leads per Source" or "Model Popularity".

---

## 5. Immediate Execution Plan
1.  **Refactor Inventory**: Create `InventoryService`.
2.  **Fix Bot Parsing**: Extract `AutoRia` logic to `ParserService`.
3.  **Setup CI/CD**: Create `.github/workflows/main.yml`.

Do you approve this Strategic Plan?
