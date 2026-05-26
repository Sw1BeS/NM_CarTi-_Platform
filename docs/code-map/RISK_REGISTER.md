# Risk Register

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

| ID | Risk | Severity | Notes |
| --- | --- | --- | --- |
| R1 | Runtime state is inside repo path | high | `data`, `storage`, `_logs`, and `.deploy` must stay excluded from cleanup/refactor operations unless explicitly targeted with backups. |
| R2 | Large frontend/public MiniApp component | high | `apps/web/src/pages/public/MiniApp.tsx` is large enough that UI changes need focused regression tests and visual smoke checks. |
| R3 | Telegram router concentration | high | `routeMessage.ts`, `routeCallback.ts`, and MiniApp route files centralize a lot of behavior; split only with tests around command/callback flows. |
| R4 | Web TypeScript check has existing failures | medium | Do not treat `apps/web` `tsc --noEmit` failures as new damage without comparing to the post-cleanup assessment. |
| R5 | MiniApp menu config drift | medium | Manual assessment found live and DB MiniApp hashes differed while both URLs were reachable. Needs a deliberate config reconciliation task. |
| R6 | Large backup/artifact footprint under `/srv` | medium | `/srv/backups` and cleanup artifacts are useful evidence but need a retention policy before future pruning. |
| R7 | Secret-bearing local config | high | `.deploy/20260224_115917/env_keys.txt`, `.deploy/20260224_170459/env_keys.txt`, `.deploy/20260518_042327/env_keys.txt`, `.deploy/20260518_043122/env_keys.txt`, `.deploy/20260518_043503/env_keys.txt`, `.deploy/20260518_144042/env_keys.txt`, `.deploy/20260518_192744/env_keys.txt`, `.deploy/20260518_193817/env_keys.txt`, `.deploy/20260518_195113/env_keys.txt`, `.deploy/20260518_195834/env_keys.txt`, `.deploy/20260519_174538/env_keys.txt`, `.deploy/20260525_162320/env_keys.txt`, `.deploy/20260525_163729/env_keys.txt`, `.deploy/20260525_183604/env_keys.txt`, `.env`, `apps/server/.env`, `apps/web/.env.production`, `docs/audit/release-20260218T152454Z/artifacts/logs_secret_keyword_hits.txt`, `docs/audit/release-20260218T152454Z/artifacts/runtime_logs_secret_like_hits.txt`, `env/prod.env`, `infra/.env` Never print or copy values into generated docs. |

## Largest active source files

| File | Bytes |
| --- | --- |
| `apps/web/src/pages/public/MiniApp.tsx` | 212812 |
| `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts` | 87652 |
| `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts` | 80104 |
| `apps/server/src/routes/miniAppRoutes.ts` | 79163 |
| `apps/web/src/pages/app/Inbox.tsx` | 70707 |
| `apps/server/src/routes/miniAppLeadHandoff.routes.test.ts` | 66715 |
| `apps/web/src/pages/app/Inventory.tsx` | 62886 |
| `apps/web/src/services/botEngine.ts` | 60606 |
| `apps/web/src/pages/app/ContentCalendar.tsx` | 54435 |
| `apps/web/src/pages/app/Requests.tsx` | 52696 |
| `apps/server/src/services/requestContract.service.ts` | 52480 |
| `scripts/inspect/generate_code_map.mjs` | 46175 |
