# Inventory Module

> **Purpose**: Car inventory and data normalization  
> **Submodules**: `inventory`, `normalization`

---

## Overview

Vehicle inventory management:
- Car catalog (inventory)
- Brand/model/city normalization
- Phone number normalization

---

## Module Structure

```
modules/Inventory/
├── inventory/
│   ├── inventory.routes.ts     # Car CRUD
│   └── inventory.service.ts
└── normalization/
    ├── brand.service.ts        # Brand standardization
    ├── city.service.ts         # City/region mapping
    ├── model.service.ts        # Model normalization
    ├── phone.service.ts        # Phone number parsing
    └── normalization.types.ts
```

---

## Key Entities

- `Car` - Inventory item
- `Brand` - Car manufacturer
- `Model` - Car model
- `City` - Location data

---

## Critical Endpoints

- `GET /api/inventory/cars` - List cars
- `POST /api/inventory/cars` - Add car
- `PUT /api/inventory/cars/:id` - Update car
- `DELETE /api/inventory/cars/:id` - Remove car

---

## Integration Points

- **Prisma**: Direct calls for car CRUD (⚠️ Phase 3 refactor)
- **Normalization**: Brand/model/city helpers used across modules

---

## Verification Checklist

✅ Car can be added to inventory  
✅ Car appears in list  
✅ Brand normalization works (e.g., "BMW" = "bmw")  
✅ Phone normalization strips formatting  
✅ City autocomplete returns matches

---

**Owner**: Inventory domain  
**Last Updated**: 2026-01-22
