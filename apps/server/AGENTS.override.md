# Server Rules

## Scope

- This subtree owns Telegram bot runtime, public/Mini App/B2B HTTP contracts, Prisma domain models, MTProto connectors, and background workers.
- Before proposing route/service cleanup, consult `docs/architecture/role-status-ownership-matrix.md`.

## Do not

- Do not add new one-off Telegram scripts instead of extending connector/runtime modules.
- Do not add new inventory ownership paths outside `CarListing`.
- Do not introduce new hidden defaults for routing, chat IDs, relay bot IDs, or contact visibility.
- Do not create another `PrismaClient` in long-running services unless there is a documented reason.

## Prefer

- Existing modules under `routes/`, `services/`, `modules/Communication/telegram/`, `modules/Integrations/mtproto/`, and `modules/Marketing/showcase/`.
- Clear flow ownership: pipeline dispatch in routers, stateful flow logic in wizards/services, canonical DTO mapping in shared services.
- Evidence-backed findings with exact route, handler, and service references.
- Keep Mini App reads public where the product already supports preview/browse, and keep Telegram-only writes guarded by verified `initData`.

## Validation

- Run `cd apps/server && npm test` when server-side changes are made.
- Run `cd apps/server && npm run build` when type-affecting files change.
- Note any noisy warnings that do not fail tests.
