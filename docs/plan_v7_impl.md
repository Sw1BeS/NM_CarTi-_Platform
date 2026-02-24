# План реалізації v7 (оновлено після аудиту)

Дата: 2026-02-24

## P0 (критично)

1. Тексти/кнопки UA пакетом v7.
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/core/utils/telegramText.ts`.

2. Callback-контракт `v1:<token>:<id>` + legacy parser.
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/core/utils/callbackUtils.ts`, `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts`.

3. Keyboard policy private/group.
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`, `apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts`.

4. Lead BUY (9 steps + review/edit/back/cancel + strict validations).
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts`, `apps/server/src/modules/Communication/telegram/core/utils/inputValidators.ts`.

5. Card formats v7 + batch controls.
- Статус: Done.
- Файли: `apps/server/src/services/cardRenderer.ts`.

6. Favorites + multi-car lead submit.
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts`, `apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts`.

7. External HTML pipeline (robots/rate/backoff/cache) + adapter.
- Статус: Done.
- Файли: `apps/server/src/modules/Integrations/external-search/*`, `apps/server/src/services/urlParser.ts`.

8. Lead SELL + idempotent admin actions.
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts`.

9. Support tickets (OPEN/NEW + review submit).
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`, `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts`.

10. B2B registration/request/variant + privacy.
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts`, `b2bRequestWizard.ts`, `b2bVariantWizard.ts`.

11. B2B registered private menu.
- Статус: Done.
- Файли: `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`.

## P1 (важливо)

1. MiniApp parity (catalog/favorites/multi-select/send lead/back/scroll).
- Статус: Done.
- Файли: `apps/web/src/pages/public/MiniApp.tsx`, `apps/web/src/pages/public/miniapp/views/CatalogView.tsx`, `apps/web/src/pages/public/miniapp/views/FavoritesView.tsx`, `apps/web/src/pages/public/miniapp/navigation.ts`, `apps/web/src/pages/public/miniapp/telegramViewport.ts`.

2. Health-check hardening (chat-id + permissions).
- Статус: Done.
- Файл: `apps/server/scripts/check_telegram_health.ts`.

3. QA артефакти v7.
- Статус: Done.
- Файли: `docs/audit_v7_telegram_ux.md`, `docs/audit_v7_db_gap.md`, `docs/audit_v7_miniapp.md`, `docs/qa_v7_e2e.md`.

## Commit sequence (рекомендована, відображає виконані блоки)

1. `docs(audit): regenerate v7 audits with file/line evidence`
2. `feat(i18n): complete UA text keys and button maps`
3. `feat(callback): v1 callback encoding + legacy parser compatibility`
4. `feat(lead-buy): 9-step wizard, review/edit/back/cancel, strict validations`
5. `feat(cards): required card formats, batch controls, favorites actions`
6. `feat(search): unify external HTML pipeline via external-search adapter`
7. `feat(lead-sell): submit flow + idempotent admin actions`
8. `feat(support): open-ticket branching and review submit`
9. `feat(b2b-reg): new partner/agent registration, approve/reject, CDL invite code`
10. `feat(b2b-flow): request/variant publish flow, fit/not-fit routing, privacy enforcement`
11. `feat(miniapp): catalog/favorites multi-select send-lead + back/scroll behavior`
12. `chore(db): prisma normalization migration + partnerId alias mapping`
13. `chore(ops): telegram health checks and chat-id normalization docs`
14. `docs(qa): finalize e2e guide and verification outputs`

## Prisma / міграції

- Поточна схема вже містить поля v7 (`inviteCode`, `role`, `lastName`, `payload`, `SupportTicket`, `partnerCompanyId`).
- `partnerId` реалізовано як alias у TS-шарі (`inventory.routes.ts`) без rename колонки.
- `prisma migrate status`: schema up to date (26 migrations).

## Мінімальні тести/перевірки

1. Unit
- `inputValidators.test.ts` (year/budget/mileage/phone/forbidden contacts)
- `callbackUtils.test.ts` (v1, legacy parsing, size constraints)
- `quickPicks.test.ts`
- `b2bRegistration.service.test.ts`

2. Integration
- `telegram.webhook.public.test.ts`
- `routeChannelPost.test.ts`
- `telegramReplyMarkup.test.ts`

3. Build/Smoke
- `corepack pnpm -C apps/server build`
- `corepack pnpm -C apps/server test`
- `corepack pnpm -C apps/web build`
- `corepack pnpm -C apps/server prisma migrate status`
- `corepack pnpm -C apps/server tsx scripts/check_telegram_health.ts`

## QA checklist (ручний)

1. Lead `/start` private: 4 mode кнопки + inline MiniApp/privacy.
2. Lead BUY: 9 кроків, `Крок X/9`, back/cancel, optional skip, review/edit/jump.
3. Lead BUY results: 1–3 картки, кнопки interest/favorite, after-batch controls.
4. Favorites: paging by 3, single admin lead on `Звʼязатися по обраному`.
5. Lead SELL: submit + admin idempotent actions.
6. Support: OPEN/NEW branch, review submit, admin prefix `🆘 [SUPPORT]`.
7. B2B unregistered `/start`: тільки registration/info/rules/tariffs/privacy.
8. B2B request/variant: channel/requester без контактів; FIT до адміна з контактами.
9. MiniApp: multi-select -> single submit payload with `carListingIds`, BackButton/history/viewport.
