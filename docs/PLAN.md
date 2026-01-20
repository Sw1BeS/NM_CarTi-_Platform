# Cartie Platform: "Pro Max" Upgrade Plan

> **Objective:** Transform current MVP into a production-ready, multi-lingual, high-performance platform with premium UI/UX.

## 👥 Orchestration Team (Minimum 3 Agents)
1. ** Backend Specialist:** Refactoring, API generation, Integrations.
2. ** Frontend Specialist:** UI/UX Redesign, i18n implementation.
3. ** Database Architect:** Data seeding, Schema optimization.
4. ** DevOps/Test Engineer:** Verification, file structure cleanup.

---

## Phase 1: Architecture & Housekeeping (The Foundation)
**Goal:** Clean up technical debt and prepare for scale.

### 1.1 Backend Module Consolidation
*   **Current:** 58+ loose modules in `src/modules`.
*   **Target:** Consolidate into Domain Modules:
    *   `@modules/Sales` (Leads, Deals, B2B Requests)
    *   `@modules/Inventory` (Cars, Parser, Stock)
    *   `@modules/Communication` (Telegram, Bots, Outbox)
    *   `@modules/Core` (Users, Companies, Settings, Auth)
    *   `@modules/Integrations` (Meta, SendPulse, External)

### 1.2 File Structure Optimization
*   **Backend:** Standardize `Service <-> Controller <-> DTO` pattern.
*   **Frontend:** Group by feature (`features/auth`, `features/inventory`) instead of type (`components`, `pages`).

---

## Phase 2: Core Enhancements (Data & Settings)
**Goal:** Make the system usable "out of the box" and configurable.

### 2.1 Settings Exposure (Backend + Frontend)
*   [NEW] `GET/PUT /api/settings/integrations`: Manage API keys securely.
*   [NEW] `GET/PUT /api/settings/localization`: Manage default languages.
*   [NEW] Frontend "Settings" Section:
    *   Tabs: General, Team, Integrations, Billing, Logs.
    *   **Action:** Verify "Planer" content visibility.

### 2.2 Data Population (Seeding)
*   **Scenarios:** Pre-fill 5 common templates (Lead Gen, Support, Feedback, Catalog, Quiz).
*   **Normalization:** Seed `Brands`, `Models`, `Colors` (EN/UA/RU) into DB.

---

## Phase 3: Internationalization (i18n)
**Goal:** Native support for EN, UA, RU.

### 3.1 Backend i18n
*   Store content in `jsonb` or separate `Translation` tables where dynamic.
*   Static errors/messages: Use `i18next-fs-backend`.

### 3.2 Frontend i18n
*   Replace monolithic `translations.ts`.
*   Implement `react-i18next` with lazy-loading JSONs (`public/locales/{lang}/translation.json`).
*   Language Switcher UI in Navbar.

---

## Phase 4: Integrations (Meta & SendPulse)
**Goal:** Connect external marketing ecosystems.

### 4.1 Meta (Facebook/Instagram)
*   [NEW] `MetaService`: CAPI (Conversions API) integration.
*   **Events:** `Lead`, `ViewContent` (Car), `Contact`.

### 4.2 SendPulse
*   [NEW] `SendPulseService`: Sync email leads to mailing lists.
*   **Trigger:** On `Lead` creation.

### 4.3 Additional Messenger Bots
*   **WhatsApp, Viber:** Add to `@modules/Communication`.
*   **Instagram:** Consolidate with Meta integration.

---

## Phase 5: UI/UX "Pro Max" Polish
**Goal:** "Wow" factor - Premium Auto Dealer Aesthetic.

### 5.1 Design System Upgrade
*   **Theme:** "Black & Metallic". Dark mode optimization.
*   **Visuals:** Glassmorphism cards, premium typography, metallic gradients.
*   **Interactions:** Hover states, micro-interactions (framer-motion).
*   **Mobile:** Verify "Mini App" responsiveness.

### 5.2 Critical Flow Walkthroughs
*   **Login:** Shake animation on error, smooth fade-in.
*   **Dashboard:** Real-time charts (Recharts).
*   **Kanban (Leads):** Drag-and-drop smoothness (dnd-kit).

---

## Phase 6: Verification
**Goal:** Ensure 100% functionality.

*   [ ] **Automated:** Run `npm test` (Backend).
*   [ ] **Manual:** URL Check `https://cartie2.umanoff-analytics.space`.
*   [ ] **Security:** Audit new Settings endpoints.
