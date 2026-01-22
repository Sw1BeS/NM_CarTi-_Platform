# Core Module

> Purpose: Authentication, tenancy, system config, templates, users
> Submodules: auth, companies, superadmin, system, templates, users

## Module Structure
```
apps/server/src/modules/Core/
├── auth/
│   └── auth.routes.ts
├── companies/
│   ├── company.routes.ts
│   └── company.service.ts
├── superadmin/
│   ├── client-manager.service.ts
│   ├── superadmin.routes.ts
│   └── superadmin.service.ts
├── system/
│   ├── settings.service.ts
│   ├── system.routes.ts
│   └── systemLog.service.ts
├── templates/
│   ├── template.routes.ts
│   └── template.service.ts
└── users/
    └── user.service.ts
```

## Key Endpoints
- POST /api/auth/login
- POST /api/auth/register
- GET /api/companies
- GET /api/users
- GET /api/templates
- GET /api/system/settings/public

## Integration Points
- JWT auth middleware
- Workspace context middleware
- Prisma access for users/workspaces/templates

## Verification Checklist
- Login returns JWT
- Workspace-scoped data access works
- System settings public endpoint returns config

Last updated: 2026-01-22
