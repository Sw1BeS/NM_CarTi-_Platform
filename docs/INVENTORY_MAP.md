# Inventory Map - Cartie2

## 1. Core Modules (Backend)
Located in `apps/server/src/modules`:

| Module | Sub-components | Status |
|--------|----------------|--------|
| **Inventory** | `inventory`, `normalization` | Active. Normalization has mocks for Autoria? |
| **Sales** | `requests` | Active. |
| **Communication** | `bots`, `telegram` | Active. |
| **Core** | `auth`, `system`, `templates`, `companies`, `users`, `superadmin` | Active. Foundation. |
| **Integrations** | `whatsapp`, `mtproto`, `viber`, `meta`, `sendpulse` | Partial. Implementation details vary. |

## 2. Frontend Pages (Routes)
Located in `apps/web/src/pages`:

### App (Protected)
- `Dashboard`
- `Inbox` (Unified Communication)
- `Leads` (Pipeline)
- `Requests` (B2B/Client Requests)
- `Inventory` (Car Catalog)
- `ContentCalendar` & `Content`
- `ScenarioBuilder` (Bot Logic)
- `AutomationBuilder`
- `TelegramHub`
- `Integrations`
- `Settings`, `CompanySettings`
- `Marketplace`, `Entities`, `Search`, `Health`

### Public
- `Login`
- `ClientProposal`
- `PublicRequest`
- `MiniApp`
- `DealerPortal`

### Superadmin
- `Users`
- `Companies`
- `DashboardRoutes`

## 3. Integrations Status

| Integration | UI Config | Backend Service | Connection Test | Data Sync |
|-------------|-----------|-----------------|-----------------|-----------|
| **Meta Pixel** | ✅ Yes | ✅ `meta.service.ts` | ✅ Implemented | ⚠️ Insecure Hash (needs fix) |
| **SendPulse** | ✅ Yes | ✅ `sendpulse.service.ts` | ⚠️ UI only? | ❌ TODO in `integration.service.ts` |
| **Google Sheets**| ✅ Yes | ❌ Missing Service | ❌ Missing | ❌ TODO in `integration.service.ts` |
| **Webhook** | ✅ Yes | N/A | ✅ Implemented | N/A |
| **WhatsApp** | N/A | `whatsapp.service.ts` | ? | ⚠️ TODO: Route to Inbox |

## 4. Key Services & APIs
- `apiClient.ts`: Main axios instance.
- `serverAdapter.ts`: Adapter for backend communication.
- `systemApi.ts`: System status and configuration.
