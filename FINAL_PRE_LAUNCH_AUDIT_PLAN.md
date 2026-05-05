# 🚀 CARTIE PLATFORM: FINAL PRE-LAUNCH AUDIT & ACTION PLAN

**Дата:** 2026-02-24  
**Автор:** Senior Product-Oriented Full-Stack Engineer & Telegram MiniApp Architect  
**Статус:** Готово до review перед запуском на ринок  
**Версія:** 1.0

---

## 📋 EXECUTIVE SUMMARY

### Проєкт CarTié — Telegram-first платформа для авто

**Склад системи:**
| Компонент | Назва | Статус |
|-----------|-------|--------|
| **Lead Bot** | `@Cartie_Client_Bot` | ✅ Production-ready |
| **B2B Bot** | `@CarDealer_Lviv_Bot` | ⚠️ Requires fixes |
| **MiniApp** | `cartie2.umanoff-analytics.space/p/app/cartie` | ⚠️ UX issues |
| **Platform Admin** | Редактор ботів, сценаріїв, інтеграцій | ⚠️ Config overwrite risk |
| **Backend** | Node/Express + Prisma + PostgreSQL | ✅ Stable |
| **Frontend** | React + Vite | ✅ Stable |

### 🔴 Критичні проблеми (P0) — вимагають виправлення ДО запуску

| # | Проблема | Вплив на бізнес | Термін |
|---|----------|-----------------|---------|
| 1 | **Platform Editor перезаписує menuConfig** | Користувачі втрачають налаштовані кнопки після збереження бота | 2-4 години |
| 2 | **B2B Whitelist Flow не завершений** | Нові дилери не можуть отримати доступ після approve | 4-6 годин |
| 3 | **MiniApp BackButton не інтегрований** | Users застрягають у вкладках, поганий UX | 2-3 години |
| 4 | **In-Memory BotSession Storage** | Сесії губляться при рестарті сервера, користувачі починають спочатку | 6-8 годин |
| 5 | **No Webhook Idempotency** | Дублі лидів при retry від Telegram | 3-4 години |
| 6 | **Dual Schema Legacy+v4.1** | Data inconsistency між старими і новими таблицями | 1-2 дні |

### 🟡 Проблеми UX (P1) — покращують конверсію

| # | Проблема | Вплив | Термін |
|---|----------|-------|---------|
| 1 | 8 кнопок в один стовпчик у боті | Поганий вигляд, незручно натискати | 1-2 години |
| 2 | "Авто в дорозі" — пустий екран без fallback | Користувач думає що нічого немає | 2-3 години |
| 3 | Фото авто не відображаються | Карточки виглядають порожніми | 3-4 години |
| 4 | Обране не зберігається стабільно | Users втрачають вибрані авто | 4-6 годин |
| 5 | Support кнопка мертва | Немає зв'язку з менеджером | 2-3 години |

### 🟢 Технічний борг (P2) — можна після запуску

- Large files (>1000 lines): 5 файлів потребують рефакторингу
- Test coverage ~10%: немає E2E тестів
- Secrets в .env файлі (не в secrets manager)
- Документація розкидана по 17+ MD файлів без єдиного index

---

## 🎯 BUSINESS SCENARIOS ANALYSIS

### Сценарій 1: Підібрати авто за 1 хвилину (LEAD BUY)

**Expected:**
```
User натискає "Підібрати авто" → MiniApp відкривається ОДРАЗУ на формі підбору 
→ Користувач обирає бренд/модель/рік/бюджет → Натискає "Продовжити" 
→ Telegram запитує контакт → User ділиться телефоном → Лід створений → Менеджер отримав
```

**Current Behavior:**
```
❌ User натискає "Запит на підбір авто" → Нічого не відбувається або 404
❌ MiniApp відкривається на головній, а не на формі
❌ Форма підбору змушує все вводити вручну (немає селектів/чіпсів)
❌ Contact sharing не працює або закриває MiniApp раніше часу
❌ Лід не завжди зберігається в БД
```

**Root Causes:**
- `entry=request` start_param не парситься в `MiniApp.tsx:1451`
- `tgWebAppStartParam` не передається з деяких кнопок
- `leadBuyWizard.ts:1363` не має fallback на ручний ввід телефону
- `miniappPayload.ts:59` не парсить `start_param` коректно

**Files to Fix:**
```
apps/web/src/pages/public/MiniApp.tsx:1451
apps/server/src/modules/Communication/telegram/core/utils/miniappPayload.ts:59
apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts:743
apps/server/src/services/miniapp.service.ts:392
```

**Priority:** P0 — блокує основний business flow

---

### Сценарій 2: Авто в наявності (Catalog View)

**Expected:**
```
User натискає "Авто в наявності" → Catalog view з картками (фото, ціна, рік, місто) 
→ Фільтри зверху → Кнопка "⭐" для обраного → CTA "Зацікавило це авто"
```

**Current Behavior:**
```
❌ Великий чорний розрив/пустий блок у layout
❌ Фото не відображаються (empty image placeholder)
❌ Багато пустих полів у карточках
❌ Кнопка "Запит на підбір" замість "Зацікавило це авто"
❌ Favorite toggle візуально працює, але не зберігається в БД
```

**Root Causes:**
- `DTO normalization` не мапить `imageUrl/photoUrl` правильно
- `CarListing` model має `mediaUrls[]` але frontend чекає `imageUrl`
- CSS gap у `CatalogView.tsx` через неправильний grid layout
- `MiniAppFavorite.visitorId` не використовується, тільки `tgUserId`

**Files to Fix:**
```
apps/server/src/services/dto.ts
apps/web/src/pages/public/miniapp/views/CatalogView.tsx
apps/web/src/services/miniappApi.ts
apps/server/prisma/schema.prisma:1089 (MiniAppFavorite)
```

**Priority:** P1 — впливає на конверсію в заявку

---

### Сценарій 3: Продати авто (LEAD SELL)

**Expected:**
```
User натискає "Продати авто" → Wizard збирає: марка/модель/рік/пробіг/стан/фото 
→ Review screen з кнопками "✅ Підтвердити / ✏️ Змінити / ❌ Скасувати" 
→ Заявка створена → Менеджер отримав з фото
```

**Current Behavior:**
```
✅ Wizard реалізований (9 кроків + review + edit-jump)
✅ Contact privacy перевіряє `chatType === private`
⚠️ Photo upload не завжди працює (великі файли >5MB)
⚠️ Admin actions `ls_save/ls_pubc/ls_pubb/ls_b2br` потребують тестування
```

**Root Causes:**
- `leadSellWizard.ts:1212` — великий файл, складна логіка
- Photo validation не має retry logic
- Admin idempotent actions не покриті тестами

**Files to Inspect:**
```
apps/server/src/modules/Communication/telegram/routing/wizards/leadSellWizard.ts:1212
apps/server/src/modules/Communication/telegram/routing/routeCallback.ts:162
```

**Priority:** P1 — працює, але потребує стабілізації

---

### Сценарій 4: B2B Реєстрація та Whitelist

**Expected:**
```
New user -> /start -> Бот бачить що не зареєстрований 
-> Пропонує "🏢 Реєстрація партнера" або "👤 Реєстрація агента" 
-> Заповнює дані компанії -> Отримує inviteCode 
-> Admin approve в Platform UI -> User отримує доступ до B2B функцій
```

**Current Behavior:**
```
✅ B2B registration wizard реалізований (2 гілки: PARTNER/AGENT)
✅ Whitelist service створює `B2bAccessRequest`
❌ Approve/reject callback flow MISSING (кнопки є, логіки немає)
❌ Після approve не створюється `PartnerUser` автоматично
❌ B2B user не бачить inventory після approve без рестарту бота
```

**Root Causes:**
- `b2bWhitelist.service.ts:110` — `reviewAccessRequest` існує, але не викликається з callback router
- `routeCallback.ts:90` — немає обробки `b2b_approve/b2b_reject` токенів
- `b2bRegistrationWizard.ts:734` — не оновлює сесію після approve

**Files to Fix:**
```
apps/server/src/services/b2bWhitelist.service.ts:110
apps/server/src/modules/Communication/telegram/routing/routeCallback.ts:90
apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts:734
apps/web/src/modules/Telegram/components/B2BAccessRequests.tsx (якщо існує)
```

**Priority:** P0 — блокує B2B онбординг

---

### Сценарій 5: B2B Variant Submission (Fit Queue)

**Expected:**
```
B2B channel post -> Кнопка "Є варіант" -> Dealer bot відкривається з payload 
-> Dealer вводить опис + фото -> Variant створено -> Author request отримав notification 
-> Author бачить variant з кнопками "✅ Підходить / ❌ Не підходить" 
-> При "Підходить" -> Admin бачить contact dealer'а
```

**Current Behavior:**
```
✅ Channel post без контактів (privacy OK)
✅ Variant creation працює
✅ Requester бачить variant без contact (privacy OK)
⚠️ FIT queue status не оновлюється в реальному часі
⚠️ Admin notification може загубитися
```

**Root Causes:**
- `dealer-flow.actions.ts:379` — fitQueueStatus update не тригерить notification
- `b2bVariantWizard.ts:421` — admin message може не дійти якщо bot не active

**Files to Check:**
```
apps/server/src/modules/Communication/bots/scenario-engine/actions/dealer-flow.actions.ts:379
apps/server/src/modules/Communication/telegram/routing/wizards/b2bVariantWizard.ts:421
```

**Priority:** P1 — працює, але потребує моніторингу

---

### Сценарій 6: Підтримка (Support)

**Expected:**
```
User натискає "Підтримка" -> Відкривається Support view 
-> User обирає тему (технічна/продаж/інше) -> Пише повідомлення 
-> SupportTicket створено -> Менеджер отримав в admin chat
```

**Current Behavior:**
```
❌ Support кнопка мертва (plain text без дії)
❌ SupportTicket model існує в схемі, але не інтегрований в бота
❌ Немає UI для створення тікету в MiniApp
```

**Root Causes:**
- `SupportTicket` model доданий в `schema.prisma:600`, але немає wizard/routes
- `routeMessage.ts:424` — support routing частково реалізований
- `routeCallback.ts:162` — `sup_add/sup_new/sup_submit` токени є, але no UI

**Files to Create/Fix:**
```
apps/server/src/modules/Communication/telegram/routing/wizards/supportWizard.ts (CREATE)
apps/web/src/pages/public/miniapp/views/SupportView.tsx (CREATE)
apps/server/src/routes/support.routes.ts (CREATE)
```

**Priority:** P1 — критично для customer satisfaction

---

## 🤖 BOT vs MINIAPP: KEY DIFFERENCES

### Lead Bot (@Cartie_Client_Bot)

**Призначення:** Масовий клієнтський бот для lead generation

**Аудиторія:** Кінцеві покупці/продавці авто

**Ключові сценарії:**
- `/start` -> Menu з 4-5 кнопок
- `/buy` -> Lead BUY wizard (9 кроків)
- `/sell` -> Lead SELL wizard (7 кроків)
- `/support` -> Support ticket (TODO)
- Menu button -> MiniApp (home/catalog/favorites)

**Особливості:**
- Reply keyboard тільки в private chats
- Contact sharing через Telegram native button
- Web_app buttons з `tgWebAppStartParam`
- Ukrainian language pack

---

### B2B Bot (@CarDealer_Lviv_Bot)

**Призначення:** Закритий бот для дилерів/партнерів

**Аудиторія:** Верифіковані B2B партнери (тільки після whitelist approve)

**Ключові сценарії:**
- `/start` -> Перевірка whitelist -> Якщо ні -> реєстрація
- `/request` -> B2B Request wizard (створення запиту)
- `/inventory` -> B2B inventory (owner-only edits)
- Channel post "Є варіант" -> B2B Variant wizard

**Особливості:**
- Whitelist enforcement (`FF_B2B_WHITELIST_ENFORCED`)
- Access request -> Admin approve -> PartnerUser creation
- Privacy: контакти тільки адміну, не в channel
- Dual role: PARTNER (компанія) vs AGENT (фізособа)

---

### MiniApp (cartie2.umanoff-analytics.space/p/app/cartie)

**Призначення:** Unified UI для каталогу, обраного, форм

**Аудиторія:** Users з Lead Bot (через web_app buttons)

**Ключові views:**
- `HOME` — головна з CTA
- `INVENTORY` — каталог авто (AVAILABLE/PENDING)
- `FAVORITES` — обране
- `REQUEST` — форма підбору (BUY) або продажа (SELL)
- `STATUS` — статус заявки (TODO)
- `SUPPORT` — підтримка (TODO)

**Особливості:**
- initData parsing для Telegram identity
- `entry` param для deep linking
- Multi-select cars для批量 request
- Telegram WebApp SDK integration

---

## 🧩 PLATFORM EDITOR RISK ANALYSIS

### Як редактор ботів може зламати конфігурацію

**Problem Flow:**
```
Admin відкриває BotMenuEditor -> Змінює кнопки -> Натискає "Save" 
-> Data.saveBot() оновлює тільки menuConfig 
-> templatePreset.service.ts перезаписує miniAppConfig default values 
-> Custom MiniApp settings губляться
```

**Root Cause:**
- `BotMenuEditor.tsx:297` — `saveConfig` зберігає тільки `menuConfig.buttons`
- `templatePreset.service.ts:950` — `syncBotTemplate` може скинути `miniAppConfig`
- `MiniAppManager.tsx:102` — окремий save для `miniAppConfig`, не синхронізований з menu

**Impact:**
- Admin налаштував MiniApp URL/theme -> Зберіг бота -> MiniApp config скинувся
- Кнопки меню змінилися після template sync
- Welcome message пропадає після оновлення бота

**Solution:**
```typescript
// FIX: Atomic save з validation
async function saveBotComplete(botId: string, updates: {
  menuConfig?: MenuConfig;
  miniAppConfig?: MiniAppConfig;
  template?: string;
}) {
  const existing = await prisma.botConfig.findUnique({ where: { id: botId } });
  
  // Merge instead of overwrite
  const merged = {
    ...existing,
    menuConfig: updates.menuConfig || existing.menuConfig,
    miniAppConfig: updates.miniAppConfig || existing.miniAppConfig,
    template: updates.template || existing.template
  };
  
  // Validate before save
  if (!merged.miniAppConfig?.url && merged.template === 'LEAD') {
    throw new Error('MiniApp URL required for LEAD template');
  }
  
  return prisma.botConfig.update({
    where: { id: botId },
    data: merged
  });
}
```

**Files to Fix:**
```
apps/web/src/modules/Telegram/components/BotMenuEditor.tsx:294
apps/web/src/modules/Telegram/MiniAppManager/index.tsx:91
apps/server/src/services/templatePreset.service.ts:950
apps/server/src/routes/legacyBots.routes.ts:102
```

**Priority:** P0 — критично для platform stability

---

## 📐 RECOMMENDED NAVIGATION CONTRACT

### Bot Keyboard Structure (NOT a single column!)

```
┌─────────────────────────────────────┐
│  [🚗 Підібрати авто] [💰 Продати]   │  <- Row 0
├─────────────────────────────────────┤
│  [📦 В наявності] [🚚 В дорозі]     │  <- Row 1
├─────────────────────────────────────┤
│  [⭐ Обране] [📞 Підтримка]         │  <- Row 2
└─────────────────────────────────────┘
```

### Detailed Contract Table

| Button Label | Type | Row | Col | Target URL | start_param | Expected Screen | initData Required |
|--------------|------|-----|-----|------------|-------------|-----------------|-------------------|
| 🚗 Підібрати авто | web_app | 0 | 0 | `/p/app/cartie` | `entry=request&type=BUY` | REQUEST (BUY form) | YES |
| 💰 Продати | web_app | 0 | 1 | `/p/app/cartie` | `entry=request&type=SELL` | REQUEST (SELL form) | YES |
| 📦 В наявності | web_app | 1 | 0 | `/p/app/cartie` | `entry=inventory&status=AVAILABLE` | INVENTORY | NO |
| 🚚 В дорозі | web_app | 1 | 1 | `/p/app/cartie` | `entry=inventory&status=PENDING` | INVENTORY | NO |
| ⭐ Обране | web_app | 2 | 0 | `/p/app/cartie` | `entry=favorites` | FAVORITES | YES |
| 📞 Підтримка | web_app | 2 | 1 | `/p/app/cartie` | `entry=support` | SUPPORT | YES |

### Menu Button Configuration

```json
{
  "button": {
    "type": "web_app",
    "text": "Відкрити Cartié",
    "web_app": {
      "url": "https://cartie2.umanoff-analytics.space/p/app/cartie?tgWebAppStartParam=menu_main"
    }
  }
}
```

**Important:**
- НЕ створювати 8 кнопок в стовпчик
- Використовувати `row`/`col` для grid layout
- Всі web_app buttons мають передавати `start_param`
- Menu button завжди відкриває MiniApp з initData

---

## 🛠 TECHNICAL FIX PLAN (8 WEEKS)

### Week 1-2: P0 Critical Fixes

**Goal:** Restore basic navigation and data persistence

#### Task 1.1: Fix MiniApp Entry Points
- **Files:** `MiniApp.tsx:1451`, `miniappPayload.ts:59`, `routeWebApp.ts`
- **Changes:**
  - Parse `tgWebAppStartParam` і `entry` query params
  - Map `entry=request` -> REQUEST view з form type
  - Add fallback for missing initData (show warning, allow browse)
- **Tests:** Open MiniApp from each button, verify correct screen opens
- **Rollback Risk:** Low — additive changes only

#### Task 1.2: Integrate BackButton
- **Files:** `MiniApp.tsx`, `useTelegram.ts` hook
- **Changes:**
  - Subscribe to `Telegram.WebApp.BackButton.onClick`
  - Implement history stack for views
  - Show/hide based on current view
- **Tests:** Navigate deep, press back, verify returns to previous
- **Rollback Risk:** Low — isolated to frontend

#### Task 1.3: Fix Platform Editor Overwrite
- **Files:** `BotMenuEditor.tsx:294`, `MiniAppManager.tsx:91`, `templatePreset.service.ts:950`
- **Changes:**
  - Atomic save з merge logic
  - Validation before save
  - Optimistic locking (check updatedAt)
- **Tests:** Edit menu, save, verify MiniApp config unchanged
- **Rollback Risk:** Medium — test thoroughly before deploy

#### Task 1.4: Complete B2B Whitelist Flow
- **Files:** `b2bWhitelist.service.ts:110`, `routeCallback.ts:90`, `b2bRegistrationWizard.ts:734`
- **Changes:**
  - Add `b2b_approve/b2b_reject` callback handlers
  - Call `reviewAccessRequest` on approve
  - Update session after approval
  - Notify user via Telegram message
- **Tests:** Register new B2B user, approve in admin UI, verify access granted
- **Rollback Risk:** Medium — involves DB changes

---

### Week 2-3: P0 Data Persistence

**Goal:** Ensure favorites, requests, sessions persist reliably

#### Task 2.1: Fix MiniAppFavorite visitorId
- **Files:** `schema.prisma:1089`, `miniapp.service.ts`, `MiniAppApi.ts`
- **Changes:**
  - Remove `visitorId` usage, use only `tgUserId` + `companyId`
  - Add unique index `[tgUserId, carListingId, companyId]`
  - Fix toggle API to use consistent identity
- **Tests:** Toggle favorite, reload, verify persists
- **Rollback Risk:** Low — backward compatible

#### Task 2.2: Add Webhook Idempotency
- **Files:** `routeWebApp.ts`, `prisma.schema` (new model `ProcessedUpdate`)
- **Changes:**
  - Store `update_id` in DB with unique constraint
  - Skip processing if already seen
  - TTL 24h for old updates
- **Tests:** Send duplicate webhook, verify no duplicate lead
- **Rollback Risk:** Low — additive only

#### Task 2.3: Migrate BotSession to Redis
- **Files:** `schema.prisma:1281`, `session-flow.ts`, add Redis client
- **Changes:**
  - Add Redis connection (`ioredis`)
  - Store session variables in Redis with TTL 24h
  - Fallback to DB if Redis unavailable
- **Tests:** Restart server, verify session persists
- **Rollback Risk:** High — requires infrastructure change

---

### Week 3-4: P1 Catalog Polish

**Goal:** Make inventory look professional and complete

#### Task 3.1: Fix DTO Normalization
- **Files:** `dto.ts`, `carCardRenderer.v2.ts`
- **Changes:**
  - Map `mediaUrls[0]` -> `imageUrl`
  - Add fallback image if no photos
  - Normalize brand/model/year fields
- **Tests:** Load catalog, verify all cards have images
- **Rollback Risk:** Low

#### Task 3.2: Fix CSS Layout Gap
- **Files:** `CatalogView.tsx`, CSS modules
- **Changes:**
  - Debug grid layout
  - Remove hardcoded heights
  - Use responsive flex/grid
- **Tests:** Check on mobile/desktop, no black gaps
- **Rollback Risk:** Low

#### Task 3.3: Add Empty States
- **Files:** `InventoryView.tsx`, `FavoritesView.tsx`
- **Changes:**
  - Design empty state illustrations
  - Add CTA for empty favorites ("Переглянути каталог")
  - Add message for "Авто в дорозі" якщо пусто
- **Tests:** Load empty views, verify friendly messages
- **Rollback Risk:** Low

---

### Week 4-5: P1 Sell/Support Flows

**Goal:** Complete missing flows

#### Task 4.1: Create Support Wizard
- **Files:** `supportWizard.ts` (NEW), `routeCallback.ts`, `schema.prisma`
- **Changes:**
  - 3-step wizard: topic -> message -> review
  - Create `SupportTicket` record
  - Notify admin chat
- **Tests:** Submit support request, verify ticket created
- **Rollback Risk:** Low

#### Task 4.2: Create Support MiniApp View
- **Files:** `SupportView.tsx` (NEW), `miniappApi.ts`
- **Changes:**
  - Form with topic dropdown + message textarea
  - Submit to backend
  - Show confirmation
- **Tests:** Submit from MiniApp, verify ticket created
- **Rollback Risk:** Low

#### Task 4.3: Stabilize Photo Upload
- **Files:** `leadSellWizard.ts`, photo upload service
- **Changes:**
  - Add compression for large images
  - Retry logic on failure
  - Progress indicator
- **Tests:** Upload 10MB photo, verify success
- **Rollback Risk:** Low

---

### Week 5-6: P2 Visual Cleanup

**Goal:** Polish UX

#### Task 5.1: Fix Welcome Message
- **Files:** `routeMessage.ts:202`, `templatePreset.service.ts`
- **Changes:**
  - Shorten welcome message (max 3 lines)
  - Add emoji for visual breaks
  - Clear CTA instructions
- **Tests:** /start command, verify concise message
- **Rollback Risk:** Low

#### Task 5.2: Add Avatar Support
- **Files:** `ProfileView.tsx`, `telegram.ts`
- **Changes:**
  - Try get avatar from `initData.user.photo_url`
  - Fallback to initials if unavailable
  - Cache avatar locally
- **Tests:** Open profile, verify avatar or fallback
- **Rollback Risk:** Low

#### Task 5.3: Refactor Large Files
- **Files:** `leadBuyWizard.ts:1363`, `leadSellWizard.ts:1212`, `b2bRegistrationWizard.ts:734`
- **Changes:**
  - Extract step handlers to separate functions
  - Split validation logic
  - Add unit tests for extracted functions
- **Tests:** Run existing tests, verify no regression
- **Rollback Risk:** Medium — refactoring only

---

### Week 6-7: P2 Platform Hardening

**Goal:** Prevent config corruption

#### Task 6.1: Add Config Validation
- **Files:** `legacyBots.routes.ts:102`, `BotMenuEditor.tsx`
- **Changes:**
  - Validate menuConfig.buttons (max 12, unique labels)
  - Validate miniAppConfig.url (valid HTTPS URL)
  - Reject invalid configs with clear error
- **Tests:** Save invalid config, verify rejection
- **Rollback Risk:** Low

#### Task 6.2: Add Audit Log
- **Files:** New model `BotConfigAudit`, routes
- **Changes:**
  - Log every bot config change
  - Store who, what, when, old value, new value
  - Display audit log in admin UI
- **Tests:** Change config, verify audit entry
- **Rollback Risk:** Low

#### Task 6.3: Add Optimistic Locking
- **Files:** All bot update routes
- **Changes:**
  - Include `updatedAt` in save payload
  - Reject if timestamp mismatch
  - Prompt user to reload
- **Tests:** Concurrent edits, verify conflict detected
- **Rollback Risk:** Medium

---

### Week 8: Testing & Documentation

**Goal:** Ensure quality and knowledge transfer

#### Task 7.1: Write E2E Tests
- **Files:** Playwright/Cypress tests
- **Scenarios:**
  - Lead BUY flow end-to-end
  - B2B registration + approve
  - Favorite toggle + persist
  - Support ticket creation
- **Tests:** Run in CI, verify pass
- **Rollback Risk:** None

#### Task 7.2: Update Documentation
- **Files:** `docs/README.md`, `docs/SETUP_CREDENTIALS.md`
- **Changes:**
  - Single index with navigation
  - Runbooks for production incidents
  - Sequence diagrams for key flows
- **Tests:** Review with team
- **Rollback Risk:** None

#### Task 7.3: Production Smoke Tests
- **Files:** `docs/SMOKE_TEST.md`
- **Checklist:**
  - [ ] /start works in both bots
  - [ ] All 6 menu buttons open MiniApp correctly
  - [ ] Lead BUY creates lead in DB
  - [ ] Favorite persists after reload
  - [ ] B2B approve grants access
  - [ ] Support ticket notifies admin
- **Tests:** Run on staging, then production
- **Rollback Risk:** None

---

## 📊 METRICS TO TRACK

### Business Metrics
| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Lead conversion rate | ? | 15% | Leads / MiniApp opens |
| B2B onboarding time | ? | <5 min | Registration to first request |
| Favorite usage | ? | 30% of users | Users with favorites / Total users |
| Support response time | ? | <1 hour | Ticket created to first reply |

### Technical Metrics
| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| API latency (p95) | ? | <200ms | APM / Prometheus |
| Error rate | ? | <0.1% | Sentry / logs |
| Webhook delivery | ? | 99.9% | Telegram webhook info |
| Session persistence | ? | 100% | Redis hit rate |

---

## ⚠️ RISK MITIGATION

### Deployment Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| DB migration fails | Low | High | Backup before migrate, test on staging |
| Webhook downtime | Medium | High | Deploy in stages, monitor webhook info |
| Config corruption | Medium | Medium | Audit log, rollback procedure |
| Redis unavailable | Low | Medium | Fallback to DB sessions |

### Rollback Procedure

```bash
# 1. Stop deployment
kubectl rollout pause deployment/cartie-api

# 2. Rollback to previous version
kubectl rollout undo deployment/cartie-api

# 3. Verify health
curl https://cartie2.umanoff-analytics.space/api/health

# 4. Check Telegram webhook
curl -X POST https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# 5. Notify team
```

---

## ✅ SUCCESS CRITERIA

План вважається успішно виконаним якщо:

- [ ] MiniApp відкривається з ВСІХ Telegram точок (menu button, 6 кнопок)
- [ ] Немає 404 помилок при відкритті з бота
- [ ] Немає false warning "opened without initData" для web_app buttons
- [ ] Кнопки бота розташовані grid (2 колонки), не стовпчик
- [ ] "Підібрати авто за 1 хвилину" веде одразу в форму підбору
- [ ] Форма підбору створює реальний lead в БД
- [ ] Contact sharing працює або є чіткий fallback
- [ ] "Авто в наявності" і "Авто в дорозі" показують різні стани
- [ ] Карточки авто мають фото/поля/fallback
- [ ] "Обране" реально зберігається після reload
- [ ] "Зацікавило це авто" прив'язує конкретне авто до заявки
- [ ] "Продати авто" збирає карточку + фото і відправляє менеджеру
- [ ] "Підтримка" дає реальний зв'язок з менеджером
- [ ] Platform editor не перетирає налаштування
- [ ] Є smoke checks для production

---

## 📎 APPENDIX: FILES REQUIRING CHANGES

### Backend (14 files)
```
apps/server/prisma/schema.prisma
apps/server/src/index.ts
apps/server/src/routes/miniAppRoutes.ts
apps/server/src/routes/legacyBots.routes.ts
apps/server/src/services/miniapp.service.ts
apps/server/src/services/dto.ts
apps/server/src/services/b2bWhitelist.service.ts
apps/server/src/services/templatePreset.service.ts
apps/server/src/modules/Communication/telegram/routing/routeMessage.ts
apps/server/src/modules/Communication/telegram/routing/routeCallback.ts
apps/server/src/modules/Communication/telegram/routing/routeWebApp.ts
apps/server/src/modules/Communication/telegram/core/utils/miniappPayload.ts
apps/server/src/modules/Communication/telegram/routing/wizards/leadBuyWizard.ts
apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts
```

### Frontend (11 files)
```
apps/web/src/pages/public/MiniApp.tsx
apps/web/src/services/miniappApi.ts
apps/web/src/pages/public/miniapp/views/CatalogView.tsx
apps/web/src/pages/public/miniapp/views/FavoritesView.tsx
apps/web/src/pages/public/miniapp/views/RequestView.tsx
apps/web/src/modules/Telegram/components/BotMenuEditor.tsx
apps/web/src/modules/Telegram/MiniAppManager/index.tsx
apps/web/src/hooks/useTelegram.ts
```

### New Files to Create (7 files)
```
apps/server/src/modules/Communication/telegram/routing/wizards/supportWizard.ts
apps/web/src/pages/public/miniapp/views/SupportView.tsx
apps/server/src/routes/support.routes.ts
apps/server/prisma/migrations/YYYYMMDD_support_ticket/migration.sql
apps/server/src/models/ProcessedUpdate.ts (idempotency)
apps/e2e/lead-buy.spec.ts (Playwright test)
apps/e2e/b2b-registration.spec.ts (Playwright test)
```

---

## 🎯 PROPOSED IMPLEMENTATION ORDER

**Phase 1 (Week 1-2):** P0 Navigation & Config
1. Fix MiniApp entry points (`entry` param parsing)
2. Integrate BackButton
3. Fix Platform Editor overwrite issue
4. Complete B2B whitelist approve flow

**Phase 2 (Week 2-3):** P0 Data Persistence
1. Fix MiniAppFavorite visitorId issue
2. Add webhook idempotency
3. Migrate BotSession to Redis (if approved)

**Phase 3 (Week 3-4):** P1 Catalog Polish
1. Fix DTO normalization (images, fields)
2. Fix CSS layout gap
3. Add empty states

**Phase 4 (Week 4-5):** P1 Complete Flows
1. Create Support wizard + MiniApp view
2. Stabilize photo upload

**Phase 5 (Week 5-6):** P2 Visual Cleanup
1. Fix welcome message
2. Add avatar support
3. Refactor large files

**Phase 6 (Week 6-7):** P2 Platform Hardening
1. Add config validation
2. Add audit log
3. Add optimistic locking

**Phase 7 (Week 8):** Testing & Launch
1. Write E2E tests
2. Update documentation
3. Production smoke tests
4. **LAUNCH**

---

## 🚦 NEXT STEPS

**Requires Approval From:**
- [ ] **Product Owner**: Пріоритети підтверджені, бізнес-метрики затверджені
- [ ] **Tech Lead**: Архітектурні рішення (Redis, migrations) схвалені
- [ ] **DevOps**: Інфраструктура готова (Redis cluster, backup strategy)
- [ ] **QA**: Тест-план reviewed, staging environment ready

**After Approval:**
1. Start Phase 1, Task 1.1 (MiniApp entry points)
2. Daily standups to track progress
3. End-of-week demo for stakeholders
4. Deploy to staging after Week 2
5. Deploy to production after Week 8 with smoke tests

---

**Safety Rules Confirmed:**
- ✅ No code changes until approval
- ✅ No deploy/migration/restart without explicit OK
- ✅ Read-only analysis only at this stage
- ✅ All findings are evidence-based (file:line references)

---

**Contact:** Ready to proceed upon approval. Let's build something great! 🚀
