# Artifact 2: Gap List

## 1. Functional Gaps (Critical P0)
| Area | Feature | Gap Description | Fix Required |
|------|---------|-----------------|--------------|
| **Integrations** | **Meta (Facebook)** | Service class exists but is not wired to system events (Lead creation, Request submission). Frontend UI for config exists in `Settings.tsx` but might not sync with Backend `IntegrationService`. | Wire `MetaService` to `Lead` and `Request` events. Verify Config sync. |
| **Integrations** | **SendPulse** | Enum exists, but no Service implementation found. No UI in Settings. | Implement `SendPulseService` (Email/CRM). Add Config UI in Settings. |
| **I18n** | **Language Switcher** | `LangProvider` exists, and `translations.ts` is populated, but no visible Switcher in `Settings` or `Layout`. user cannot change language. | Add Language Switcher to `Settings` (or Topbar). |
| **Data** | **Seeding** | `seed.ts` generates "Demo Motors" with fake cars/leads. Production build should be clean or have only "System" data. | Refactor `seed.ts` to separate "Demo" logic from "Production Init". |

## 2. Frontend Polish (P1)
- **Empty States**: Many pages (`Inbox`, `Leads`) likely show blank tables instead of helpful "Get Started" empty states.
- **Visual Stagnation**: "Content Planner" mentioned as working but `Content.tsx` needs verification of full functionality.
- **Navigation**: `Companies` and `CompanySettings` might be redundant or confusing. Merge or clarify.

## 3. Backend Architecture (P2)
- **File Structure**: `Integrations` folder has `meta/` but `mtproto` is separate? Unify structure.
- **Unused Code**: `mockDb` or legacy files mentioned in previous user context might still exist. Clean up.

## 4. Missing Artifacts
- **Browser Proof**: Need to verify actual rendering on `https://cartie2.umanoff-analytics.space`.
- **Tests**: `npm test` running for 4h+ suggests hung process or lack of actual tests. Need smoke tests.
