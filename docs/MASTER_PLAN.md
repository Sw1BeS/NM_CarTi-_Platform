# Master Plan: Cartie Platform Evolution

## 1. Context
The system is currently operational (infra-wise) but facing functional issues (Login 401) and requires a comprehensive audit, GitHub integration, and a long-term feature roadmap based on 23 specific user requirements.

## 2. Immediate Priorities (Fix & Stabilize)
### A. Login Fix (Critical)
- **Symptom**: 401 Unauthorized on `/api/auth/login`.
- **Action**: Check `AuthProvider` payload vs Backend expectation. Debug `bcrypt` or JWT secret usage.

### B. GitHub Workflow
- **Action**: Set up `.github/workflows` for CI/CD or verify existing ones. Ensure "Git Flow" is respected.

## 3. System Audit (Knowledge Base)
- **Goal**: "Understand every module and file."
- **Deliverables**:
    - `docs/ARCHITECTURE_DEEP_DIVE.md`: Detailed module map.
    - `docs/MODULE_STATUS.md`: Health check per module.

## 4. Strategic Roadmap (The 23 Points)
We have grouped the 23 points into 4 Strategic Pillars:

### Pillar I: Core Architecture & Standardization
*Points: 1 (Structure), 2 (Frontend Entities), 12 (Normalization), 14 (Entity Linking), 22 (Logical Files)*
- **Plan**: Enforce strict module boundaries. Move entity definitions to shared config (Frontend-driven).
- **CRITICAL**: Fix Frontend stability (Inbox crash, Menu visibility) immediately.

### Pillar II: User Experience & Customization
*Points: 5 (Super Admin), 9 (UI/UX), 11 (Client Exp), 19 (Mobile), 20 (Hints), 21 (Translations)*
- **Plan**: Implement "Theme Engine" for white-labeling. Mobile-first CSS refactor.

### Pillar III: Automation & Intelligent Data
*Points: 7 (Free Parsing), 13 (Easy Fill), 15 (History), 16 (Smart Sources)*
- **Plan**: Develop "Smart Parser" using cheerio/puppeteer with heuristic detection (no API dependency).

### Pillar IV: Expansion & Ecosystem
*Points: 3 (Universality), 4 (Bot Flow), 6 (Telegram Deep Integration), 8 (Templates), 10 (Analytics), 18 (Niche Adaptation)*
- **Plan**: Abstract "Car" to "Asset". Enhance Bot Engine with latest Telegram API features.

## 5. Execution Strategy
1.  **Fix Login** (Backend Specialist).
2.  **Audit System** (Explorer).
3.  **Draft Roadmap Details** (Product Planner).
