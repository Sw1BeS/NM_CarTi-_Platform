# Tenant Contract Matrix (2026-02-19)

## Canonical Contract
- `JwtUserPayload.companyId` and `JwtUserPayload.workspaceId` are now treated as one tenant identifier.
- If both claims exist and differ, token is rejected (`apps/server/src/middleware/auth.ts`).
- Non-superadmin user-facing routes no longer rely on implicit `company_system` fallback for access.

## Endpoint-by-Endpoint Compatibility
| Endpoint group | Legacy behavior | New behavior |
|---|---|---|
| `POST /api/auth/login` | If user tenant missing, fallback to `company_system` | hard-fail with `AUTH_TENANT_REQUIRED` |
| `POST /api/superadmin/impersonate` | fallback to `company_system` when tenant unresolved | hard-fail (`Target user has no tenant context`) |
| `POST /api/bots` | could fallback to `company_system` when company missing | company context is mandatory |
| `GET/PUT/DELETE /api/inventory/*` | allowed orphan records for `company_system` user | non-superadmin denied if `companyId` missing on resource |
| `PUT/POST/DELETE /api/requests/*` | allowed orphan resources for `company_system` user | non-superadmin denied if `companyId` missing on resource |
| `GET/PUT/DELETE /api/drafts*` | special `company_system` access to `botId=null` drafts | only superadmin can access orphan (`botId=null`) drafts |

## Residual `company_system` Usage
Only system seed/bootstrap path remains:
- `apps/server/src/modules/Core/users/user.service.ts`
  - lookup by id/slug to ensure system workspace exists for seed bootstrap
  - no user-facing implicit authorization fallback
