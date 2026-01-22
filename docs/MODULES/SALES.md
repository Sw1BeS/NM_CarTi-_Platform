# Sales Module

> Purpose: B2B requests and lead pipeline
> Submodules: requests

## Module Structure
```
apps/server/src/modules/Sales/
└── requests/
    └── requests.routes.ts
```

## Key Endpoints
- POST /api/public/requests
- GET /api/requests
- POST /api/requests/:id/variants
- POST /api/public/leads
- GET /api/leads

## Integration Points
- Prisma access for requests and variants
- Public request creation in `apps/server/src/routes/publicRoutes.ts`

## Verification Checklist
- Public request create returns
- Requests list returns
- Variants can be created

Last updated: 2026-01-22
