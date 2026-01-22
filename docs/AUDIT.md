
## Phase 1: Platform Integrity Audit (Continued)
### Data Model & Realism
The `prisma/schema.prisma` shows a complex state of migration.
- **Legacy Models**: `Company`, `BotConfig`, `Lead`, `CarListing`
- **v4.1 Models**: `Workspace`, `Account`, `Record`, `EntityType`
- **Dual Write**: `FEATURE_FLAGS` in `apps/server/src/utils/constants.ts` control this.

**Findings**:
1.  **Feature Flags**: `FEATURE_FLAGS` are used in `seed.ts` and potentially implicit in logic (though grep only showed seed and constants). The user requested to **DELETE** feature flags and make everything available.
2.  **Duplication**: There are legacy models (`CarListing`) and generic v4 models (`Record` with `entity_type`).
3.  **Realism Needed**:
    -   `Workspace` (instead of just Company)
    -   `BotConfig` linked to Workspace
    -   `MTProtoConnector` linked to Workspace
    -   `Record` (Inventory/Leads) populated via v4 models? Or legacy? The flags suggest `USE_V4_READS: true` is set, so we should prefer v4 models or ensure legacy maps to them.

### Recommended "Minimal Real Data" Set
1.  **Workspace**: "Cartie Demo"
2.  **GlobalUser**: Admin user linked to Workspace
3.  **BotConfig**: One "Demo Bot" (polling mode or webhook placeholder)
4.  **MTProtoConnector**: One "Source Channel" (e.g., specific public channel)
5.  **Entities**:
    -   `EntityType`: "car", "lead"
    -   `Record`: 5-10 cars with realistic attributes (Brand, Model, Price, Year, Photos)
    -   `Record`: 5-10 leads with different statuses
6.  **Integrations**: One placeholder integration (e.g., generic Webhook)

## Phase 2: Code Complexity
### "Trash" check
- `_archive/` folder exists.
- `deploy_infra2.sh`, `deploy_manual.sh`, `monitor.sh` in `infra/` are likely obsolete.
