# Cartie Code Map

Generated: 2026-05-26T16:09:01.043Z
Root: `/srv/cartie`
Git: `bd69ae0`

This directory is the current machine-generated map of the Cartie workspace.
It is intentionally factual and path-oriented: use it to decide what is active, what is runtime state, and what should stay out of cleanup scope.

## Start here

- `DIRECTORY_MAP.md` - `/srv` and `/srv/cartie` resource classification.
- `SERVER_CODE_MAP.md` - Express entrypoint, mounted routers, and high-risk route files.
- `WEB_CODE_MAP.md` - Vite/React public and protected route surface.
- `DATA_MODEL_MAP.md` - Prisma model and enum inventory.
- `TELEGRAM_MINIAPP_MAP.md` - Telegram, MiniApp, and public request flow notes.
- `RUNTIME_INFRA_MAP.md` - Docker Compose, ports, nginx sites, and smoke-check commands.
- `RESOURCE_ORGANIZATION.md` - what to keep, rotate, archive, or review.
- `RISK_REGISTER.md` - current structural risks and verification gates.
- `MAP_DATA.json` - raw machine-readable inventory used by these docs.

Do not edit generated files by hand. Update `scripts/inspect/generate_code_map.mjs` and regenerate.
