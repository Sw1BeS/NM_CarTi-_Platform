# Sales Module

> **Purpose**: B2B requests and lead management  
> **Submodules**: `requests`

---

## Overview

Sales pipeline management:
- B2B car requests
- Lead tracking
- Variant proposals

---

## Module Structure

```
modules/Sales/
└── requests/
    ├── requests.routes.ts      # B2B request CRUD
    └── requests.service.ts
```

---

## Key Entities

- `B2BRequest` - Car buying request
- `Lead` - Customer lead
- `RequestVariant` - Car variant proposal for request

---

## Critical Endpoints

- `POST /api/public/requests` - Create B2B request (public)
- `GET /api/requests` - List B2B requests
- `POST /api/requests/:id/variants` - Add car variant to request
- `POST /api/leads` - Create lead
- `GET /api/leads` - List leads

---

## Integration Points

- **Prisma**: Direct calls for requests, leads (⚠️ Phase 3 refactor)
- **Public API**: No-auth request creation for dealer portals

---

## Verification Checklist

✅ Public request can be created without auth  
✅ Request appears in admin panel  
✅ Variants can be added to request  
✅ Lead creation works  
✅ Leads list correctly

---

**Owner**: Sales domain  
**Last Updated**: 2026-01-22
