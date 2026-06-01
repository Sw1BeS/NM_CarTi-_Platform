# MiniApp Audit Remediation Reflection

Date: 2026-06-01

## Result

The audit remediation is implemented and verified in the feature worktree, with production-impacting actions still gated.

## Repair Track

- Repaired object: signed MiniApp read auth.
- Action: frontend sends `initData` in `X-Telegram-Init-Data`; server reads header first and marks signed reads `no-store`.
- Impact: signed auth material no longer appears in generated frontend read URLs.
- Verification: MiniApp API contract tests and MiniApp lead handoff route tests.

- Repaired object: read-only preview Meta CAPI sends.
- Action: Meta CAPI only enables for MiniApp events when a Meta event exists, `META_CAPI_ENABLED` is true, and Telegram identity is verified.
- Impact: preview telemetry remains internal and cannot become outbound Meta events through spoofed payload data.
- Verification: MiniApp event route tests.

- Repaired object: Meta URL and payload sanitizers.
- Action: added Telegram auth aliases including `initData`, `init_data`, `telegramInitData`, and `telegram_init_data`.
- Impact: URL and custom_data summaries preserve campaign/debug identifiers while stripping signed auth carriers.
- Verification: sanitizer tests and tracking event route tests.

- Repaired object: bot runtime delivery mode.
- Action: `BotConfig.deliveryMode` is canonical, JSON `config.deliveryMode` is legacy fallback.
- Impact: runtime bot startup no longer disagrees with Prisma column state.
- Verification: `botDeliveryMode.test.ts`.

## Retirement Track

- Retained object: server support for legacy query `?initData=`.
- Retained boundary: compatibility only for old deployed MiniApp clients; frontend no longer emits it.
- Future trigger: remove after one production deploy cycle and 7 days of logs showing no query-auth signed reads.

- Retained object: cleanup script dry-run mode.
- Retained boundary: `--dry-run` default; `--apply` requires DB backup and explicit operator approval.
- Future trigger: production cleanup window after backup and reviewed candidate list.

## Residual Risk

- Manual Telegram-client QA still needs a deployed build.
- The cleanup script has only been dry-run against current DB state.
- Meta Events Manager UI confirmation may lag API acceptance; API returned `events_received=1` for both test codes.

## Complexity Delta

- High-attention file touched: `apps/server/src/routes/miniAppRoutes.ts`.
- Net entropy: stable with justification. Small local helpers were added, while unsafe query-auth production from the frontend was removed.
- Follow-up: retire query fallback after adoption window.
