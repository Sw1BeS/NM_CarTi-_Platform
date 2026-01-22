# Core Module

> **Purpose**: Authentication, multi-tenancy, system administration  
> **Submodules**: `auth`, `companies`, `superadmin`, `system`, `templates`, `users`

---

## Overview

Core platform functionality including:
- User

 authentication and JWT management
- Multi-tenant workspace isolation
- System administration and monitoring
- Marketplace template management
- User management and seeding

---

## Module Structure

```
modules/Core/
├── auth/
│   └── auth.routes.ts          # Login, register, JWT
├── companies/
│   ├── company.routes.ts       # Workspace CRUD
│   └── company.service.ts
├── superadmin/
│   ├── superadmin.routes.ts    # System-wide admin
│   ├── superadmin.service.ts
│   └── superadmin.types.ts
├── system/
│   ├── system.routes.ts        # Health, metrics
│   └── system.service.ts
├── templates/
│   ├── template.routes.ts      # Marketplace templates
│   └── template.service.ts
└── users/
    └── user.service.ts          # User seeding, helpers
```

---

## Key Entities

- `User` / `GlobalUser` - User accounts
- `Workspace` - Multi-tenant workspace (company)
- `Membership` - User-workspace association
- `ScenarioTemplate` - Marketplace templates
- `SystemLog` - Audit trail

---

## Critical Endpoints

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/companies` - List workspaces
- `POST /api/companies` - Create workspace
- `GET /api/users` - List users (admin)
- `GET /api/templates` - List marketplace templates
- `GET /api/system/health` - System health check

---

## Integration Points

- **Prisma**: Heavy direct usage for auth, workspaces, users (⚠️ Phase 3 refactor target)
- **JWT**: `jsonwebtoken` for auth tokens
- **Middleware**: `workspaceContext` for tenant isolation

---

## Verification Checklist

✅ Login returns valid JWT  
✅ Workspace isolation works (users see only their data)  
✅ Admin can create users/workspaces  
✅ System health endpoint returns status  
✅ Marketplace templates load correctly

---

**Owner**: Core platform domain  
**Last Updated**: 2026-01-22
