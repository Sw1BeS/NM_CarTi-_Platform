# PR-0: Preparation — v4.1 Multi-Tenant DB Foundation

**Status:** ✅ Complete  
**Date:** 2026-01-19  
**Breaking Changes:** None (all changes are additive and feature-flagged)

## Overview

This PR sets up the infrastructure for v4.1 multi-tenant database foundation without any breaking changes. All new functionality is feature-flagged and disabled by default.

## Changes

### 1. Dependencies

Added `ulid` package for ULID generation:
```bash
npm install ulid@^2.3.0
```

### 2. New Files

#### [`src/utils/ulid.ts`](file:///srv/cartie/apps/cartie2_repo/apps/server/src/utils/ulid.ts)
- `generateULID()`: Generate 26-character ULID for v4.1 ID fields
- `SYSTEM_WORKSPACE_ID`: Constant for system workspace (`01SYSTEM00000000000000000000`)
- `isValidULID()`: Validate ULID format

#### [`src/utils/constants.ts`](file:///srv/cartie/apps/cartie2_repo/apps/server/src/utils/constants.ts)
- System entity type slugs: `car`, `lead`, `contact`
- System dictionary slugs: `make`, `model`, `city`, etc.
- Feature flags: `FEATURE_FLAGS` object reading from env vars
- Default roles, record statuses, message directions

#### [`src/middleware/workspaceContext.ts`](file:///srv/cartie/apps/cartie2_repo/apps/server/src/middleware/workspaceContext.ts)
- `workspaceContext`: Middleware to extract workspace from headers/subdomain/JWT
- `requireWorkspace`: Middleware to enforce workspace presence
- `getWorkspaceId()`: Helper to get workspace ID from request
- `WorkspaceRequest`: Extended Express Request type

### 3. Modified Files

#### [`package.json`](file:///srv/cartie/apps/cartie2_repo/apps/server/package.json)
- Added `ulid` dependency

#### [`.env.example`](file:///srv/cartie/apps/cartie2_repo/apps/server/.env.example)
- Added v4.1 feature flags with documentation:
  - `USE_V4_WORKSPACE_SCOPING`
  - `USE_V4_DUAL_WRITE`
  - `USE_V4_READS`
  - `USE_V4_SHADOW_READS`

## Usage

### Generate ULIDs

```typescript
import { generateULID, SYSTEM_WORKSPACE_ID } from './utils/ulid';

const workspaceId = generateULID(); // "01HQXYZ..."
console.log(SYSTEM_WORKSPACE_ID);   // "01SYSTEM00000000000000000000"
```

### Use Constants

```typescript
import { SYSTEM_ENTITY_TYPES, FEATURE_FLAGS } from './utils/constants';

if (FEATURE_FLAGS.USE_V4_DUAL_WRITE) {
  // Write to both legacy and v4.1 tables
}

const entityTypeSlug = SYSTEM_ENTITY_TYPES.CAR; // "car"
```

### Workspace Middleware (when enabled)

```typescript
import express from 'express';
import { workspaceContext, requireWorkspace, WorkspaceRequest } from './middleware/workspaceContext';

const app = express();

// Apply globally
app.use(workspaceContext);

// Require on specific routes
app.get('/api/records', requireWorkspace, (req: WorkspaceRequest, res) => {
  const workspaceId = req.workspaceId!; // TypeScript knows it exists after requireWorkspace
  // ...
});
```

**Workspace extraction order:**
1. `X-Workspace-Slug` header
2. `X-Workspace-Id` header
3. Subdomain (e.g., `demo.cartie.com` → `demo`)
4. JWT token workspace claim

## Feature Flags

All flags default to `false` for backward compatibility. Enable progressively during rollout:

| Flag | Phase | Purpose |
|------|-------|---------|
| `USE_V4_WORKSPACE_SCOPING` | PR-0 | Enable workspace middleware |
| `USE_V4_DUAL_WRITE` | PR-2 | Write to both legacy + v4.1 |
| `USE_V4_READS` | PR-4 | Read from v4.1 instead of legacy |
| `USE_V4_SHADOW_READS` | PR-4 | Log parity issues (requires USE_V4_READS=false) |

## Testing

```bash
# Run TypeScript compiler to check for errors
npm run build

# Test ULID generation
node -e "const {generateULID} = require('./dist/utils/ulid.js'); console.log(generateULID());"

# Test feature flags
export USE_V4_WORKSPACE_SCOPING=true
npm run dev
# Send request with header: curl -H "X-Workspace-Slug: demo" http://localhost:3000/api/test
```

## Rollback

Since all changes are additive and feature-flagged:
1. Ensure all feature flags are `false` in .env
2. If needed, remove middleware from Express app
3. Revert package.json and run `npm install`

## Next Steps

- **PR-1: Expand** — Create v4.1 database tables with migrations
- **PR-2: Dual-Write** — Implement dual-write services for Workspace/User
- **PR-3: Backfill** — Migrate legacy data to v4.1 tables
- **PR-4: Switch Reads** — Enable v4.1 reads after validation
- **PR-5: Cleanup** — Remove legacy tables (30+ days after stable)
