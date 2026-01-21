# Gap List - Cartie2

## Critical (P0) - Blocking Production
1.  **Meta Pixel Security**: `hash` function in `meta.service.ts` is insecure (returns raw string). Must use SHA256.
2.  **SendPulse Integration**: `integration.service.ts` has `TODO: Implement SendPulse API call`. Connection test works but actual sync might be missing.
3.  **Google Sheets**: `TODO: Implement Google Sheets API`.
4.  **Autoria Integration**: `autoria.service.ts` returns mock results for "MVP". Needs real implementation or secure fallback.
5.  **WhatsApp**: `TODO: Route to Unified Inbox`. Messages might be lost.
6.  **Environment Variables**: Ensure all new integrations (Meta, SendPulse) have generic support in `.env` and are not hardcoded.

## High (P1) - Functionality & UX
1.  **Empty States**: Review `translations.empty-states.ts` and ensure all pages have proper empty states, not just blank screens.
2.  **Dashboard**: Verify if `Dashboard.tsx` uses real data. Currently suspected to be partial.
3.  **ScenarioBuilder**: Check for "TODO: Use Enum" in `scenario.engine.ts`.
4.  **Lead Service**: `TODO: Add addressBookId to settings` in `leadService.ts`.

## Medium (P2) - Polish & Refactoring
1.  **File Structure**: `apps/server/src/modules/Integrations` has mix of folders and files. Should be standardized.
2.  **Type Safety**: `TODO: Migrate callers to use UnifiedWorkspace type` in `company.service.ts`.
3.  **I18n**: Ensure new integration pages are fully translated.

## Verification Required
- Verify `Leads` and `Requests` pages for mock data usage.
- specific integrations functionalities like "Test Connection" for SendPulse might be checking config only, not actual API validity.
