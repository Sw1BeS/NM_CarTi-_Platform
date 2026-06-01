# ADR: MiniApp Signed Read And Meta Gate Owners

Date: 2026-06-01
Status: accepted for implementation branch

## Decision

Use `X-Telegram-Init-Data` as the canonical auth carrier for signed MiniApp read requests, keep server query `initData` support only as a temporary compatibility fallback, and allow outbound MiniApp Meta CAPI only when Telegram identity is verified.

Canonical ownership:

```text
MiniApp web read -> X-Telegram-Init-Data -> miniAppRoutes verifyMiniAppInitDataForScope
MiniApp preview event without initData -> platform telemetry only
MiniApp verified user event -> optional Meta CAPI when event map and env flags allow
```

Also make `BotConfig.deliveryMode` the canonical bot runtime delivery-mode owner. Legacy JSON `config.deliveryMode` remains fallback only when the typed column is absent.

## Context

Signed Telegram MiniApp `initData` is bearer auth material. Putting it in URLs risks exposure through browser history, proxy logs, referrers, screenshots, and tracking payloads. The audit also found read-only preview events could be shaped into Meta sends without a verified Telegram user, and runtime bot startup could read delivery mode from legacy JSON instead of the Prisma column.

## Consequences

- Frontend signed read path builders no longer append `initData`.
- Signed read calls send `X-Telegram-Init-Data`.
- Signed read responses use `Cache-Control: no-store`.
- Server still accepts query `initData` for old deployed clients, but header is canonical.
- Meta URL and payload sanitizers strip Telegram auth carrier aliases.
- Preview MiniApp telemetry remains internal unless Telegram identity is verified.
- `BotConfig.deliveryMode` controls runtime startup; JSON config is retained only for compatibility.

## Alternatives Considered

- Convert signed reads to POST: rejected for this slice because the routes are semantic reads and `apiFetch` already supports headers.
- Hard-remove query `initData` immediately: rejected to avoid breaking old deployed MiniApp clients during rollout.
- Keep JSON `config.deliveryMode` as runtime owner: rejected because Prisma already has a typed `deliveryMode` column and split ownership caused drift.

## Retirement

- Remove query `initData` fallback after one production deploy cycle and 7 days without query-auth signed reads in runtime logs.
- Keep cleanup script dry-run by default permanently.

## Baseline Sync

- `README.md` and `docs/code-map/TELEGRAM_MINIAPP_MAP.md` were updated with the MiniApp/menu ownership boundary.
- The initial baseline snapshot remains a dated evidence snapshot and is not auto-updated under `BASELINE-GOVERNANCE.md`.

## Rollback

- Revert frontend header transport and backend helper usage only if a deployed client cannot send custom headers from Telegram MiniApp webview.
- If rollback is required, keep `Cache-Control: no-store` and sanitizer hardening.
- Set `META_CAPI_ENABLED=false` or `META_B2C_BOT_CAPI_ENABLED=false` to stop outbound Meta sends during incident response.
