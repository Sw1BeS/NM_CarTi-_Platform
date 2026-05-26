# Server Code Map

Generated: 2026-05-26T15:50:52.636Z
Root: `/srv/cartie`
Git: `360d414`

## Entrypoint

`apps/server/src/index.ts` wires middleware, public webhooks, API routers, health endpoints, static media, frontend static serving, and startup workers.

## Mounted routers

| Mount | Handler |
| --- | --- |
| `/api/webhooks/whatsapp` | `whatsAppRouter` |
| `/api/webhooks/viber` | `viberRouter` |
| `/api/telegram` | `telegramRoutes` |
| `/api/public` | `publicRoutes` |
| `/api/miniapp` | `miniAppRoutes` |
| `/api/auth` | `authRoutes` |
| `/api/system` | `systemRoutes` |
| `/api/entities` | `entityRoutes` |
| `/api/inventory` | `inventoryRoutes` |
| `/api/requests` | `requestsRoutes` |
| `/api/companies` | `companyRoutes` |
| `/api/templates` | `templateRoutes` |
| `/api/integrations` | `integrationRoutes` |
| `/api/orchestration` | `orchestrationRoutes` |
| `/api/superadmin` | `superadminRoutes` |
| `/api/qa` | `qaRoutes` |
| `/api/b2b` | `b2bV2Routes` |
| `/api/v2` | `apiV2Router` |
| `/api` | `apiRoutes` |
| `/media/telegram` | `express` |
| `/media` | `express` |

## Direct app routes

| Method | Path |
| --- | --- |
| GET | `/health` |
| GET | `/api/health` |
| GET | `/api/health/platform-readiness` |
| GET | `*` |

## Route-heavy files

| File | Bytes | Routes | First routes |
| --- | --- | --- | --- |
| `apps/server/src/routes/miniAppRoutes.ts` | 79163 | 24 | `GET /config`<br>`GET /vehicle-taxonomy`<br>`GET /showcases`<br>`GET /showcases/:slug/inventory`<br>`GET /cars/:carId`<br>`POST /cars/:carId/share` |
| `apps/server/src/routes/publicRoutes.ts` | 16306 | 12 | `GET /:slug/inventory`<br>`POST /:slug/requests`<br>`GET /:slug/request-status`<br>`POST /leads`<br>`POST /requests`<br>`POST /requests/:id/variants` |
| `apps/server/src/routes/legacyMessaging.routes.ts` | 23751 | 11 | `GET /messages`<br>`GET /messages/logs`<br>`POST /messages/logs`<br>`POST /messages`<br>`GET /inbox/macros`<br>`POST /inbox/macros` |
| `apps/server/src/routes/legacyContent.routes.ts` | 18800 | 10 | `GET /content/templates`<br>`POST /content/templates`<br>`PUT /content/templates/:id`<br>`DELETE /content/templates/:id`<br>`POST /content/templates/preview`<br>`GET /content/publication-jobs` |
| `apps/server/src/routes/entityRoutes.ts` | 10990 | 10 | `GET /meta`<br>`POST /definitions`<br>`PUT /definitions/:slug`<br>`POST /definitions/:slug/archive`<br>`GET /:slug/records`<br>`POST /:slug/records` |
| `apps/server/src/routes/legacyAdmin.routes.ts` | 4739 | 8 | `GET /settings`<br>`POST /settings`<br>`GET /users`<br>`POST /users`<br>`PUT /users/:id`<br>`DELETE /users/:id` |
| `apps/server/src/routes/legacyBots.routes.ts` | 19618 | 7 | `GET /bots`<br>`POST /bots`<br>`PUT /bots/:id`<br>`POST /bots/:id/webhook`<br>`POST /bots/:id/menu-button/sync`<br>`DELETE /bots/:id/webhook` |
| `apps/server/src/routes/b2bV2.routes.ts` | 9205 | 7 | `POST /access/request`<br>`GET /requests/my`<br>`GET /variants/received`<br>`POST /variants/:variantId/decision`<br>`GET /admin/fit-queue`<br>`PATCH /admin/fit-queue/:variantId` |
| `apps/server/src/routes/qaRoutes.ts` | 6801 | 7 | `GET /parse`<br>`POST /parse/profile`<br>`GET /simulate/start`<br>`POST /simulate/message`<br>`GET /telegram/token`<br>`GET /telegram/webhook` |
| `apps/server/src/routes/legacyLeads.routes.ts` | 10377 | 6 | `GET /leads`<br>`POST /leads`<br>`PUT /leads/:id`<br>`POST /leads/merge`<br>`GET /leads/:id/timeline`<br>`DELETE /leads/:id` |
| `apps/server/src/routes/legacyAnalytics.routes.ts` | 16825 | 5 | `GET /events`<br>`GET /metrics/dashboard`<br>`GET /metrics/telegram`<br>`POST /search/parse`<br>`GET /search/jobs` |
| `apps/server/src/routes/legacyDrafts.routes.ts` | 8117 | 5 | `POST /drafts/import`<br>`GET /drafts`<br>`POST /drafts`<br>`PUT /drafts/:id`<br>`DELETE /drafts/:id` |
| `apps/server/src/routes/legacyCampaigns.routes.ts` | 13295 | 4 | `GET /campaigns`<br>`POST /campaigns`<br>`GET /destinations`<br>`GET /proxy` |
| `apps/server/src/routes/legacyScenarios.routes.ts` | 8237 | 4 | `GET /scenarios/templates`<br>`GET /scenarios`<br>`POST /scenarios`<br>`DELETE /scenarios/:id` |
| `apps/server/src/modules/Communication/telegram/destinations/destination.routes.ts` | 1878 | 4 | `GET /`<br>`PATCH /:id/pause`<br>`PATCH /:id/resume`<br>`POST /:id/sync` |
| `apps/server/src/routes/legacyTelegramProxy.routes.ts` | 12561 | 3 | `POST /telegram/call`<br>`GET /telegram/file`<br>`POST /telegram/file/cache` |
| `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts` | 2370 | 1 | `POST /webhook/:botId` |
| `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts` | 87652 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts` | 80104 | 0 |  |
| `apps/server/src/routes/miniAppLeadHandoff.routes.test.ts` | 66715 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts` | 44713 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/routeCallback.leadAdminActions.test.ts` | 44418 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts` | 42334 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/wizards/b2bSellWizard.ts` | 38762 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/wizards/b2bVariantWizard.ts` | 29462 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts` | 28158 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRequestWizard.ts` | 25451 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts` | 21784 | 0 |  |
| `apps/server/src/modules/Communication/telegram/core/leadService.ts` | 20086 | 0 |  |
| `apps/server/src/modules/Communication/telegram/routing/testing/adminTestScenarios.ts` | 19775 | 0 |  |

## Startup responsibilities

- Prisma connection
- event handlers
- admin seed
- platform bootstrap
- Telegram bot manager
- content worker
- scheduler
- MTProto worker
- MTProto lifecycle restore
