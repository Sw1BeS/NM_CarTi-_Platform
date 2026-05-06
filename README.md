# CarTie Production Platform

CarTie is a Telegram-first automotive sales platform with a B2B admin backend,
public showcase/MiniApp frontend, and production Docker stack under `infra2`.

## Repository Map

- `apps/server` - Express API, Telegram bot runtime, Prisma schema, background scripts.
- `apps/web` - Vite/React admin UI and public MiniApp routes.
- `infra` - production Docker compose, Caddy, deploy and verification scripts.
- `docs` - operational docs and historical release/audit materials.
- `FINAL_*_AUDIT*.md`, `TELEGRAM_MINIAPP_DEEP_AUDIT.md`,
  `IMPLEMENTATION_PLAN_AUDIT.md`, `FULL_AUDIT_REPORT.md` - historical audit
  inputs. They are useful checklists, not the current implementation source of
  truth.

## Production Services

The active production stack is `infra2`:

- `infra2-db-1` - Postgres 15, exposed locally on `127.0.0.1:5433`.
- `infra2-api-1` - API container, exposed locally on `127.0.0.1:3002`.
- `infra2-web-1` - Caddy/web container, exposed locally on `127.0.0.1:8082`.

External production URL:

- `https://cartie2.umanoff-analytics.space`

Useful local checks:

```bash
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml ps
curl -s http://127.0.0.1:3002/health
curl -s http://127.0.0.1:3002/api/miniapp/config?slug=cartie
```

## MiniApp Navigation Contract

Runtime Telegram buttons for the `CLIENT_LEAD` bot must be `WEB_APP` buttons in
a two-column layout:

- `Підібрати авто` -> `/p/app/{slug}?entry=request&type=BUY`
- `Продати авто` -> `/p/app/{slug}?entry=request&type=SELL`
- `Авто в наявності` -> `/p/app/{slug}?entry=inventory&status=AVAILABLE`
- `Авто в дорозі` -> `/p/app/{slug}?entry=inventory&status=PENDING`
- `Обране` -> `/p/app/{slug}?entry=favorites`
- `Підтримка` -> `/p/app/{slug}?entry=support`

The standard Telegram menu button should remain a `web_app` entry to the public
MiniApp and should not be changed without a specific product reason.

Inventory API supports status filtering:

```bash
curl -s "http://127.0.0.1:3002/api/miniapp/showcases/cartie/inventory?status=AVAILABLE"
curl -s "http://127.0.0.1:3002/api/miniapp/showcases/cartie/inventory?status=PENDING"
curl -s "http://127.0.0.1:3002/api/miniapp/showcases/cardealer_lviv_bot/inventory"
```

## Development Commands

Server:

```bash
npm --prefix apps/server install
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/server test
```

Web:

```bash
npm --prefix apps/web install
npm --prefix apps/web run build
```

Focused MiniApp regression suite:

```bash
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public
```

## Production Rollout

From `/srv/cartie` on `main`:

```bash
git fetch origin main --prune
git status --short --branch
npm --prefix apps/server test -- clientLeadMiniAppMenu.test.ts miniappUrl.test.ts templatePreset.service.test.ts showcase.service.miniapp.test.ts miniappPayload callbackUtils telegram.setWebhook.allowedUpdates telegram.webhook.public
npm --prefix apps/server run build -- --pretty false
npm --prefix apps/web run build
git diff --check
```

Build and restart API/web without touching the DB container:

```bash
BUILD_SHA="$(git rev-parse --short HEAD)" \
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml build api web

BUILD_SHA="$(git rev-parse --short HEAD)" \
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml up -d --no-deps api web
```

Run production verification:

```bash
curl -s http://127.0.0.1:3002/health
bash infra/prod_verify.sh
LOG_FILE=/srv/cartie/_logs/telegram_live_verify.log bash infra/verify_telegram_live.sh
```

For scripted deploys, prefer `bash infra/deploy_infra2.sh` or the current
deployment runbook in `docs/deploy_runbook.md`.

## Branch And Release Workflow

- Keep `main` deployable.
- Do not force-push `main`.
- Push hotfixes directly to `main` only when production access and branch rules
  explicitly allow it; otherwise push a `hotfix/*` branch and open a PR.
- Create local backup refs before risky production merges.
- Delete only local branches that are already merged and not attached to an
  active worktree.
- Do not delete backup branches unless their rollback value has expired.

## Docs Map

- `docs/README.md` - docs entrypoint.
- `docs/deploy_runbook.md` - deploy and rollback notes.
- `docs/CANONICAL_DOCS_INDEX.md` - older canonical index.
- Top-level audit reports - historical audit inputs preserved from `origin/main`.
