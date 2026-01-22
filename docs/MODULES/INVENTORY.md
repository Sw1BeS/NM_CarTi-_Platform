# Inventory Module

> Purpose: Car inventory and normalization
> Submodules: inventory, normalization

## Module Structure
```
apps/server/src/modules/Inventory/
├── inventory/
│   ├── inventory.routes.ts
│   └── inventory.service.ts
└── normalization/
    ├── normalizationStore.ts
    ├── normalizeBrand.ts
    ├── normalizeCity.ts
    ├── normalizeModel.ts
    ├── normalizePhone.ts
    └── normalizeBrand.test.ts
```

## Key Endpoints
- GET /api/inventory/cars
- POST /api/inventory/cars

## Integration Points
- Prisma for inventory CRUD
- Normalization helpers used in request/lead handling

## Verification Checklist
- Inventory list returns
- Normalization helpers behave as expected

Last updated: 2026-01-22
