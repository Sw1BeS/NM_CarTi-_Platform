# 🚗 CarTié Platform — FINAL TELEGRAM & MINIAPP AUDIT REPORT

**Дата:** 2026-02-24  
**Автор:** Senior Full-Stack Engineer & Telegram MiniApp Architect  
**Статус:** READY FOR APPROVAL  
**Версия:** 1.0

---

## 📋 EXECUTIVE SUMMARY

### 🔴 Критические проблемы (P0)

| # | Проблема | Влияние | Файлы | Приоритет |
|---|----------|---------|-------|-----------|
| 1 | **In-Memory BotSession Storage** — сессии теряются при рестарте сервера | Пользователи теряют контекст wizard'ов, лиды не сохраняются | `schema.prisma:1281`, `bot.service.ts` | P0 |
| 2 | **No Webhook Idempotency** — дубли лидов при retry от Telegram | Дубли в CRM, путаница у менеджеров | `routeWebApp.ts`, `TelegramUpdate` model | P0 |
| 3 | **MiniApp BackButton Not Integrated** — навигация сломана | Пользователь не может вернуться, закрывает MiniApp | `MiniApp.tsx:1451 lines` | P0 |
| 4 | **Dual Schema Legacy+v4.1** — inconsistency данных | Favorites/Requests могут теряться | `schema.prisma:728`, `MiniAppFavorite` | P0 |
| 5 | **Incomplete B2B Whitelist Flow** — approve/reject не завершен | B2B партнеры не получают доступ | `b2bRegistrationWizard.ts:734 lines` | P0 |
| 6 | **Large Files (>1000 lines)** — 5 файлов требуют рефакторинга | Невозможно поддерживать, высокий баг-риск | См. раздел 6.F | P1 |
| 7 | **Test Coverage ~10%** — нет E2E тестов критических сценариев | Регрессии обнаруживаются в production | `/wizards/*`, `routeWebApp.ts` | P1 |
| 8 | **Platform Editor Overwrites Config** — menuConfig сбрасывается | Настройки кнопок пропадают после сохранения | `BotMenuEditor.tsx:297`, `bot.service.ts:154` | P1 |

### 🟡 UX Debt (P1-P2)

| # | Проблема | Влияние |
|---|----------|---------|
| 1 | 8 кнопок в один столбец в боте | Плохой UX, невозможно быстро найти нужное |
| 2 | "Підібрати авто" открывает главную, а не форму подбора | Лишний клик, потеря конверсии |
| 3 | Нет fallback image для авто без фото | Пустые карточки, ощущение "сломано" |
| 4 | Support кнопка — plain text без действия | Пользователь не может связаться |
| 5 | Черный разрыв в "Авто в наявності" | Визуальный баг, недоверие к продукту |
| 6 | Нет явного empty state для "Авто в дорозі" | Пользователь думает что ничего не произошло |

### ✅ Что работает хорошо

| Компонент | Оценка | Комментарий |
|-----------|--------|-------------|
| Webhook Contract v7 | 10/10 | Полное соответствие требованиям Telegram |
| Callback Tokens ≤64 bytes | 10/10 | COMPLIANT |
| Dual Parsing (legacy+v1) | 9/10 | Поддержка старых и новых клиентов |
| Lead BUY Wizard (9 шагов) | 9/10 | Логика полная, но файл слишком большой |
| Privacy (no contacts in public) | 10/10 | COMPLIANT |
| MiniApp Payload Parser v1 | 9/10 | Парсит все типы событий |
| Viewport CSS vars | 10/10 | Адаптивность под разные устройства |
| Ukrainian Language Pack | 10/10 | Полный перевод |

**Overall Score: 7.2/10** — Production-ready с техническим долгом

---

## 🗺 USER JOURNEY MAP

### Сценарий 1: Підібрати авто за 1 хвилину

**Expected:**
1. Пользователь нажимает кнопку в боте
2. MiniApp открывается сразу на форме подбора (не главная!)
3. Пошаговый выбор: бренд → модель → год → бюджет → город
4. Кнопка "Продовжити" → запрос контакта Telegram
5. После контакта → заявка создана → менеджер получил

**Current:**
- ❌ Открывается главная страница MiniApp
- ❌ Пользователь должен сам найти форму подбора
- ❌ Нет явного CTA "Подобрать авто"
- ❌ Contact sharing работает, но не всегда создается заявка в БД

**Root Cause:**
- `MiniApp.tsx` не парсит `entry=request&type=BUY` из start_param
- `buildMiniAppUrl()` в `miniappUrl.ts:16` не добавляет entry по умолчанию
- Wizard `leadBuyWizard.ts:1363` ожидает состояние `CL_MINIAPP_CONTACT`, но оно не всегда выставляется

**Files Involved:**
- `/apps/web/src/pages/public/MiniApp.tsx:486-530`
- `/apps/server/src/modules/Communication/telegram/core/utils/miniappUrl.ts`
- `/apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts`

**Proposed Fix:**
```typescript
// miniappUrl.ts:16
export const buildMiniAppUrl = (bot: BotConfig, filters: Record<string, any> = {}) => {
  // Add default entry=request for BUY flow
  if (!filters.entry && bot.template === 'CLIENT_LEAD') {
    filters.entry = 'request';
    filters.type = 'BUY';
  }
  // ... rest of logic
};
```

---

### Сценарий 2: Авто в наявності

**Expected:**
1. Кнопка открывает каталог с фильтрами
2. Карточки с фото, ценой, годом, пробегом, городом
3. Кнопка "Зацікавило це авто" на каждой карточке
4. Если авто нет — красивый empty state с CTA "Підібрати авто"

**Current:**
- ✅ Каталог открывается
- ❌ Большой черный разрыв в layout (gap)
- ❌ Нет fallback image → пустые серые блоки
- ❌ Кнопка "Запит на підбір" вместо "Зацікавило це авто"
- ❌ Empty state — просто пусто, нет CTA

**Root Cause:**
- Frontend CSS gap в `CatalogView.tsx`
- DTO не нормализует `imageUrl` → `thumbnail`
- Текст кнопки захардкожен в `CarCard.tsx`

**Files Involved:**
- `/apps/web/src/pages/public/miniapp/views/CatalogView.tsx`
- `/apps/web/src/components/CarCard.tsx`
- `/apps/server/src/services/dto.ts`

---

### Сценарий 3: Авто в дорозі

**Expected:**
1. Фильтр `status=PENDING`
2. Те же карточки что и в наличии
3. Empty state: "Наразі немає авто в дорозі. Хочете підібрати?"

**Current:**
- ❌ Фильтр работает, но нет явного индикатора
- ❌ Empty state отсутствует → ощущение "ничего не произошло"

**Root Cause:**
- `getShowcaseInventory()` не возвращает `totalCount`
- Frontend не проверяет `cars.length === 0`

---

### Сценарий 4: Заинтересовало конкретное авто

**Expected:**
1. Клик "Зацікавило це авто" на карточке
2. MiniApp отправляет `web_app_data` с `carId`
3. Backend создает заявку с привязкой к авто
4. Менеджер видит: "Клиент интересуется BMW X5 2020"

**Current:**
- ✅ `routeWebApp.ts:97-174` обрабатывает `interest_click`
- ⚠️ Но `pendingIntentCreated` может быть false → данные теряются
- ⚠️ `requestContractService.createPendingLeadIntent()` может упасть

**Root Cause:**
- Нет try-catch вокруг `createPendingLeadIntent`
- Если fallthrough в `ctx.session.variables.miniappInterestDraft` — данные не персистятся

**Files Involved:**
- `/apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts:114-153`
- `/apps/server/src/services/requestContract.service.ts`

---

### Сценарий 5: Обране (Favorites)

**Expected:**
1. Клик ❤️ на карточке
2. Сохранение в БД (`MiniAppFavorite`)
3. При повторном открытии — отмечено
4. Раздел "Обране" показывает список

**Current:**
- ✅ `routeWebApp.ts:176-237` обрабатывает `fav_toggle`
- ⚠️ Но используется ТОЛЬКО `tgUserId`, нет fallback на `visitorId`
- ⚠️ Если пользователь открыл без initData — favorites не работают

**Root Cause:**
- `MiniAppFavorite` schema имеет `visitorId`, но код его не использует
- `getMiniAppFavorites()` в `miniappApi.ts` требует tgUserId

**Schema:**
```prisma
model MiniAppFavorite {
  id           String   @id @default(cuid())
  companyId    String
  carListingId String
  tgUserId     String?    // ← только это используется
  visitorId    String?    // ← НЕ используется!
  createdAt    DateTime @default(now())
  
  @@unique([companyId, carListingId, tgUserId])
  @@unique([companyId, carListingId, visitorId]) // ← есть, но не юзается
}
```

**Files Involved:**
- `/apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts:176-237`
- `/apps/web/src/services/miniappApi.ts`
- `/apps/server/prisma/schema.prisma:728-743`

---

### Сценарий 6: Продати авто

**Expected:**
1. Кнопка "Продати авто" в боте
2. Wizard собирает: марка, модель, год, пробег, цена, фото
3. Заявка уходит менеджеру
4. Пользователь получает подтверждение

**Current:**
- ✅ `leadSellWizard.ts:1212 lines` существует
- ❌ Но файл слишком большой, логика запутанная
- ❌ Нет явного CTA в MiniApp для продажи
- ❌ Фото не всегда прикрепляются

**Root Cause:**
- Wizard смешивает UI логику и бизнес-логику
- Нет отдельного endpoint для загрузки фото

---

### Сценарий 7: Підтримка

**Expected:**
1. Кнопка "Підтримка"
2. Опции: чат с менеджером / телефон / Telegram username
3. Или форма "Оставьте вопрос"

**Current:**
- ❌ Кнопка есть, но ведет на plain text сообщение
- ❌ Нет manager username в config
- ❌ Нет формы обратной связи

**Root Cause:**
- `menuConfig.buttons` не поддерживает тип `SUPPORT`
- Нет `managerContact` поля в `BotConfig.config`

---

### Сценарий 8: Menu Button (стандартная кнопка меню)

**Expected:**
1. Кнопка слева от input в Telegram
2. Открывает MiniApp с initData
3. Передает `start_param`

**Current:**
- ✅ `bot.service.ts:150-161` вызывает `setChatMenuButton`
- ✅ URL формируется через `buildMiniAppUrl()`
- ⚠️ Но `entry=inventory&status=AVAILABLE` захардкожен

**Root Cause:**
- `syncChatMenuButton()` не читает `menuButtonText` из `menuConfig`
- Всегда ставит "Каталог авто"

**Files Involved:**
- `/apps/server/src/modules/Communication/bots/bot.service.ts:150-161`

---

### Сценарий 9: Bot Keyboard Buttons

**Expected:**
1. 4-5 кнопок в 2 ряда (не 8 в столбик!)
2. Логические группы: [Купить, Продать] [Наличие, В пути] [Избранное, Поддержка]
3. Каждая кнопка передает правильный `start_param`

**Current:**
- ❌ `BotMenuEditor.tsx` позволяет создать сколько угодно кнопок
- ❌ Нет валидации на max 6 кнопок
- ❌ Ряды (row/col) не всегда соблюдаются

**Root Cause:**
- `normalizeMenuConfig()` в `BotMenuEditor.tsx:21-39` не валидирует количество
- Frontend рендерит всё что есть в БД

---

### Сценарий 10: Platform Admin Config

**Expected:**
1. Админ редактирует кнопки в `BotMenuEditor`
2. Сохраняет → кнопки обновляются в боте
3. Конфиг не затирается при других изменениях

**Current:**
- ❌ `Data.saveBot()` в `BotMenuEditor.tsx:297` перезаписывает весь `menuConfig`
- ❌ `bot.service.ts:154` вызывает `setChatMenuButton` при каждом старте бота
- ❌ Если два админа редактируют — последний затирает первого

**Root Cause:**
- Нет optimistic locking на `BotConfig.config`
- Нет audit log изменений menuConfig

---

## 🎯 BOT/MINIAPP NAVIGATION CONTRACT

### Рекомендуемая структура кнопок

```
┌─────────────────────────────────────┐
│  [🚗 Підібрати авто] [💰 Продати]   │  ← Row 0: Primary Actions
├─────────────────────────────────────┤
│  [📦 В наявності] [🚚 В дорозі]     │  ← Row 1: Inventory
├─────────────────────────────────────┤
│  [⭐ Обране] [📞 Підтримка]         │  ← Row 2: Secondary
└─────────────────────────────────────┘
```

### Детальный контракт

| Label | Type | Row | Col | Target URL | start_param | Expected Screen | initData Required |
|-------|------|-----|-----|------------|-------------|-----------------|-------------------|
| 🚗 Підібрати авто | web_app | 0 | 0 | `/p/app/{slug}` | `entry=request&type=BUY` | RequestView (BUY) | Yes |
| 💰 Продати авто | web_app | 0 | 1 | `/p/app/{slug}` | `entry=request&type=SELL` | RequestView (SELL) | Yes |
| 📦 В наявності | web_app | 1 | 0 | `/p/app/{slug}` | `entry=inventory&status=AVAILABLE` | CatalogView | No |
| 🚚 В дорозі | web_app | 1 | 1 | `/p/app/{slug}` | `entry=inventory&status=PENDING` | CatalogView | No |
| ⭐ Обране | web_app | 2 | 0 | `/p/app/{slug}` | `entry=favorites` | FavoritesView | Yes |
| 📞 Підтримка | web_app | 2 | 1 | `/p/app/{slug}` | `entry=support` | SupportView | No |

### Fallback Behavior

| Scenario | Fallback |
|----------|----------|
| Открыто в браузере (не Telegram) | Показать warning + кнопку "Відкрити в Telegram" |
| Нет initData | Разрешить просмотр каталога, запретить favorites/requests |
| Невалидный start_param | Открыть главную страницу |
| Slug не найден | Открыть `system` showcase с warning |

---

## ⚙️ PLATFORM EDITOR RISK ANALYSIS

### Current Flow

```
BotMenuEditor.tsx
  ↓ (saveConfig)
Data.saveBot(updatedBot)
  ↓ (PATCH /api/bots/:id)
bot.service.ts:restart()
  ↓
syncChatMenuButton() → setChatMenuButton API call
  ↓
registerCommands() → setMyCommands API call
```

### Risks

1. **Race Condition**: Два админа одновременно редактируют → последний затирает
2. **No Validation**: Можно создать 20 кнопок в одном ряду → сломает UI
3. **No Rollback**: Если `setChatMenuButton` упал — конфиг уже сохранен в БД
4. **Hardcoded Defaults**: `menuButtonText = 'Каталог авто'` игнорирует настройки

### Recommendations

1. **Add Optimistic Locking**:
   ```prisma
   model BotConfig {
     configVersion Int @default(0)
   }
   ```
   
2. **Validate in Backend**:
   ```typescript
   // bot.service.ts
   if (buttons.length > 6) throw new Error('Max 6 buttons allowed');
   if (rows > 3) throw new Error('Max 3 rows allowed');
   ```

3. **Two-Phase Commit**:
   - Phase 1: Save to DB with `pendingConfig`
   - Phase 2: Call Telegram API
   - Phase 3: If success, move `pendingConfig` → `config`

4. **Audit Log**:
   ```prisma
   model BotConfigChange {
     botId String
     changedBy String
     oldConfig Json
     newConfig Json
     createdAt DateTime
   }
   ```

---

## 🎨 UI/UX PLAN

### Bot Keyboard Structure

**Welcome Message (сократить!):**
```
Вітаємо в CarTié! 🚗

Швидко підберемо авто або допоможемо продати.
Оберіть потрібний розділ:
```

**Button Layout:**
```typescript
const menuConfig = {
  welcomeMessage: "...",
  buttons: [
    { label: "🚗 Підібрати авто", type: "WEB_APP", row: 0, col: 0, value: "/p/app/cartie?entry=request&type=BUY" },
    { label: "💰 Продати авто", type: "WEB_APP", row: 0, col: 1, value: "/p/app/cartie?entry=request&type=SELL" },
    { label: "📦 В наявності", type: "WEB_APP", row: 1, col: 0, value: "/p/app/cartie?entry=inventory&status=AVAILABLE" },
    { label: "🚚 В дорозі", type: "WEB_APP", row: 1, col: 1, value: "/p/app/cartie?entry=inventory&status=PENDING" },
    { label: "⭐ Обране", type: "WEB_APP", row: 2, col: 0, value: "/p/app/cartie?entry=favorites" },
    { label: "📞 Підтримка", type: "WEB_APP", row: 2, col: 1, value: "/p/app/cartie?entry=support" }
  ]
};
```

### MiniApp Home Structure

**LEAD Mode:**
```
┌─────────────────────────────────┐
│ 👤 Avatar + "Вітаємо, {name}!"  │
├─────────────────────────────────┤
│  [🚗 Підібрати авто за 1 хв]    │  ← Primary CTA (sticky)
├─────────────────────────────────┤
│  📦 В наявності (12)            │
│  🚚 В дорозі (5)                │
│  ⭐ Обране (3)                  │
├─────────────────────────────────┤
│  [📞 Консультація менеджера]    │
└─────────────────────────────────┘
```

**B2B Mode:**
```
┌─────────────────────────────────┐
│ 🏢 "{Company Name}"             │
├─────────────────────────────────┤
│  [➕ Створити запит]            │
├─────────────────────────────────┤
│  📥 Мої запити (7)              │
│  📤 Мої варіанти (15)           │
│  ⭐ Обране (22)                 │
└─────────────────────────────────┘
```

### Car Card CTA

**Current:**
```
[Зображення]
BMW X5 2020
$45,000 · Київ · 80k км

[Запит на підбір]  ← ❌ Непонятно
[❤️]
```

**Proposed:**
```
[Зображення]
BMW X5 2020
$45,000 · Київ · 80k км

[Зацікавило це авто]  ← ✅ Конкретно
[❤️ 12]
```

### Empty States

**Auto in Transit (Empty):**
```
┌─────────────────────────────────┐
│         🚚                      │
│                                 │
│  Наразі немає авто в дорозі     │
│                                 │
│  Хочете підібрати аналогічне?   │
│  [Підібрати авто]               │
└─────────────────────────────────┘
```

**Favorites (Empty):**
```
┌─────────────────────────────────┐
│         ⭐                      │
│                                 │
│  Ви ще не додали авто в обране  │
│                                 │
│  Перегляньте каталог:           │
│  [В наявності] [В дорозі]       │
└─────────────────────────────────┘
```

### Support/Contact Hub

```
┌─────────────────────────────────┐
│  📞 Підтримка                   │
├─────────────────────────────────┤
│  Менеджер: Олександр            │
│  📱 +380 XX XXX XX XX           │
│  ✈️ @cartie_manager             │
├─────────────────────────────────┤
│  [Написати в Telegram]          │
│  [Зателефонувати]               │
│  [Задати питання]               │
└─────────────────────────────────┘
```

### Profile/Avatar Behavior

**Priority:**
1. `tgUser.photo_url` из Telegram WebApp initData
2. Fallback: генерированный аватар (инициалы + цвет)
3. Fallback: дефолтная иконка пользователя

**Implementation:**
```typescript
const avatar = tgUser?.photo_url 
  || generateInitialsAvatar(tgUser?.first_name, tgUser?.last_name)
  || '/default-avatar.png';
```

---

## 🔧 TECHNICAL FIX PLAN

### Этап 1: P0 Restore Access/Navigation/initData (Неделя 1-2)

**Цель:** Гарантировать что MiniApp открывается правильно из всех точек

| Task | Files | Expected Behavior | Tests | Risk |
|------|-------|-------------------|-------|------|
| 1.1 Добавить `entry` param по умолчанию | `miniappUrl.ts:16-61` | `buildMiniAppUrl()` всегда добавляет `entry=request` для CLIENT_LEAD ботов | Unit test: проверить URL для разных templates | Low |
| 1.2 Парсить `entry` в MiniApp | `MiniApp.tsx:486-530` | При `entry=request` сразу открывать RequestView | Manual: открыть из бота → должна быть форма | Medium |
| 1.3 Интегрировать BackButton | `MiniApp.tsx`, `navigation.ts` | BackButton работает между views | Manual: пройти 3 экрана → назад должен работать | Medium |
| 1.4 Fallback для initData | `MiniApp.tsx:157-215` | Если нет initData — показать warning, но разрешить каталог | Manual: открыть в браузере → warning + каталог | Low |

**Rollback Plan:**
- Вернуть старый `miniappUrl.ts` из git
- Feature flag: `MINIAPP_ENTRY_PARAM_ENABLED=false`

---

### Этап 2: P0 Favorite/Request Persistence (Неделя 2-3)

**Цель:** Гарантировать что данные не теряются

| Task | Files | Expected Behavior | Tests | Risk |
|------|-------|-------------------|-------|------|
| 2.1 Использовать `visitorId` fallback | `routeWebApp.ts:176-237`, `miniappApi.ts` | Если нет tgUserId — использовать visitorId | Unit test: fav_toggle без tgUserId | Medium |
| 2.2 Fix pendingIntent race condition | `routeWebApp.ts:114-153` | Если `createPendingLeadIntent` упал — сохранить в session variables | Integration test: interest_click → проверить БД | High |
| 2.3 Добавить idempotency key | `TelegramUpdate`, `routeWebApp.ts` | Дубли update_id не создают дубли лидов | Load test: 10 одинаковых webhook → 1 лид | High |
| 2.4 Redis sessions (опционально) | `bot.service.ts`, новая модель | Сессии не теряются при рестарте | Manual: рестарт сервера → сессия сохранилась | High |

**Rollback Plan:**
- Откатить migration с idempotency key
- Вернуть старую логику favorites

---

### Этап 3: P1 Catalog DTO/Photos/Data Fields (Неделя 3-4)

**Цель:** Карточки авто выглядят профессионально

| Task | Files | Expected Behavior | Tests | Risk |
|------|-------|-------------------|-------|------|
| 3.1 Добавить fallback image | `dto.ts`, `CarCard.tsx` | Если нет photo — показать placeholder | Visual regression test | Low |
| 3.2 Нормализовать DTO | `dto.ts: CarListing → MiniAppDTO` | Все поля: title, price, year, mileage, city | Unit test: mapping полей | Medium |
| 3.3 Fix CSS gap | `CatalogView.tsx` | Нет черного разрыва | Visual test на разных экранах | Low |
| 3.4 Добавить totalCount | `getShowcaseInventory()` | Frontend знает общее число авто | Unit test: response включает total | Low |

**Rollback Plan:**
- CSS можно откатить быстро
- DTO changes требуют миграции API version

---

### Этап 4: P1 Sell/Support Flows (Неделя 4-5)

**Цель:** Завершенные сценарии продажи и поддержки

| Task | Files | Expected Behavior | Tests | Risk |
|------|-------|-------------------|-------|------|
| 4.1 Refactor leadSellWizard | `leadSellWizard.ts:1212 lines` | Разбить на 3 файла: steps, validation, submission | Unit tests для каждого модуля | High |
| 4.2 Добавить upload фото | Новый endpoint `POST /api/miniapp/upload` | Фото загружаются, URL сохраняется в заявке | Manual: отправить заявку с фото | Medium |
| 4.3 Support view с контактами | `SupportView.tsx`, `BotConfig.config` | Показывает manager phone/username | Manual: проверить все fallbacks | Low |
| 4.4 Форма "Задать вопрос" | `SupportView.tsx`, новый роут | Вопрос уходит в admin chat | Integration test: форма → сообщение в чат | Medium |

**Rollback Plan:**
- Старый wizard можно вернуть из git
- Upload endpoint можно отключить feature flag'ом

---

### Этап 5: P2 Visual Cleanup (Неделя 5-6)

**Цель:** Полировка UI

| Task | Files | Expected Behavior | Tests | Risk |
|------|-------|-------------------|-------|------|
| 5.1 Сократить welcome message | `BotMenuEditor.tsx`, `routeMessage.ts` | Максимум 3 строки | Manual: проверить в Telegram | Low |
| 5.2 Переименовать кнопки | `menuConfig` defaults | "Нові авто" → "В наявності" | Manual: проверить все labels | Low |
| 5.3 Empty states | `CatalogView.tsx`, `FavoritesView.tsx` | Красивые SVG + CTA | Visual test | Low |
| 5.4 Profile avatar | `ProfileView.tsx` | Показывает фото из TG или fallback | Manual: с разными user | Low |

---

### Этап 6: P2 Platform Editor Hardening (Неделя 6-7)

**Цель:** Админка не ломает конфиг

| Task | Files | Expected Behavior | Tests | Risk |
|------|-------|-------------------|-------|------|
| 6.1 Валидация кнопок | `BotMenuEditor.tsx`, backend validator | Max 6 кнопок, max 3 ряда | Unit test: попытка добавить 7-ю кнопку | Medium |
| 6.2 Optimistic locking | `BotConfig` schema, `saveBot` API | Concurrent edits rejected | Integration test: 2 одновременных save | High |
| 6.3 Audit log | Новая модель `BotConfigChange` | Все изменения логируются | Manual: проверить лог после edit | Medium |
| 6.4 Two-phase commit | `bot.service.ts:saveConfig` | Если Telegram API упал — конфиг не сохраняется | Integration test: mock failed API call | High |

---

## 📅 PROPOSED IMPLEMENTATION ORDER

### Неделя 1: Critical Navigation Fixes
- [ ] 1.1 Добавить `entry` param по умолчанию
- [ ] 1.2 Парсить `entry` в MiniApp
- [ ] 1.4 Fallback для initData
- [ ] Smoke test: открыть из всех кнопок бота

### Неделя 2: Data Persistence
- [ ] 2.1 Использовать `visitorId` fallback
- [ ] 2.2 Fix pendingIntent race condition
- [ ] 2.3 Добавить idempotency key
- [ ] Smoke test: создать 10 лидов → проверить дубли

### Неделя 3: Catalog Polish
- [ ] 3.1 Добавить fallback image
- [ ] 3.2 Нормализовать DTO
- [ ] 3.3 Fix CSS gap
- [ ] Visual review на production-like data

### Неделя 4: BackButton + Sell Flow
- [ ] 1.3 Интегрировать BackButton
- [ ] 4.1 Refactor leadSellWizard (часть 1)
- [ ] 4.2 Добавить upload фото
- [ ] Manual test: полный цикл продажи

### Неделя 5: Support + Empty States
- [ ] 4.3 Support view с контактами
- [ ] 4.4 Форма "Задать вопрос"
- [ ] 5.3 Empty states
- [ ] Manual test: все empty states

### Неделя 6: Visual Cleanup
- [ ] 5.1 Сократить welcome message
- [ ] 5.2 Переименовать кнопки
- [ ] 5.4 Profile avatar
- [ ] UX review с клиентом

### Неделя 7: Platform Hardening
- [ ] 6.1 Валидация кнопок
- [ ] 6.2 Optimistic locking
- [ ] 6.3 Audit log
- [ ] 6.4 Two-phase commit
- [ ] Load test: concurrent edits

### Неделя 8: Testing + Documentation
- [ ] Написать E2E тесты (10 сценариев)
- [ ] Обновить документацию
- [ ] Runbook для production incidents
- [ ] Final QA sign-off

---

## 🧪 SMOKE CHECKS FOR PRODUCTION

### Pre-Deploy Checklist

```bash
# 1. Проверить git state
git status
git log --oneline -5
git diff origin/main

# 2. Проверить build SHA
cat /app/server/BUILD_SHA
cat /app/web/BUILD_SHA

# 3. Проверить health endpoints
curl https://cartie2.umanoff-analytics.space/health
curl https://cartie2.umanoff-analytics.space/api/health

# 4. Проверить MiniApp routes
curl "https://cartie2.umanoff-analytics.space/p/app/cartie?entry=request"
curl "https://cartie2.umanoff-analytics.space/p/app/cartie?entry=inventory&status=AVAILABLE"
curl "https://cartie2.umanoff-analytics.space/p/app/cartie?entry=favorites"

# 5. Проверить BotConfig
psql -c "SELECT id, name, template, \"deliveryMode\", \"config\"->>'miniAppConfig' FROM \"BotConfig\" LIMIT 5;"

# 6. Проверить Telegram webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# 7. Проверить последние лиды
psql -c "SELECT id, \"clientName\", phone, request, \"createdAt\" FROM \"Lead\" ORDER BY \"createdAt\" DESC LIMIT 10;"

# 8. Проверить favorites
psql -c "SELECT COUNT(*) FROM \"MiniAppFavorite\" WHERE \"createdAt\" > NOW() - INTERVAL '24 hours';"
```

### Post-Deploy Verification

1. **Открыть MiniApp из menu button** → должна быть форма подбора
2. **Нажать "В наявності"** → каталог с фото
3. **Нажать ❤️ на авто** → добавлено в избранное
4. **Нажать "Зацікавило це авто"** → заявка создана
5. **Открыть "Обране"** → авто в списке
6. **Нажать "Продати авто"** → wizard запускается
7. **Нажать "Підтримка"** → контакты менеджера
8. **Проверить admin chat** → все уведомления приходят

---

## 📊 METRICS TO TRACK

### Business Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| MiniApp Open Rate | ? | >80% | `PlatformEvent` eventType=`miniapp.opened` |
| Request Conversion | ? | >25% | `B2bRequest` / `MiniAppFavorite` ratio |
| Favorite Usage | ? | >40% users | `MiniAppFavorite` unique users / MAU |
| Sell Flow Completion | ? | >60% | `leadSellWizard` complete / start |
| Support Response Time | ? | <5 min | `SupportTicket` createdAt → first reply |

### Technical Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| MiniApp Load Time | ? | <2s | Performance API in browser |
| API Error Rate | ? | <1% | Logs: 5xx errors / total requests |
| Webhook Retry Rate | ? | <5% | `TelegramUpdate` duplicate update_id |
| Session Loss Rate | ? | 0% | `BotSession` lost after restart |
| Test Coverage | ~10% | >70% | `npm run test:coverage` |

---

## 🚨 RISK MITIGATION

### High-Risk Changes

| Change | Risk | Mitigation | Rollback |
|--------|------|------------|----------|
| Idempotency Key | Может замедлить webhook | Добавить индекс на `update_id` | Откатить migration |
| Redis Sessions | Новая зависимость | Deploy Redis cluster сначала | Вернуть in-memory |
| DTO Normalization | Может сломать frontend | Version API: `/api/v2/miniapp` | Вернуть v1 endpoint |
| Two-Phase Commit | Может заблокировать saves | Добавить timeout 30s | Отключить feature flag |

### Communication Plan

1. **Перед деплоем:** Уведомить команду в Slack
2. **Во время деплоя:** Post updates каждые 15 мин
3. **После деплоя:** Post smoke test results
4. **Если проблемы:** Immediate rollback + post-mortem

---

## ✅ APPROVAL REQUIRED

**Для начала реализации требуется approval:**

- [ ] Product Owner: приоритеты подтверждены
- [ ] Tech Lead: архитектурные решения одобрены
- [ ] DevOps: инфраструктура готова (Redis, migrations)
- [ ] QA: тест-план reviewed

**Next Step:** После approval начать с Этапа 1 (Неделя 1).

---

## 📎 APPENDIX A: FILES REQUIRING CHANGES

### Backend (17 files)

```
/apps/server/prisma/schema.prisma                    # MiniAppFavorite, TelegramUpdate indexes
/apps/server/src/modules/Communication/bots/bot.service.ts
/apps/server/src/modules/Communication/telegram/core/utils/miniappUrl.ts
/apps/server/src/modules/Communication/telegram/core/utils/miniappPayload.ts
/apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts
/apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts
/apps/server/src/modules/Communication/telegram/routing/routeMessage.ts
/apps/server/src/modules/Communication/telegram/routing/routeCallback.ts
/apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts      # 1363 lines → refactor
/apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts     # 1212 lines → refactor
/apps/server/src/modules/Communication/telegram/routing/wizards/b2bSellWizard.ts      # 1137 lines → refactor
/apps/server/src/modules/Communication/telegram/routing/wizards/b2bRequestWizard.ts
/apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts
/apps/server/src/modules/Communication/telegram/routing/wizards/b2bVariantWizard.ts
/apps/server/src/services/requestContract.service.ts
/apps/server/src/services/dto.ts
/apps/server/src/services/miniapp.service.ts
```

### Frontend (12 files)

```
/apps/web/src/pages/public/MiniApp.tsx                     # 1451 lines → extract views
/apps/web/src/services/miniappApi.ts
/apps/web/src/services/telegram.ts
/apps/web/src/pages/public/miniapp/views/CatalogView.tsx
/apps/web/src/pages/public/miniapp/views/FavoritesView.tsx
/apps/web/src/pages/public/miniapp/views/RequestView.tsx
/apps/web/src/pages/public/miniapp/views/ProfileView.tsx
/apps/web/src/pages/public/miniapp/views/SupportView.tsx   # NEW
/apps/web/src/pages/public/miniapp/navigation.ts
/apps/web/src/pages/public/miniapp/telegramViewport.ts
/apps/web/src/modules/Telegram/components/BotMenuEditor.tsx
/apps/web/src/components/CarCard.tsx
```

### Infrastructure (3 files)

```
/infra/docker-compose.cartie2.prod.yml   # Redis service
/.env.example                            # REDIS_URL
/scripts/migrate-idempotency.sql         # Migration script
```

---

## 📎 APPENDIX B: EXISTING DOCUMENTATION REVIEW

Проанализировано 17 MD файлов документации:

| Файл | Статус | Комментарий |
|------|--------|-------------|
| `docs/ARCHITECTURE.md` | ✅ Актуально | Общая архитектура верна |
| `docs/audit_v7_miniapp.md` | ✅ Актуально | V7 compliance проверен |
| `docs/PLAN-platform-audit.md` | ⚠️ Частично | Некоторые задачи выполнены |
| `docs/qa_telegram_release_gates_2026-02-23.md` | ✅ Актуально | Release gates правильные |
| `docs/SETUP_CREDENTIALS.md` | ✅ Актуально | Credentials задокументированы |
| `docs/BACKLOG_NEXT.md` | ⚠️ Устарело | Нужно обновить приоритеты |

**Рекомендация:** Создать единый `docs/INDEX.md` с навигацией по всем документам.

---

## 📎 APPENDIX C: TELEGRAM API BEST PRACTICES

Ссылки на официальную документацию:

1. [Telegram Mini Apps](https://core.telegram.org/bots/webapps)
2. [WebApp initData](https://core.telegram.org/bots/webapps#webappinitdata)
3. [launch/start parameters](https://core.telegram.org/bots/webapps#initializing-mini-apps)
4. [menu button](https://core.telegram.org/bots/api#setchatmenubutton)
5. [keyboard button with web_app](https://core.telegram.org/bots/api#keyboardbutton)
6. [contact request button](https://core.telegram.org/bots/api#keyboardbutton#request_contact)
7. [deep links/startapp](https://core.telegram.org/bots/deep-linking)

**Key Takeaways:**

- `initData` действительна 24 часа
- `start_param` ≤64 bytes
- Menu button: только 1 на бота
- WebApp кнопки: только в private chats
- Contact request: требует подтверждения пользователем

---

**END OF REPORT**

*Generated: 2026-02-24*  
*Word Count: ~5500*  
*Lines: 953*
