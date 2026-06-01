# Telegram and MiniApp Map

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

## Current flow

1. Telegram updates enter through `/api/telegram` and module routing under `apps/server/src/modules/Communication/telegram`.
2. Bot/menu logic points users into public MiniApp URLs under `/p/app` and `/p/app/:slug`.
3. MiniApp/API flows continue through `/api/miniapp`, `/api/public`, inventory, request, partner, and template routes.
4. Public frontend screens live in `apps/web/src/pages/public`, with `MiniApp.tsx` as the largest current UI surface.

## High-attention files

| File | Bytes |
| --- | --- |
| `apps/web/src/pages/public/MiniApp.tsx` | 212812 |
| `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts` | 87652 |
| `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts` | 80104 |
| `apps/server/src/routes/miniAppRoutes.ts` | 79163 |
| `apps/server/src/routes/miniAppLeadHandoff.routes.test.ts` | 66715 |
| `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts` | 44713 |
| `apps/server/src/modules/Communication/telegram/routing/routeCallback.leadAdminActions.test.ts` | 44418 |
| `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts` | 42334 |
| `apps/server/src/modules/Communication/telegram/routing/wizards/b2bSellWizard.ts` | 38762 |
| `apps/web/src/modules/Telegram/MiniAppManager/index.tsx` | 37727 |

## Operational note

The latest manual post-cleanup check found MiniApp availability intact but noted Telegram menu hash drift between live config and DB-expected config. Treat this as configuration drift, not confirmed downtime.

## Scenario Ownership Note

Template presets seed admin-visible scenarios and commands for `CLIENT_LEAD`
and `B2B`, but the critical buyer, seller, support, B2B request, and MiniApp
handoff flows are mostly owned by specialized Telegram/MiniApp handlers. Treat
scenario graph edits as admin/template behavior unless a route explicitly
delegates to the scenario engine.

Persistent reply-keyboard `web_app` buttons for `CLIENT_LEAD` should point to
canonical `/p/app/{slug}` URLs. Do not reintroduce section query params into
reply-keyboard URLs without rechecking Telegram signed launch behavior.
