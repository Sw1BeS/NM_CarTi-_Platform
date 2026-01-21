# Production Readiness Plan

> **Objective**: Bring Cartie2 to fully operational production state (Stage C/D) without demo artifacts.

## 📂 Planning Artifacts
- **[Inventory Map](./INVENTORY_MAP.md)**: Full topology of Frontend Routes and Backend Modules.
- **[Gap List](./GAP_LIST.md)**: Identified blockers (Missing SendPulse, Unwired Meta, Demo Data, I18n UI).
- **[Execution Plan](./EXECUTION_PLAN.md)**: Step-by-step P0/P1 roadmap.

## 🚀 Strategy

### 1. Data Hygiene (P0)
We will modify the seeder to strictly separate "System/Production" initialization from "Demo" data. The production environment will initialize with **only** the `Cartie Auto` workspace and necessary templates, **without** fake cars or leads.

### 2. Integration Hardening (P0)
- **Meta CAPI**: Will be connected to actual business logic events (Lead Created, Request Created).
- **SendPulse**: Will be implemented from scratch (Service + API + UI).

### 3. User Experience (P1)
- **Internationalization**: A dedicated English/Ukrainian/Russian switcher will be added to the main layout.
- **Empty States**: "Ghost towns" in the UI (empty tables) will be replaced with actionable empty states.

### 4. Verification
Final verification will involve a live traversal of the deployed domain `https://cartie2.umanoff-analytics.space`.

---

**Status**: 🟡 Planning Complete. Waiting for Approval to Execute.
