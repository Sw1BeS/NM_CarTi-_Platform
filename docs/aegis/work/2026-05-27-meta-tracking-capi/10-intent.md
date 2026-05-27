# Meta Tracking CAPI Implementation Intent

Date: 2026-05-27
Plan: `docs/aegis/plans/2026-05-27-meta-tracking-capi-implementation-plan.md`
Branch: `feature/meta-tracking-capi`

## Requested Outcome

Implement the approved Meta tracking and Telegram attribution plan in code, without production outbound calls to Meta or SalesDrive.

## Scope

- Add `AttributionSession` storage and first-party `/r/bot` redirect bridge.
- Bind valid Telegram `/start` attribution tokens without breaking existing aliases.
- Join sanitized attribution snapshots into lead/request payloads.
- Carry attribution through SalesDrive status feedback into B2C CRM CAPI.
- Harden B2C Meta sender timing, duplicate handling, retry logging, and sanitized summaries.

## Non-Goals

- No production Meta sends.
- No SalesDrive writes outside existing mocked/unit tests.
- No fake Meta `lead_id`.
- No changes to Cartie2 or unrelated infrastructure.

## Baseline Read Set

- `docs/aegis/plans/2026-05-27-meta-tracking-capi-implementation-plan.md`
- `docs/aegis/specs/2026-05-27-meta-tracking-capi-design.md`
- `docs/project-knowledge/META_TRACKING_KNOWLEDGE.md`
- `apps/server/prisma/schema.prisma`
- `apps/server/src/index.ts`
- `apps/server/src/config/env.ts`
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- `apps/server/src/modules/Communication/telegram/core/leadService.ts`
- `apps/server/src/services/miniapp.service.ts`
- `apps/server/src/services/requestContract.service.ts`
- `apps/server/src/modules/Integrations/salesdrive/salesdriveSync.service.ts`
- `apps/server/src/modules/Integrations/salesdrive/salesdriveWebhook.service.ts`
- `apps/server/src/modules/Integrations/meta/metaCapi.service.ts`

## Risk Hints

- `routeMessage.ts` and MiniApp routes are large, high-attention files.
- Prisma migration must be additive.
- Env defaults must fail closed.
- Logs must stay sanitized.
- Unknown SalesDrive status IDs remain disabled until explicitly configured.
