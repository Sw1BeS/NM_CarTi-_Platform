# MiniApp Audit Remediation Checkpoint

Date: 2026-06-01
Status: implementation complete, branch not merged, production not deployed

## Todo Checkpoint

| Item | Status |
| --- | --- |
| Isolated worktree and branch | completed |
| Signed MiniApp read auth moved to header | completed |
| Signed read responses marked `Cache-Control: no-store` | completed |
| Preview MiniApp events gated from Meta CAPI without verified Telegram identity | completed |
| URL and payload sanitizers hardened for Telegram auth carrier aliases | completed |
| Historical B2B request tracking URL cleanup tool added | completed |
| `BotConfig.deliveryMode` made canonical runtime owner | completed |
| Scenario/menu ownership docs updated | completed |
| Meta Dataset test-mode QA run with provided codes | completed |
| Production deploy | not started |
| Cleanup `--apply` | not started |

## Active Slice

Finalize the branch for handoff: self-review, durable work records, ADR, fresh verification, then present merge/push/keep/discard options.

## Completed Evidence Refs

- `docs/aegis/work/2026-06-01-miniapp-audit-remediation/90-evidence.md`
- `docs/aegis/adr/2026-06-01-miniapp-signed-read-and-meta-gate-owners.md`
- `docs/aegis/plans/2026-05-28-miniapp-scenario-audit-remediation-and-meta-dataset-plan.md`

## Resume State Hint

Resume from `/root/.config/aegis/worktrees/cartie/miniapp-audit-remediation` on branch `feature/miniapp-audit-remediation`. The branch is based on `c2635f30c6ccb525d1acd43026731dfb8bf2d404`. If production deployment is requested, first commit or merge the branch, then run deployment smoke checks; do not apply the cleanup script without a DB backup and explicit `--apply` gate.

## Drift Check Draft

- Original task intent: still served.
- Compatibility boundary: production deploy and cleanup apply were not performed.
- New owners/fallbacks: header-based auth is canonical; query `initData` remains a temporary legacy fallback.
- Retirement track: remove query `initData` fallback after one production deploy cycle and 7 days without query-auth reads.
- Decision: continue to branch handoff.

## Next Step

Run fresh verification after final docs/type cleanup, then ask the user whether to merge locally, push/create PR, keep the branch, or discard it.
