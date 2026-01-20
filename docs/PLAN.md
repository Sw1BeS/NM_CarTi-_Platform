# Orchestration Plan: System Audit & Deployment

This plan covers the comprehensive audit, verification, and deployment of the Cartie automotive platform.

## Agents Involved
1. **project-planner**: (Current Phase) - Orchestration planning and system mapping.
2. **backend-specialist**: Audit and fix all backend modules (Leads, Inventory, Parser, B2B, TG).
3. **frontend-specialist**: Audit and fix all frontend pages and ensure they connect to the backend.
4. **test-engineer**: Run verification scripts and validate system integrity.
5. **devops-engineer**: Execute production deployment and verify live environment.

## Phase 1: Comprehensive Audit & Verification

### 1. Leads & CRM
- Audit `Lead` and `BotMessage` models.
- Verify lead capture flow from Telegram bots.
- Verify `Leads.tsx` display and actions.

### 2. Inventory Management
- Fix `CarListing` schema issues (missing `sourceChatId`).
- Verify manual and automated inventory updates.
- Verify `Inventory.tsx` CRUD operations.

### 3. Telegram & Bots
- Verify `BotConfig`, `BotSession`, and `Scenario` logic.
- Test `TelegramHub.tsx` dashboard and bot management.
- Ensure scenarios/templates are correctly associated with the "Cartie Auto" workspace.

### 4. Auto Parser & Search
- Verify `parser.ts` and `urlParser.ts` functionality (AutoRia, etc.).
- Audit `Search.tsx` integration with parser services.
- Test car saving from search results to inventory.

### 5. B2B Requests & Proposals
- Audit `B2bRequest` and `RequestVariant` models.
- Verify request collection and variant submission flow.
- Ensure `Requests.tsx` shows all relevant data and actions.

### 6. Integrations & Settings
- Verify `Integration` model and supported types (Webhooks, TG channels).
- Audit `Settings.tsx` and `CompanySettings.tsx`.
- Ensure workspace-level configurations are correctly applied.

## Phase 2: Implementation & Fixes (Parallel)
- **Backend**: Apply fixes to schema, services, and routes.
- **Frontend**: Resolve UI bugs, non-working buttons, and API connectivity issues.
- **Testing**: Develop and run integration tests for core flows.

## Phase 3: Deployment & Final Verification
- Run `verify_all.py` (or equivalent scripts).
- Perform security scan (`security_scan.py`).
- Execute `npm run build` and deploy to production.
- Final health check on `https://cartie2.umanoff-analytics.space/`.

## User Review Required
> [!IMPORTANT]
> The seed script was previously modified to bypass mismatching schema in `CarListing`. In Phase 2, we will resolve these schema issues permanently.

Onaylıyor musunuz? (Y/N)
