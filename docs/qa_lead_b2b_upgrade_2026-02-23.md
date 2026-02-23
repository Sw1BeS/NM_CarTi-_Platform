# QA Checklist — Lead + B2B Bots & MiniApp Upgrade (2026-02-23)

## 1) Автоматичні перевірки

### Сервер (TypeScript build)
- [x] `npm --prefix apps/server run build -- --pretty false`

### Серверні тести (цільові)
- [x] `npm --prefix apps/server run test -- src/__tests__/telegram.setWebhook.allowedUpdates.test.ts`
- [x] `npm --prefix apps/server run test -- src/modules/Communication/telegram/core/utils/miniappPayload.test.ts`
- [x] `npm --prefix apps/server run test -- src/services/cardRenderer.test.ts src/services/templatePreset.service.test.ts`
- [x] `npm --prefix apps/server run test -- src/modules/Communication/bots/scenario-engine/actions/client-buy.actions.test.ts`
- [x] `npm --prefix apps/server run test -- src/modules/Communication/bots/scenario-engine/actions/form.actions.test.ts`
- [x] `npm --prefix apps/server run test -- src/modules/Communication/bots/scenario-engine/actions/b2b-registration.actions.test.ts`
- [x] `npm --prefix apps/server run test -- src/services/b2bRegistration.service.test.ts src/services/b2bRegistration.approve.test.ts`
- [x] `npm --prefix apps/server run test -- src/modules/Integrations/external-search/policy/domainRateLimiter.test.ts src/modules/Integrations/external-search/policy/backoff.test.ts src/modules/Integrations/external-search/policy/robotsPolicy.test.ts`

### Web build
- [x] `npm --prefix apps/web run build`

## 2) Покриття обовʼязкових тест-кейсів

### Unit (mandatory)
- [x] `favorites batching`: батчі 1–3, add/remove favorites, агрегація “Звʼязатися по обраних авто”.
  - Файл: `apps/server/src/modules/Communication/bots/scenario-engine/actions/client-buy.actions.test.ts`
- [x] `partnerCode gating`: invalid code reject, valid code auto-activate AGENT, unregistered user blocked gate.
  - Файли: `apps/server/src/services/b2bRegistration.service.test.ts`, `apps/server/src/modules/Communication/bots/scenario-engine/actions/b2b-registration.actions.test.ts`
- [x] `lead summary/edit`: summary містить поля, edit labels `Змінити <поле>`, optional `Пропустити`.
  - Файл: `apps/server/src/modules/Communication/bots/scenario-engine/actions/form.actions.test.ts`
- [x] `rate limiter`: max 1 rps/domain, 403/429 backoff, robots disallow policy.
  - Файли: `apps/server/src/modules/Integrations/external-search/policy/domainRateLimiter.test.ts`, `apps/server/src/modules/Integrations/external-search/policy/backoff.test.ts`, `apps/server/src/modules/Integrations/external-search/policy/robotsPolicy.test.ts`

### Integration
- [x] Webhook `allowed_updates` містить `chat_join_request`.
  - Файл: `apps/server/src/__tests__/telegram.setWebhook.allowedUpdates.test.ts`
- [x] MiniApp payload parser приймає multi-request (`carIds`).
  - Файл: `apps/server/src/modules/Communication/telegram/core/utils/miniappPayload.test.ts`
- [x] B2B approve path: OWNER creation + partnerCode/showcaseSlug + invite-link flow.
  - Файли: `apps/server/src/services/b2bRegistration.approve.test.ts`, `apps/server/src/modules/Communication/bots/scenario-engine/actions/b2b-registration.actions.test.ts`

## 3) Manual QA (smoke)

### Lead Buy
- [ ] DM: кнопка `Купити авто` запускає форму з optional `Пропустити`.
- [ ] Перед submit завжди summary + `Підтвердити / Змінити / Скасувати`.
- [ ] `Змінити` показує `Змінити <поле>` для всіх полів.
- [ ] Видача карток батчами 1–3, кнопки `Показати ще / Список обраних / Звʼязатися по обраних авто / Шукати ще`.
- [ ] `✅ Цікавить це авто` шле lead адміну з partner/source details (тільки адмін).

### Lead Sell
- [ ] DM: форма продажу, фото min=1, summary/edit/cancel.
- [ ] Адмін-картка `[LEAD SELL]` має 4 idempotent дії.
- [ ] Повторний клік по дії не створює дубль (idempotency key).

### Support
- [ ] OPEN тікет: гілка `Доповнити попередній / Створити новий`.
- [ ] Адмін отримує `[SUPPORT]` з контекстом, контактами юзера.

### B2B Registration
- [ ] `Я новий партнер`: заявка `[B2B REG REQUEST]`, approve/reject/contact.
- [ ] Approve: OWNER, partnerCode, invite link/join request.
- [ ] `Я представник партнера`: partnerCode → auto AGENT + admin notify `[B2B AGENT]`.

### B2B Request/Variant/Fit privacy
- [ ] У channel/requester cards немає контактів.
- [ ] Контакти обох сторін лише в admin повідомленнях `[B2B FIT]`.
- [ ] Маркування `Компанія` + `Представник` присутнє.

### B2B Inventory
- [ ] Меню confirmed user: `Мій інвентар / Додати авто / Змінити ціну / Позначити продано / Інформація / Правила`.
- [ ] Тільки OWNER може редагувати/позначати продано.
- [ ] Неможливо змінювати авто іншого `PartnerCompany`.

### MiniApp
- [ ] Toggle favorite працює.
- [ ] Мультивибір авто працює в inventory/favorites/listing.
- [ ] Один запит на декілька авто (`carListingIds`) успішно створюється.
- [ ] BackButton і scroll-container коректні у всіх секціях.
- [ ] Вигляд стабільний на мобільному та десктопному Telegram.

### Admin Help + Info
- [ ] `/help_admin` доступний в адмін-чаті і містить правила обробки.
- [ ] `Інформація` в обох ботах відповідає актуальним правилам (контакти не публікувати).

## 4) Rollout команди
- [ ] `npm --prefix apps/server run prisma:generate`
- [ ] `npm --prefix apps/server run prisma:migrate`
- [ ] `npm --prefix apps/server run backfill:partner-codes-showcases -- --apply`
- [ ] `npm --prefix apps/server run preset:sync`
- [ ] `npm --prefix apps/server run test`
- [ ] `npm --prefix apps/web run build`
