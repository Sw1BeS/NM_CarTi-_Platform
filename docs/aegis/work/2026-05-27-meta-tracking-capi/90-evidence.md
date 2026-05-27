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
