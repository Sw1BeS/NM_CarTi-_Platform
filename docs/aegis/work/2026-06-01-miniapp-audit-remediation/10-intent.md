# MiniApp Audit Remediation Intent

Date: 2026-06-01
Plan: `docs/aegis/plans/2026-05-28-miniapp-scenario-audit-remediation-and-meta-dataset-plan.md`
Audit: `docs/audit/cartie_bot_miniapp_scenario_audit_2026-05-27.md`
Branch: `feature/miniapp-audit-remediation`
Worktree: `/root/.config/aegis/worktrees/cartie/miniapp-audit-remediation`

## Requested Outcome

Implement the remaining Bot/MiniApp scenario audit remediations and validate the Meta Dataset setup with explicit user-provided test event codes.

## Scope

- Move signed MiniApp read auth away from query-string `initData`.
- Prevent read-only preview telemetry from sending outbound Meta CAPI without verified Telegram identity.
- Harden Meta URL and event payload sanitizers against Telegram auth carrier aliases.
- Add dry-run-first cleanup tooling for historical `B2bRequest.payload` event source URLs.
- Make `BotConfig.deliveryMode` the runtime owner, keeping JSON config only as fallback.
- Document MiniApp/menu scenario ownership and dataset QA evidence.

## Non-Goals

- No production deploy in this slice.
- No cleanup `--apply` in this slice.
- No changes to unrelated Cartie2 infrastructure or non-Cartie services.
- No raw Meta token, Telegram `initData`, phone, email, or user payload in docs/log reports.

## Baseline Read Set

- `docs/audit/cartie_bot_miniapp_scenario_audit_2026-05-27.md`
- `docs/aegis/plans/2026-05-28-miniapp-scenario-audit-remediation-and-meta-dataset-plan.md`
- `docs/aegis/baseline/2026-05-27-initial-baseline.md`
- `docs/aegis/BASELINE-GOVERNANCE.md`
- `docs/code-map/TELEGRAM_MINIAPP_MAP.md`
- `README.md`
- `apps/web/src/services/miniappApi.ts`
- `apps/server/src/routes/miniAppRoutes.ts`
- `apps/server/src/modules/Integrations/meta/metaEventSourceUrl.ts`
- `apps/web/src/pages/public/miniapp/trackingEvents.ts`
- `apps/server/src/modules/Communication/bots/bot.service.ts`
- `apps/server/src/modules/Communication/bots/botDto.ts`

## Impact Statement

The patch changes signed MiniApp read transport, outbound Meta gating, sanitizer behavior, bot runtime delivery-mode ownership, and adds a bounded data cleanup tool. The intended blast radius is MiniApp signed reads, MiniApp tracking events, Meta CAPI payload hygiene, bot runtime startup mode, and historical B2B tracking URL cleanup only.

## Risk Hints

- `apps/server/src/routes/miniAppRoutes.ts` is large and high-attention; keep edits local and helper-based.
- Query-string `initData` fallback remains temporarily for one deploy cycle and needs retirement.
- Cleanup script can touch stored JSON payloads only when run with `--apply`; it must stay dry-run-first.
- Meta Dataset QA sends external test events and must remain test-code scoped unless a later deploy/runbook says otherwise.
