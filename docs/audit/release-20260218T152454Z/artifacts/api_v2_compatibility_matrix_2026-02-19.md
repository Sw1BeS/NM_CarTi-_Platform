# API v2 Compatibility Matrix (2026-02-19)

## Versioning Policy
- New versioned layer: `/api/v2/*`.
- Response contract: unified envelope `{ ok, data|error, meta:{ version:'v2', timestamp } }`.
- Legacy `/api/*` now emits deprecation headers:
  - `Deprecation: true`
  - `Sunset: Tue, 31 Mar 2026 23:59:59 GMT`
  - `Link: </api/v2>; rel="successor-version"`

## Route Mapping
| Legacy path | v2 path |
|---|---|
| `/api/health` | `/api/v2/health` |
| `/api/public/*` | `/api/v2/public/*` |
| `/api/miniapp/*` | `/api/v2/miniapp/*` |
| `/api/auth/*` | `/api/v2/auth/*` |
| `/api/system/*` | `/api/v2/system/*` |
| `/api/entities/*` | `/api/v2/entities/*` |
| `/api/inventory/*` | `/api/v2/inventory/*` |
| `/api/requests/*` | `/api/v2/requests/*` |
| `/api/companies/*` | `/api/v2/companies/*` |
| `/api/templates/*` | `/api/v2/templates/*` |
| `/api/integrations/*` | `/api/v2/integrations/*` |
| `/api/superadmin/*` | `/api/v2/superadmin/*` |
| `/api/qa/*` | `/api/v2/qa/*` |
| `/api/telegram/*` | `/api/v2/telegram/*` |
| legacy shim (`/api/*` compatibility router) | `/api/v2/*` (same mount under v2 router) |

## Contract Tests
- `apps/server/src/__tests__/api.v2.envelope.test.ts`
  - success envelope assertion
  - error envelope assertion
  - legacy deprecation header assertion
