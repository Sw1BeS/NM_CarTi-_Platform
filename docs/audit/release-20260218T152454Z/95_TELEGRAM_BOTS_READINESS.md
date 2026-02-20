# 95 Telegram Bots Readiness

Updated: 2026-02-20

## 1) Что считается «двумя ботами» в текущей платформе

В активном UI/пресетах поддерживаются 2 шаблона Telegram-ботов:

1. `CLIENT_LEAD` (Lead Bot)
2. `B2B` (B2B Network Bot)

Подтверждение в UI:
- `apps/web/src/pages/app/TelegramHub.components.tsx:455`
- `apps/web/src/pages/app/TelegramHub.components.tsx:456`
- `apps/web/src/modules/Telegram/components/AddBotModal.tsx:127`
- `apps/web/src/modules/Telegram/components/AddBotModal.tsx:128`

> Примечание: в backend ещё есть `CATALOG`, но в текущем рабочем UI акцент и чеклисты сделаны под `CLIENT_LEAD` и `B2B`.

---

## 2) Общая логика работы Telegram runtime

### 2.1 Вход апдейтов
1. Telegram webhook: `POST /api/telegram/webhook/:botId`
2. Валидация `X-Telegram-Bot-Api-Secret-Token`
3. Быстрый `200 OK`
4. Асинхронный запуск pipeline

Файлы:
- `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts:17`
- `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts:28`
- `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts:51`

### 2.2 Pipeline middleware цепочка

`resolveBotTenant -> dedup -> enrichContext -> normalize -> saveMessage -> routeMyChatMember -> routeUpdate -> emitEvent`

Файл:
- `apps/server/src/modules/Communication/telegram/scenarios/pipeline.ts:56`

Ключевые аспекты:
- dedup по `TelegramUpdate (botId, updateId)` (`P2002` останавливает дубль)
- входящие сообщения пишутся в `BotMessage`
- платформа пишет события в `PlatformEvent` и `IntegrationEventLog`

Файлы:
- `apps/server/src/modules/Communication/telegram/scenarios/middlewares/dedup.ts:17`
- `apps/server/src/modules/Communication/telegram/scenarios/middlewares/dedup.ts:34`
- `apps/server/src/modules/Communication/telegram/scenarios/middlewares/saveMessage.ts:7`
- `apps/server/src/modules/Communication/telegram/scenarios/middlewares/emitEvent.ts:16`

### 2.3 Polling/Webhook режим

- бот-менеджер стартует всех `isEnabled` ботов;
- режим берётся из `config.deliveryMode` (`polling`/`webhook`);
- для polling запускается цикл `getUpdates`;
- для webhook polling loop не запускается.

Файлы:
- `apps/server/src/modules/Communication/bots/bot.service.ts:38`
- `apps/server/src/modules/Communication/bots/bot.service.ts:74`
- `apps/server/src/modules/Communication/bots/bot.service.ts:311`

---

## 3) Логика каждого из двух ботов

## 3.1 `CLIENT_LEAD` (Lead Bot)

### Канонический preset (что должно быть)
- сценарии: `buy`, `sell`, `status`, `lang`
- меню: минимум 4 сценарных кнопки
- miniapp: включён и есть `miniAppConfig.url`
- username бота синхронизирован

Проверка preset-готовности:
- `apps/server/src/services/templatePreset.service.ts:784`
- `apps/server/src/services/templatePreset.service.ts:797`
- `apps/server/src/services/templatePreset.service.ts:799`

### Бизнес-логика
- запуск через Scenario Engine (flow-first)
- fallback legacy-ветки для template `CLIENT_LEAD` остаются как fallback path
- лид создаётся/мержится через `createOrMergeLead`, при необходимости создаётся `B2bRequest`

Файлы:
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:939`
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:960`
- `apps/server/src/modules/Communication/telegram/core/leadService.ts:74`

---

## 3.2 `B2B` (B2B Network Bot)

### Канонический preset (что должно быть)
- сценарии: `request`, `offer`, `help`
- меню-кнопки: request/offer/help/menu
- miniapp: включён и есть `miniAppConfig.url`
- username бота синхронизирован
- **обязательно**: `channelId` и `adminChatId`

Проверка preset-готовности:
- `apps/server/src/services/templatePreset.service.ts:806`
- `apps/server/src/services/templatePreset.service.ts:812`
- `apps/server/src/services/templatePreset.service.ts:825`
- `apps/server/src/services/templatePreset.service.ts:828`

### Бизнес-логика
- основной path: flow-first через Scenario Engine
- deep-link `/start request_*` и `/start offer_*` запускает сценарий offer path
- action-узлы:
  - `CREATE_REQUEST`
  - `B2B_PUBLISH_REQUEST` (публикация в канал с кнопкой `Є авто ✅`)
  - `CREATE_VARIANT` (предложение дилера, включая фото)

Файлы:
- `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:941`
- `apps/server/src/modules/Communication/bots/scenario-engine/actions/entry.actions.ts:144`
- `apps/server/src/modules/Communication/bots/scenario-engine/actions/entry.actions.ts:239`
- `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-action.actions.ts:94`
- `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-action.actions.ts:190`
- `apps/server/src/modules/Communication/bots/scenario-engine/actions/node-action.actions.ts:322`

---

## 4) MiniApp и публичный контур

Для обоих шаблонов критично:
- `MiniApp` write-операции требуют валидный `initData`
- верификация делается по токену конкретного бота (или всех enabled ботов в company scope)
- slug резолвится через showcase/workspace/bot username/defaultShowcaseSlug

Файлы:
- `apps/server/src/routes/miniAppRoutes.ts:34`
- `apps/server/src/routes/miniAppRoutes.ts:137`
- `apps/server/src/routes/miniAppRoutes.ts:166`
- `apps/server/src/services/publicSlug.service.ts:26`
- `apps/server/src/services/publicSlug.service.ts:114`

---

## 5) Фактический статус на сервере `/srv/cartie` (runtime snapshot)

Дата проверки: 2026-02-20

### 5.1 Инстансы ботов в БД

- Всего ботов: `1`
- Активных ботов (`isEnabled=true`): `1`
- По шаблонам: только `B2B`

### 5.2 Активный бот

- id: `cmlb6zpgs000p46rg3mgs4ax7`
- name: `CARTIE_TEST_BOT`
- template: `B2B`
- presetStatus: `partial`
- presetVersion: `2026.02.18-r7`
- deliveryMode в БД: `POLLING`
- webhook у Telegram: установлен, ошибок нет, pending=0
- getMe username и config username: совпадают

### 5.3 Готовность B2B по обязательным пунктам

OK:
- сценарии `request/offer/help` присутствуют и активны
- меню request/offer/help/menu присутствует
- miniapp URL присутствует
- adminChatId присутствует
- username синхронизирован

MISSING:
- `channelId` отсутствует (`null`)

Следствие:
- бот не достигает статуса `ready` по B2B (остается `partial`)
- публикация запросов в канал (`B2B_PUBLISH_REQUEST`) не сможет стабильно работать

---

## 6) Что нужно, чтобы «оба бота» были полностью готовы

1. Создать/включить отдельный `CLIENT_LEAD` бот (сейчас его нет в runtime).
2. Для B2B-бота задать `channelId` (критический пробел).
3. Привести delivery mode в единое состояние:
   - сейчас у активного бота в БД `POLLING`, а webhook уже установлен;
   - рекомендуется перевести в `webhook` через API настройки webhook.
4. После правок прогнать синхронизацию:
   - `apps/server/scripts/sync_bot_presets.ts`
   - проверка webhook/getMe и presetStatus.

---

## 7) Критичные риски/заметки

1. Логика B2B legacy fallback зависит от env-флага `TELEGRAM_B2B_LEGACY_FALLBACK`; при `false` работает только flow-first path.
   - `apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:924`
2. Секрет webhook проверяется на уровне бота с env fallback для legacy.
   - `apps/server/src/modules/Communication/telegram/core/telegram.routes.ts:28`
3. Security preflight по env сейчас проходит (`[SECURITY_PREFLIGHT] OK`).
   - `infra/security_preflight.sh:84`

