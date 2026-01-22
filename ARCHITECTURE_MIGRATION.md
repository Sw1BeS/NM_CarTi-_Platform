# Architecture Migration Plan: Unifying to v4.1 Data Model

## 1. Executive Summary
The platform currently operates on a hybrid data model:
-   **Legacy:** Hardcoded tables (`Lead`, `CarListing`, `BotConfig`) heavily coupled to specific logic.
-   **v4.1:** A generic Entity-Attribute-Value (EAV) system (`Record`, `EntityType`, `FieldDefinition`) designed for flexibility and multi-tenancy.

This document outlines the strategy to migrate the Legacy models into the v4.1 system, unifying the platform into a single, maintainable architecture.

## 2. Target Architecture (v4.1)

### 2.1 Core Concepts
-   **Workspace:** Replaces `Company`. A tenant container.
-   **EntityType:** Defines a class of data (e.g., "Car", "Deal").
-   **Record:** An instance of data (e.g., a specific BMW X5).
-   **Contact:** A person (replacing `Lead` contact info).
-   **Pipeline/Case:** Replaces the process-flow aspect of `Lead`.

### 2.2 Mapping Strategy

#### A. Leads -> Contacts + Deals
A "Lead" is currently a mix of a **Person** (phone, name) and an **Intent** (buy a car).
We will split this:
1.  **Contact:** Stores `clientName`, `phone`, `userTgId`.
2.  **Record (Type: "Deal"):** Stores `request`, `status`, `source`, `payload`.
3.  **Relation:** The `Deal` record is linked to the `Contact`.

| Legacy Field (`Lead`) | Target Field (v4.1) | Notes |
| :--- | :--- | :--- |
| `id` | `Record.id` (Deal) | |
| `clientName` | `Contact.name` | Normalized |
| `phone` | `Contact.phone_e164` | |
| `status` | `Record.attributes.status` | Enum mapped to Select |
| `request` | `Record.attributes.requirements` | |
| `userTgId` | `Identity.external_id` | Linked via Channel |

#### B. CarListings -> Records (Type: "Car")
Direct mapping of the inventory table to the generic record table.

| Legacy Field (`CarListing`) | Target Field (v4.1) | Notes |
| :--- | :--- | :--- |
| `id` | `Record.id` | Keep UUIDs if possible |
| `title` | `Record.attributes.title` | |
| `price` | `Record.attributes.price` | |
| `specs` | `Record.attributes.*` | Flattened JSON |
| `mediaUrls` | `Record.attributes.images` | JSON Array |

#### C. BotConfig -> Channels + Accounts
A "Bot" is just a communication channel configuration.

| Legacy Field (`BotConfig`) | Target Field (v4.1) | Notes |
| :--- | :--- | :--- |
| `token` | `Channel.config_enc` | Encrypted |
| `template` | `Account.config` | Logic definition |
| `companyId` | `Channel.workspace_id` | |

## 3. Migration Phasing

### Phase 1: Preparation (Dual Write)
1.  **Seed Entity Types:** Create "Car" and "Deal" definitions in `EntityType` table.
2.  **Adapter Pattern:** Create `V4LeadRepository` and `V4CarRepository` that implement the existing repository interfaces but read/write to `Record` tables.
3.  **Sync Script:** Create a background job to copy existing `Lead`/`CarListing` data to `Record`/`Contact` tables in real-time (Dual Write).

### Phase 2: Switchover (Read from New)
1.  **Feature Flag:** Toggle `USE_V4_DATA_SOURCE = true`.
2.  **Switch Reads:** Update API endpoints (`GET /leads`, `GET /inventory`) to use the V4 Repositories.
3.  **Validation:** Verify data integrity.

### Phase 3: Cleanup
1.  **Deprecate Writes:** Stop writing to old tables.
2.  **Drop Tables:** Remove `Lead`, `CarListing`, `BotConfig` from `schema.prisma`.
3.  **Cleanup Code:** Remove old specific repositories and direct Prisma calls.

## 4. Code Refactoring Guide

### 4.1 The "Adapter" Approach
Instead of rewriting all Controllers and Services immediately, we replace the *Data Access Layer*.

**Current:**
```typescript
// service.ts
const leads = await prisma.lead.findMany({ where: { status: 'NEW' } });
```

**New:**
```typescript
// repository/lead.repository.ts
class LeadRepository {
  async findNew() {
     // Under the hood, queries 'Record' table
     const entityId = await getEntityId('deal');
     return prisma.record.findMany({
       where: {
         entity_type_id: entityId,
         attributes: { path: ['status'], equals: 'NEW' }
       }
     });
  }
}
```

### 4.2 Security & Multi-tenancy
The v4.1 `Record` table has a mandatory `workspace_id`. This enforces stricter multi-tenancy than the legacy optional `companyId`.
**Action:** All migration scripts must ensure every record is assigned to a valid `Workspace` (created from existing `Companies`).

## 5. Deployment & Rollback
-   **Migration Script:** `scripts/migrate_legacy_to_v4.ts` (Idempotent).
-   **Rollback:** Since we use Dual Write in Phase 1, we can revert to reading legacy tables instantly if issues arise.
