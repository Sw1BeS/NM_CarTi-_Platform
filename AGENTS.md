# CarTié Agent Guide

## Repository expectations

- This repository is currently in a dirty worktree. Before editing anything, inspect `git status --short` and preserve unrelated changes.
- Default safe-write paths for audit/planning work are:
  - `AGENTS.md`
  - `apps/server/AGENTS.override.md`
  - `apps/web/AGENTS.override.md`
  - `.codex/agents/**`
  - `.agents/skills/**`
  - `docs/architecture/**`
  - `docs/audits/**`
  - `docs/plans/**`
- Do not make incidental edits outside those paths unless the user explicitly expands scope.
- Treat `.agent/**` as legacy reference-only material. It can inform audits, but it is not the canonical guidance layer for new Codex work.

## Product truths

- CarTié is a Telegram-first CRM/ERP-like automotive workflow platform.
- `CarListing` inventory is the single source of truth for cars.
- `Showcase` is a saved view/preset over inventory, not a second inventory.
- Public pages, Mini App, bots, channels, newsletters, and partner surfaces are outputs over shared data, not separate stores.
- B2B flows must prevent uncontrolled contact leakage.
- Prefer the smallest viable architectural correction that unblocks MVP stability.

## Live runtime memory

- For Telegram Mini App debugging, the published server tree at `/srv/cartie` is the runtime source of truth.
- Treat a missing Telegram `initData` as a bootstrap/context problem, not automatically as an API outage.
- If public Mini App config/catalog endpoints are healthy, prefer read-only preview mode outside Telegram over a full-screen hard block.
- Keep Mini App write actions gated by valid Telegram `initData`.

## Canonical docs

- Start with `docs/architecture/system-truth.md`.
- For state/role/visibility work, treat `docs/architecture/role-status-ownership-matrix.md` as the canonical contract.
- Use the current canonical output set under `docs/architecture`, `docs/audits`, and `docs/plans`.
- Avoid creating new parallel audit files when an existing canonical doc can be extended.

## Repo map

- `apps/server`: Express, Prisma, Telegram Bot API runtime, MTProto connectors, workers.
- `apps/web`: React/Vite platform UI plus Telegram Mini App/public pages.
- `docs`: mixed historical docs plus the new canonical docs set.
- `verification`: ad hoc verification scripts; do not modify unless explicitly requested.
- `_archive`: stale artifacts and backups; treat as read-only evidence.

## Commands

- Server tests: `cd apps/server && npm test`
- Server build: `cd apps/server && npm run build`
- Web build: `cd apps/web && npm run build`
- Prefer `rg` / `rg --files` for discovery.

## Working rules

- Fix ownership/status/visibility logic before route cleanup or UX polishing.
- Do not introduce new bots per showcase or new inventory silos.
- Do not replace connectors with one-off scripts.
- For large or sensitive changes, cite exact files, handlers, routes, and services that back the recommendation.
- If you touch docs about flows, include what is already accounted for, gaps, overbuild to cut/postpone, conflicts/alignment, next steps, assumptions, PR-ready module plan, and QA/rollout checks.
