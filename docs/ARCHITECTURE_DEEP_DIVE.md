# Architecture Deep Dive

## Module Map
This document maps the system's core modules and their responsibilities.

### Backend (`apps/server/src/modules`)
- **auth/**: Authentication logic, JWT generation, bcrypt.
- **bots/**: Bot engine, registry, configuration.
- **companies/**: Multi-tenancy logic (Workspaces).
- **integrations/**: External API connections (Meta, Google Sheets).
- **inventory/**: Car/Asset management.
- **normalization/**: Data standardization logic (Brand/Model/City).
- **requests/**: B2B/Lead request processing.
- **superadmin/**: System-level administration.
- **telegram/**: Telegram-specific handlers (Webhooks, Polling).
- **templates/**: Scenario/Marketplace templates.
- **users/**: User management and seeding.

### Frontend (`apps/web/src/pages`)
- **Authentication**: `Login.tsx`
- **Dashboard**: `Dashboard.tsx`, `Health.tsx`
- **Core Operations**: `Inventory.tsx`, `Requests.tsx`, `Leads.tsx`, `Search.tsx`
- **Configuration**: `Settings.tsx`, `CompanySettings.tsx`
- **Automation**: `ScenarioBuilder.tsx`, `Content*.tsx`
- **Integration**: `Integrations.tsx`, `TelegramHub.tsx`
- **Portal**: `DealerPortal.tsx`, `PublicRequest.tsx`

## Improvements (Per Audit)
- **Structure**: Backend modules are well-separated. Frontend pages are flat - consider grouping by domain (e.g., `pages/crm/`, `pages/settings/`).
- **Missing**: No unified "Shared Types" package. Types are duplicated in `apps/web/src/types.ts` and backend DTOs.
