# PLAN: Optimization and Fixes

## Phase 3: Immediate Fixes (Code Changes)

### P0: Deployment Stability
- [x] Create `infra/deploy_prod.sh` (Completed during audit)
- [ ] Verify execution permissions and test (dry run)
- [ ] Remove obsolete scripts: `infra/deploy_infra2.sh`, `infra/deploy_manual.sh`, `infra/monitor.sh`

### P0: Feature Flags Cleanup
- [ ] Modify `apps/server/src/utils/constants.ts`:
    -   Remove `FEATURE_FLAGS` object or set all to true/hardcode usage.
    -   Ensure `USE_V4_READS` is the default behavior.
- [ ] Check `apps/server/prisma/seed.ts` to ensure it seeds v4 data unconditionally.

### P1: Data Seeding & Realism
- [ ] Update `apps/server/prisma/seed.ts`:
    -   Ensure `Workspace` is created.
    -   Ensure `EntityType` definitions exist for `car` and `lead`.
    -   Seed `Record` entries for Cars (BMW X5, Audi Q7, etc.).
    -   Seed `Record` entries for Leads.
    -   Seed `BotConfig` and `MTProtoConnector`.

### P1: Decompose & Link Modules
- [ ] **Integrations**: Refactor `apps/web/src/pages/app/IntegrationsLayout.tsx` to explicitly list sub-pages instead of just generic `:type`.
    -   Add specific links/tabs for `Telegram`, `Meta`, `SendPulse`.
- [ ] **Templates**: The backend `Core/templates` seems to be used by `Marketplace.tsx`. Verify `Marketplace` route exists.
    -   *Correction*: `Marketplace` page exists but wasn't in my initial route map. Check `App.tsx` again.
    -   If missing, add route `/marketplace`.

### P2: Code Cleanup
- [ ] Remove `_archive` folder.
- [ ] Remove `.bak` files.

## Phase 4: Telegram Integration
- [ ] **Bot Webhook**:
    -   Review `apps/server/src/modules/Core/system/webhook.controller.ts` (if exists) or find where webhooks are handled.
    -   Implement/Verify `X-Telegram-Bot-Api-Secret-Token`.
    -   Ensure idempotent processing (dedup `update_id`).
- [ ] **MTProto**:
    -   Review `apps/server/src/modules/Integrations/mtproto/mtproto.service.ts`.
    -   Ensure it writes to `Record` (v4) or `CarListing` (legacy) which is then synced.

## Phase 5: Proposed "Ready Solutions"
-   Draft `docs/PLAN.md`.
