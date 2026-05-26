# AI Workflow

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

Use this file as the handoff prompt skeleton for future AI-assisted work on Cartie.

## Minimum context pack

Give the agent these files first:

- `docs/project-knowledge/README.md`
- `docs/project-knowledge/AI_WORKFLOW.md`
- `docs/project-knowledge/OPERATIONS_KNOWLEDGE.md`
- `docs/code-map/MAP_DATA.json`
- The most relevant `docs/code-map/*.md` file for the subsystem being changed.

For Meta, SalesDrive, Telegram, and MiniApp work, include `docs/code-map/INTEGRATIONS_MAP.md` and `docs/code-map/TELEGRAM_MINIAPP_MAP.md`.

## Prompt template

```text
Read /srv/cartie/docs/project-knowledge/README.md, /srv/cartie/docs/project-knowledge/AI_WORKFLOW.md, and /srv/cartie/docs/code-map/MAP_DATA.json.
Treat /srv/cartie/data, /srv/cartie/storage, /srv/cartie/_logs, /srv/cartie/.deploy, /srv/cartie/env, .env files, and secret-bearing paths as protected.
Do not inspect secret values. Inventory secret-bearing paths by filename only.
Implement only: <task>.
Before edits, identify owner files, compatibility boundaries, and exact verification commands.
Prefer focused tests before code changes. After edits, run targeted tests, server typecheck if server code changed, generated docs check if docs/code-map changed, and live smoke only when deployment/runtime was touched.
Report what was verified, what was not verified, and any residual risk.
```

## Working rules

- Generated code-map files are current workspace truth; older audit reports are evidence, not authority.
- Runtime data, media, logs, deployment artifacts, and env material are not cleanup targets unless a retention policy and restore path are explicit.
- For live Cartie changes, keep the change recoverable: record git status, run tests before deploy, deploy the narrowest affected service, then smoke `/health` and the affected route.
- For Meta/SalesDrive work, separate telemetry/debug logs from real outbound sends. Internal actions such as `miniapp.tracking_bound` must not be counted as Meta CAPI sends.

## Standard verification menu

```bash
npm --prefix apps/server test -- <focused test files>
npx tsc --noEmit --pretty false
node scripts/inspect/generate_code_map.mjs && node scripts/inspect/generate_code_map.mjs --check
docker compose -p infra2 -f infra/docker-compose.cartie2.prod.yml ps
curl -fsS http://127.0.0.1:3002/health
```
