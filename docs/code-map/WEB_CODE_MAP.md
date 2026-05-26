# Web Code Map

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

`apps/web/src/App.tsx` defines the visible React Router surface. Public MiniApp and request/proposal routes live beside protected operational screens.

| Route | Element | Surface |
| --- | --- | --- |
| `/login` | `Login` | public |
| `/p/request` | `PublicRequest` | public |
| `/p/app` | `MiniApp` | public |
| `/p/app/:slug` | `MiniApp` | public |
| `/p/dealer` | `DealerPortal` | public |
| `/p/proposal/:id` | `ClientProposal` | public |
| `/` | `ProtectedRoute` | protected/app |
| `/inbox` | `ProtectedRoute` | protected/app |
| `/requests` | `ProtectedRoute` | protected/app |
| `/telegram` | `ProtectedRoute` | protected/app |
| `/telegram/sources` | `ProtectedRoute` | protected/app |
| `/scenarios` | `ProtectedRoute` | protected/app |
| `/leads` | `ProtectedRoute` | protected/app |
| `/search` | `ProtectedRoute` | protected/app |
| `/inventory` | `ProtectedRoute` | protected/app |
| `/companies` | `ProtectedRoute` | protected/app |
| `/entities` | `ProtectedRoute` | protected/app |
| `/settings` | `ProtectedRoute` | protected/app |
| `/content` | `ProtectedRoute` | protected/app |
| `/calendar` | `ProtectedRoute` | protected/app |
| `/partners` | `ProtectedRoute` | protected/app |
| `/company` | `ProtectedRoute` | protected/app |
| `/help` | `ProtectedRoute` | protected/app |
| `/integrations` | `ProtectedRoute` | protected/app |
| `mtproto` | `MTProtoIntegration` | protected/app |
| `:type` | `IntegrationEditor` | protected/app |
| `/qa` | `ProtectedRoute` | protected/app |
| `/health` | `ProtectedRoute` | protected/app |
| `/superadmin/*` | `ProtectedRoute` | protected/app |
| `*` | `NotFound` | protected/app |

Primary UI risk areas are large page-level components; see `RISK_REGISTER.md` before refactoring `MiniApp.tsx`, `Inbox.tsx`, or `Inventory.tsx`.
