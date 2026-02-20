# MEGA Prompt Compliance Matrix (Baseline → Target)

Date: 2026-02-20
Scope: baseline commit `56969451e75a7cc1e37a5907c873a56a23ef02a3`

## Severity
- P0: критично для бизнес-потока и/или безопасности
- P1: функциональный gap, не блокирует запуск всей системы
- P2: улучшение качества/полноты

## Critical Mismatches Before Feature Rollout
1. Единый `CarCardRenderer` по публичному шаблону отсутствует; caption-логика размазана по backend/frontend. (P0)
2. B2B whitelist onboarding не enforced через canonical `PartnerCompany/PartnerUser`; нет controlled access request lifecycle. (P0)
3. FIT queue lifecycle для админа отсутствует как отдельная управляемая очередь со статусами. (P0)
4. Mini App B2B cabinet в целевом объеме (my requests / received variants / admin queue) отсутствует. (P0)
5. Quota/rate-limit слой (daily + step rate) отсутствует как отдельный сервис + таблица usage. (P0)

## Traceability Matrix
| Requirement ID | Requirement | Current state | Gap | Planned module/file changes | Acceptance test |
|---|---|---|---|---|---|
| R-01 | Inventory = SoT | `CarListing` используется как основной источник | Partial | Убрать frontend caption rendering из send flows | Bot A sends car only from `CarListing` |
| R-02 | Showcase = view/preset, не отдельная база | `ShowcaseService` уже фильтрует inventory | OK | Verify only | Showcase inventory uses rules only |
| R-03 | Surfaces render from Inventory/Showcase без дублей | Есть дубли форматов сообщений | P1 | `carCardRenderer.v2.ts`, server-side share endpoints | DM/channel/inbox share identical |
| R-04 | Telegram connector layer + idempotency | Connector есть, idempotency нет системно | P1 | `idempotency.service.ts`, `IntegrationEventLog.idempotencyKey` | Duplicate callback does not duplicate side effects |
| R-05 | initData verify server-side; не доверять `initDataUnsafe` | verify есть, но TTL hardcoded 900s | P0 | env `TELEGRAM_INITDATA_MAX_AGE_SECONDS`, route checks | Expired initData rejected |
| R-06 | Bot A menu `/start`: 3 кнопки | Есть template-driven menu, не целевой набор | P1 | Bot A flow v2 path + feature flag | `/start` shows required buttons |
| R-07 | Bot A lead flow fields + explicit confirm | Частично есть, поле intent отсутствует | P1 | `routeMessage.ts` flow v2 + admin summary formatter | Full form delivered as one admin message |
| R-08 | Bot A contact via contact button | Реализовано | OK | Keep | Contact required before submit |
| R-09 | Bot A anti-spam (daily + step) | Не реализовано | P0 | `QuotaUsage` + `quota.service.ts` | Limit exceeded returns graceful message |
| R-10 | Bot A cancel/timeout/invalid handling | Cancel/invalid есть частично, timeout нет | P1 | Flow timeout guard in bot session handlers | Timeout resets safely |
| R-11 | Bot A car cards unified in DM/channel/inbox | Сейчас разные рендеры | P0 | Integrate CarCard v2 in send/publish/share paths | Same text across all surfaces |
| R-12 | Public Car Card template strict format | Нет строгого шаблона | P0 | `carCardRenderer.v2.ts` + `cardSettings.resolver.ts` | Snapshot test matches template |
| R-13 | Status tags managed values | Частично hardcoded | P1 | `cardSettings` schema + resolver | Tag changes via config reflect in card |
| R-14 | Map/social/contacts from config, not hardcoded | Частично hardcoded | P1 | resolver from bot/showcase settings | Card contacts/map/social from settings |
| R-15 | Bot B whitelist onboarding | Частично role-based, не canonical whitelist | P0 | `b2bWhitelist.service.ts`, access gate in handlers | Non-whitelist user blocked + access request CTA |
| R-16 | Non-whitelist “Запросити доступ” | Нет | P0 | `B2bAccessRequest` + admin notify | Access request created and admin notified |
| R-17 | B2B request form required fields | Частично есть | P1 | tighten validation | Form enforces all required fields |
| R-18 | Contact stored but not published | Частично есть | P1 | channel render sanitize | Channel post has no contacts |
| R-19 | Public ID `CD-YYYY-000123` | Сейчас random `generatePublicId` | P0 | `PublicSequence` + `publicId.service.ts` | Sequential IDs generated without race |
| R-20 | Channel post template + CTA buttons | Частично есть (`Є авто`) | P1 | standardized formatter | Post contains ID + fields + CTA |
| R-21 | “Є авто” deep-link to bot flow | Есть частично | P1 | normalize deep-link parser | Clicking CTA opens variant flow with requestId |
| R-22 | Variant form with media constraints | Частично есть, size checks нет | P1 | media validator + env `BOT_MEDIA_MAX_PHOTO_BYTES` | Oversized/non-photo rejected clearly |
| R-23 | Free-text contact filter | Есть helper `hasContactInfo` в одном flow | P1 | enforce across all variant text steps | Text with phone rejected, asks contact field |
| R-24 | Variant routing requester/admin versions | Есть partial | P1 | ensure dual render templates and logging | Requester gets no contact, admin gets full |
| R-25 | Variant decision buttons FIT/NOT_FIT | Есть | OK | Extend lifecycle fields | Decision updates lifecycle fields |
| R-26 | FIT routes to admin queue | Сейчас прямое уведомление, queue нет | P0 | lifecycle fields + fit-queue endpoints | FIT item visible in admin queue |
| R-27 | NOT_FIT update + optional seller notify | Частично | P1 | notification hook | Seller gets concise no-contact notice |
| R-28 | Admin meeting statuses | Нет structured | P1 | `fitQueueStatus` field + PATCH endpoint | Admin updates IN_PROGRESS→CLOSED |
| R-29 | Mini App section A catalog/showcases/car detail/share | Частично есть config + requests | P1 | `/miniapp/showcases*`, `/miniapp/cars*` endpoints | Catalog/detail/share works from Mini App |
| R-30 | Mini App section B partner cabinet | Нет полноценно | P0 | B2B miniapp routes + service methods | My requests + received variants visible |
| R-31 | Mini App section C admin queue + whitelist mgmt | Нет | P0 | admin miniapp routes | Admin queue + whitelist controls work |
| R-32 | Mini App write API only after verify | Частично есть | P1 | central middleware check + TTL env | All writes return 401 without valid initData |
| R-33 | Data model `QuotaUsage` | Нет | P0 | Prisma migration + service | rows increment per scope/day |
| R-34 | Data model `B2bAccessRequest` | Нет | P0 | Prisma migration + endpoints | access request persisted |
| R-35 | Data model `PublicSequence` | Нет | P0 | Prisma migration + transaction generator | no duplicate public IDs under concurrency |
| R-36 | `RequestVariant` lifecycle additive fields | Нет | P0 | Prisma migration + callback updates | lifecycle timestamps set on decisions |
| R-37 | `B2bRequest` requester partner + post url | Нет | P1 | Prisma migration + publication update | request row stores channelPostUrl |
| R-38 | `IntegrationEventLog.idempotencyKey` | Нет | P1 | Prisma migration + helper | duplicate critical events deduped |
| R-39 | Status compatibility mapping additive | Частично via dto maps | P1 | central mapping helper | FIT/NOT_FIT maps non-breaking |
| R-40 | New API v2 inventory telegram send/publish | Нет | P1 | new routes under `/api/v2/inventory/...` | endpoints send/publish card via renderer v2 |
| R-41 | New API v2 b2b endpoints | Нет | P0 | `/api/v2/b2b/*` router | requests/variants/decision/fit queue endpoints pass |
| R-42 | New Mini App routes | Нет | P1 | extend `miniAppRoutes.ts` | listed routes return expected payload |
| R-43 | Notifications matrix (author/seller/admin) | Частично | P1 | notify service hooks + event logs | all required events delivered |
| R-44 | Correlation IDs in critical handlers | Частично x-request-id | P2 | propagate request id through services | logs share same correlation id |
| R-45 | QA 8 scenarios + edge cases | Нет formal evidence | P0 | `verification/*` updates + checklist doc | 8/8 + edge scenarios documented pass/fail |
| R-46 | Admin/partner docs | Нет целевых | P1 | docs runbook + partner regulation | docs complete and reproducible |

## Phase-to-Module Mapping
- Phase 2: `apps/server/prisma/schema.prisma`, new migration folder, `apps/server/src/services/{quota.service,publicId.service,b2bWhitelist.service,idempotency.service}.ts`
- Phase 3: `apps/server/src/services/carCardRenderer.v2.ts`, `apps/server/src/services/cardSettings.resolver.ts`, integration in bot actions/publication + inbox share server path
- Phase 4-5: `apps/server/src/modules/Communication/telegram/routing/{routeMessage,routeCallback}.ts`, scenario-engine callback/action handlers, new b2b router
- Phase 6: `apps/server/src/routes/miniAppRoutes.ts`, `apps/server/src/services/miniapp.service.ts`, `apps/web/src/services/miniappApi.ts`, split MiniApp surfaces
- Phase 7: notification hooks + `IntegrationEventLog` instrumentation + tests/docs

## Baseline Conclusion
Current baseline is deployable and partially functional, but not compliant with the strict MEGA prompt. Mandatory P0 gaps require Phase 2–6 implementation before declaring MVP DoD complete.
