# Meta Tracking CAPI Evidence

## Baseline Setup

- Worktree: `/root/.config/aegis/worktrees/cartie/meta-tracking-capi`
- Branch: `feature/meta-tracking-capi`
- Dependency setup: `npm --prefix apps/server ci`
- Docs baseline check: `node scripts/inspect/generate_code_map.mjs --check`

## Bridge Evidence

- Prisma client generation: `npm --prefix apps/server run prisma:generate`
- Focused tests: `npm --prefix apps/server test -- src/config/env.test.ts src/modules/Attribution/attributionSession.service.test.ts src/modules/Attribution/trackingRedirect.routes.test.ts`
- Build: `npm --prefix apps/server run build`

## Telegram And Lead/Request Join Evidence

- Focused tests: `npm --prefix apps/server test -- src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts src/modules/Communication/telegram/core/leadService.test.ts src/services/miniapp.service.test.ts src/services/requestContract.service.test.ts src/routes/miniappTrackingEvents.web.test.ts`
- Build: `npm --prefix apps/server run build`
- Baseline failure check in untouched `/srv/cartie`: `src/routes/miniAppLeadHandoff.routes.test.ts -t "lists active B2B network requests without exposing requester contacts"` fails before this feature branch due stale requesterPartnerId expectation.

## SalesDrive And Meta Sender Evidence

- Focused tests: `npm --prefix apps/server test -- src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts src/modules/Integrations/meta/metaCapi.service.test.ts`
- Build: `npm --prefix apps/server run build`

## Final Evidence

- Meta debug route test: `npm --prefix apps/server test -- src/modules/Integrations/integration.routes.metaDebug.test.ts`
- Focused verification gate: `npm --prefix apps/server test -- src/config/env.test.ts src/modules/Attribution/attributionSession.service.test.ts src/modules/Attribution/trackingRedirect.routes.test.ts src/modules/Communication/telegram/routing/routeMessage.attribution.test.ts src/modules/Communication/telegram/routing/routeMessage.clientLeadMenu.test.ts src/modules/Communication/telegram/core/leadService.test.ts src/services/miniapp.service.test.ts src/services/requestContract.service.test.ts src/routes/miniappTrackingEvents.web.test.ts src/modules/Integrations/salesdrive/salesdriveSync.service.test.ts src/modules/Integrations/salesdrive/salesdriveWebhook.service.test.ts src/modules/Integrations/meta/metaCapi.service.test.ts src/modules/Integrations/integration.routes.metaDebug.test.ts src/modules/Integrations/integration.routes.salesdriveWebhook.test.ts`
- Build: `npm --prefix apps/server run build`
- Code-map: `node scripts/inspect/generate_code_map.mjs --check`
