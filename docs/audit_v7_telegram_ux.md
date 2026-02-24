# Аудит Telegram UX v7 (Cartié)

Дата: 2026-02-24  
Скоуп: Lead Bot, B2B Bot, callback-контракт, wizard UX, приватність, chat-id нормалізація.

## Матриця відповідності v7

| Вимога v7 | Поточний стан | Статус | Доказ (файл:рядок) |
|---|---|---|---|
| `callback_data` тільки короткі токени, без JSON, <=64 bytes | Генератор формує `v1:<token>:<id>`, стискає action/id до ліміту, без JSON fallback | OK | `apps/server/src/modules/Communication/telegram/core/utils/callbackUtils.ts:55` |
| Dual parsing (legacy + v1), генерація тільки v1 | Парсер приймає `v1`, legacy raw, старий `v1:act:*`; генератор видає тільки `v1:*` | OK | `apps/server/src/modules/Communication/telegram/core/utils/callbackUtils.ts:71` |
| Обовʼязкові action tokens v7 (lb/ls/br/bq/bv) | Усі токени присутні в `ActionTokens` і маршрутизуються в callback-router | OK | `apps/server/src/modules/Communication/telegram/core/utils/callbackUtils.ts:4`, `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts:71` |
| `web_app` тільки в private | Для non-private `web_app` кнопки санітизуються у deeplink URL; reply keyboards у non-private конвертуються в inline deep-link | OK | `apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts:69`, `apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts:93` |
| `request_contact` тільки private | Контактні кроки в wizard-ах перевіряють `chatType === private` і мають fallback на ручний ввід | OK | `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:743`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts:353` |
| PRIVATE ReplyKeyboard тільки режими, max 4 | `/start` Lead: 4 кнопки режимів; B2B registered: 4 кнопки | OK | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:202`, `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:274` |
| ADMIN/group: без ReplyKeyboard, тільки inline+інструкції | Для non-private: `admin.lead.help`/`admin.b2b.help`, без ReplyKeyboard | OK | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:196`, `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:236` |
| Wizard step header `Крок X/Y` + `⬅️ Назад` + `❌ Скасувати` | Реалізовано в Lead BUY/SELL, B2B Reg/Request/Variant | OK | `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:89`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts:70`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRequestWizard.ts:145`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bVariantWizard.ts:97`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts:116` |
| Optional fields мають `Пропустити` | Додано у quick-picks і текстові optional кроки | OK | `apps/server/src/modules/Communication/telegram/core/utils/quickPicks.ts:90`, `apps/server/src/modules/Communication/telegram/core/utils/quickPicks.ts:123`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts:281` |
| Перед submit є review `✅ Підтвердити / ✏️ Змінити / ❌ Скасувати` | Lead BUY/SELL, B2B request/variant, B2B registration мають review з цими діями | OK | `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:232`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts:196`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRequestWizard.ts:233`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bVariantWizard.ts:193`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts:186` |
| `✏️ Змінити` -> список полів -> jump до кроку | Реалізовано списки полів і jump callbacks (`lb_j`, `ls_j`, `bq_j`, `bv_j`, `br_j`) | OK | `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:241`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts:205`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRequestWizard.ts:242`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bVariantWizard.ts:201`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts:252` |
| Lead `/start` + inline `Відкрити MiniApp` + `Конфіденційність` | Реалізовано | OK | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:203`, `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:217` |
| B2B `/start` unregistered: тільки реєстраційні/інфо дії | Реалізовано; request/inventory ховаються до реєстрації | OK | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:259`, `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:274` |
| Lead BUY 9 кроків + review + edit-jump | Реалізовано повний flow, strict validations, no-match/external fallback | OK | `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:659`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:800` |
| Favorites: persist by tgUserId, список по 3, single admin lead для multi-car | Реалізовано через `MiniAppFavorite`, paging, unified lead submit | OK | `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:268`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:480`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:593` |
| Lead SELL admin idempotent actions `ls_save/ls_pubc/ls_pubb/ls_b2br` | Реалізовано через `sellAdminState` у lead payload | OK | `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts:445`, `apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts:635` |
| Support OPEN/NEW branching + review submit | Реалізовано `sup_add/sup_new/sup_submit` + model `SupportTicket` | OK | `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:424`, `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts:162`, `apps/server/prisma/schema.prisma:600` |
| B2B privacy: контакти не в channel/автору, тільки адміну на FIT | Channel post без контактів; requester бачить variant без contact; FIT -> admin з contact | OK | `apps/server/src/services/cardRenderer.ts:83`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bVariantWizard.ts:222`, `apps/server/src/modules/Communication/telegram/routing/wizards/b2bVariantWizard.ts:421` |
| UA-only copy pack + buttons map | Ключі Section 1 і map кнопок заповнено | OK | `apps/server/src/modules/Communication/telegram/core/utils/telegramText.ts:10`, `apps/server/src/modules/Communication/telegram/core/utils/telegramText.ts:198` |
| Card templates Section 4 | Lead card, after-batch controls, B2B request post, CarTié channel template реалізовані | OK | `apps/server/src/services/cardRenderer.ts:14`, `apps/server/src/services/cardRenderer.ts:62`, `apps/server/src/services/cardRenderer.ts:83`, `apps/server/src/services/cardRenderer.ts:134` |
| External HTML search safeguards | Canonical pipeline: robots/rate/backoff/cache; `urlParser` як adapter | OK | `apps/server/src/modules/Integrations/external-search/externalSearch.service.ts:188`, `apps/server/src/modules/Integrations/external-search/policy/robotsPolicy.ts:120`, `apps/server/src/modules/Integrations/external-search/policy/domainRateLimiter.ts:27`, `apps/server/src/modules/Integrations/external-search/policy/backoff.ts:5`, `apps/server/src/services/urlParser.ts:1` |

## Callback-контракт (деталізація)

- Канонічний формат: `v1:<token>:<id>`.
- Підтримка legacy:
- `v1:act:<token>:<id>`.
- old raw callbacks (`<token>_<id>`).
- historical `b2bv_<id>` -> `bv_send`.

Фактичний стан:
- Генерація: `buildCallbackData` (тільки v1) — `apps/server/src/modules/Communication/telegram/core/utils/callbackUtils.ts:55`.
- Парсинг dual-режиму: `parseCallbackData` — `apps/server/src/modules/Communication/telegram/core/utils/callbackUtils.ts:101`.
- Маршрутизація доменних токенів: `routeCallback` — `apps/server/src/modules/Communication/telegram/routing/routeCallback.ts:71`.

## Keyboard policy

- Private меню Lead/B2B: `routeMessage.showMenu` — `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:188`.
- Non-private sanitizer + deeplink fallback: `resolveReplyMarkupForChat` — `apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts:93`.

## RAW ID -> Bot API ID (before -> after)

Перевірено скриптом health-check (`apps/server/scripts/check_telegram_health.ts`):

| Контур | Before (RAW) | After (Bot API chat.id) | Статус |
|---|---:|---:|---|
| Lead admin | `5097128570` | `-1003785260526` | OK |
| Lead channel | `3662808163` | `-1003662808163` | OK |
| B2B admin | `5286062875` | `-1003702407477` | OK |
| B2B channel | `3818257920` | `-1003818257920` | OK |

Докази в коді/скрипті:
- RAW hints: `apps/server/scripts/check_telegram_health.ts:30`.
- before->after print: `apps/server/scripts/check_telegram_health.ts:176`.

## Висновок

Критичні вимоги Telegram UX v7 для Lead/B2B і callback-контракту виконані; регресії по build/test відсутні.
