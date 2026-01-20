# Strategic Roadmap: Cartie v2 Evolution

Implementation of the 23-point improvement plan.

## Group 1: Architecture & Foundation
*(Points 1, 12, 14, 22)*
- **Objective**: Structural perfection and data integrity.
- **Actions**:
  - [ ] **Unified Entity System**: Define entities (Car, Client) in a shared package. Access them in Frontend via a `definitions` API, not hardcoded.
  - [ ] **Normalization Engine**: Implement "fuzzy matching" for brands/models (e.g., "БМВ" -> "BMW").
  - [ ] **Data Linking**: Create a graph-like relation system where an Inventory Item can be converted to a Channel Post or Client Offer with one click.

## Group 2: User Experience & Customization
*(Points 2, 5, 9, 11, 19, 20, 21)*
- **Objective**: Premium feel and Super-Admin control.
- **Actions**:
  - [ ] **Theme Configurator**: Allow Super Admin to set colors/logos per Workspace.
  - [ ] **Mobile Adaptation**: Refactor Grid layouts to Flex/Stack on <768px.
  - [ ] **Hints & Onboarding**: Add "TourGuide.js" for new users.
  - [ ] **Frontend-First Creation**: Allow creating new options (e.g., "Color") directly from the dropdown (Creatable Select).

## Group 3: Automation & Intelligence
*(Points 4, 6, 7, 13, 15, 16)*
- **Objective**: "Smart" tools that save time.
- **Actions**:
  - [ ] **Smart Parser**: Heuristic-based parser that takes a URL and guesses the "Price", "Title", "Images" without rigid templates.
  - [ ] **Telegram Power**: Use WebApps for rich interaction (Date pickers within TG).
  - [ ] **One-Click Fill**: Paste a block of text, use LLM to extract fields (Model, Year, VIN).

## Group 4: Business Logic
*(Points 3, 8, 10, 18)*
- **Objective**: Universal application.
- **Actions**:
  - [ ] **Abstract "Product"**: Rename `Car` to `Asset` internally to support Real Estate or generic items later.
  - [ ] **Template Engine**: Dynamic "Scenario" builder for Bot flows.
  - [ ] **Analytics**: Drill-down reports (Manager Efficiency, Channel ROI).

## Execution Plan
1. **Stabilize**: Fix Login & GitHub (Phase 2), Fix Frontend Crashes (Inbox, Menu).
2. **Standardize**: Refactor Entity Management (Phase 3).
3. **Enhance**: Roll out Smart Parser & Mobile UI (Phase 4).
