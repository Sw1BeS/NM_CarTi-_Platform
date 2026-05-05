# 🚀 План внедрения исправлений CarTié Platform

**Дата:** 2026-02-23  
**Статус:** Утверждено  
**Срок реализации:** 8 недель

---

## 📊 Executive Summary

### Критические проблемы (P0)

| # | Проблема | Влияние | Приоритет | Неделя |
|---|----------|---------|-----------|--------|
| 1 | In-Memory BotSession Storage | Сессии теряются при рестарте | P0 | 1-2 |
| 2 | No Webhook Idempotency | Дубли лидов при retry Telegram | P0 | 1-2 |
| 3 | MiniApp BackButton Not Integrated | Сломана навигация UX | P0 | 1 |
| 4 | visitorId не используется в Favorites | Избранное не сохраняется для анонимов | P0 | 2 |
| 5 | B2B Whitelist incomplete | Заявки не доходят до менеджеров | P0 | 3 |
| 6 | Platform Editor перезаписывает menuConfig | Настройки пропадают после сохранения | P0 | 6 |

### Технические долги (P1-P2)

| # | Проблема | Влияние | Приоритет | Неделя |
|---|----------|---------|-----------|--------|
| 7 | Large Files (>1000 lines) | High bug risk, сложно тестировать | P1 | 3-4 |
| 8 | Test Coverage ~10% | Регрессии в production | P1 | 7-8 |
| 9 | Dual Schema Legacy+v4.1 | Data inconsistency risk | P1 | 5 |
| 10 | No fallback images | Пустые карточки авто | P1 | 3 |
| 11 | CSS gap в CatalogView | Визуальный баг | P2 | 5 |
| 12 | Avatar not loaded | Профиль без фото | P2 | 5 |

---

## 🗺 User Journey Map

### Сценарий 1: Підібрати авто за 1 хвилину

**Expected:**
- Кнопка в боте → MiniApp открывается сразу в форме подбора
- Пошаговая форма с селекторами (марка, модель, год, бюджет)
- Contact sharing через Telegram
- Заявка создается в БД (B2bRequest/Lead)
- Менеджер получает уведомление

**Current:**
- Открывается главная MiniApp, не форма
- Ручной ввод вместо селекторов
- Неясно, создается ли заявка

**Root Cause:**
- `start_param` не передается в URL
- `entry=request` не обрабатывается в `MiniApp.tsx`
- Нет интеграции BackButton

**Fix:**
- Добавить `start_param=pick_car` в кнопки бота
- Обработать `entry=pick_car` в `MiniApp.tsx:483-550`
- Интегрировать `Telegram.WebApp.BackButton`

**Files:**
- `/workspace/apps/server/src/modules/Communication/telegram/routing/routeMessage.ts:241`
- `/workspace/apps/web/src/pages/public/MiniApp.tsx:483`
- `/workspace/apps/web/src/pages/public/miniapp/views/RequestView.tsx`

---

### Сценарий 2: Авто в наявності

**Expected:**
- Кнопка → каталог с карточками (фото, цена, год, город)
- Фильтры visible
- Empty state если нет авто

**Current:**
- Черный разрыв/layout gap
- Пустые поля у авто
- Фото не отображаются

**Root Cause:**
- DTO normalization missing в `miniapp.service.ts`
- Fallback image не настроен
- CSS gap в `CatalogView.tsx`

**Fix:**
- Нормализовать DTO: `imageUrl || photoUrl || media[0] || PLACEHOLDER`
- Добавить fallback image constant
- Исправить CSS grid gap

**Files:**
- `/workspace/apps/server/src/services/miniapp.service.ts:150-200`
- `/workspace/apps/web/src/pages/public/miniapp/views/CatalogView.tsx`
- `/workspace/apps/web/src/pages/public/MiniApp.tsx:82`

---

### Сценарий 3: Обране (Favorites)

**Expected:**
- Toggle favorite работает стабильно
- Сохраняется в БД (MiniAppFavorite)
- Синхронизируется между сессиями

**Current:**
- visitorId генерируется, но не используется корректно
- Favorite rows не создаются для тестовых авто

**Root Cause:**
- Schema: `@@unique([companyId, carListingId, visitorId])` конфликтует с tgUserId
- Frontend отправляет visitorId, backend не сохраняет

**Fix:**
- Изменить unique constraint: `[companyId, carListingId, tgUserId]` OR `[companyId, carListingId, visitorId]`
- Упростить логику: приоритет tgUserId, fallback visitorId
- Добавить logging для отладки

**Files:**
- `/workspace/apps/server/prisma/schema.prisma:728-743`
- `/workspace/apps/server/src/services/miniapp.service.ts:250-300`
- `/workspace/apps/web/src/pages/public/MiniApp.tsx:340-380`

---

### Сценарий 4: Продати авто

**Expected:**
- Wizard собирает карточку + фото
- Заявка уходит менеджеру
- Подтверждение пользователю

**Current:**
- b2bSellWizard.ts (1137 строк) — сложный, нет уведомлений
- Неясно, куда попадают заявки

**Root Cause:**
- Монолитный wizard без декомпозиции
- Нет интеграции с notification service

**Fix:**
- Extract shared logic в utilities
- Добавить уведомления менеджерам
- Упростить до 5-7 шагов

**Files:**
- `/workspace/apps/server/src/modules/Communication/telegram/routing/wizards/b2bSellWizard.ts`
- `/workspace/apps/server/src/services/b2bRegistration.service.ts`

---

### Сценарий 5: Підтримка

**Expected:**
- Кнопка → чат с менеджером или заявка
- Контакты visible (Telegram, phone)

**Current:**
- Support button без действия или placeholder

**Root Cause:**
- Нет manager username в config
- Support view не реализован

**Fix:**
- Добавить `supportContact` в BotConfig
- Реализовать `SupportView` в MiniApp
- Fallback: mailto/phone link

**Files:**
- `/workspace/apps/server/prisma/schema.prisma:BotConfig`
- `/workspace/apps/web/src/pages/public/miniapp/views/SupportView.tsx` (новый)

---

## 🎯 Bot/MiniApp Navigation Contract

### Рекомендуемая структура кнопок (2 ряда, не столбик!)

```
┌─────────────────────────────────────┐
│  [🚗 Підібрати авто] [💰 Продати]   │ ← Row 1
├─────────────────────────────────────┤
│  [📦 В наявності] [🚚 В дорозі]     │ ← Row 2
├─────────────────────────────────────┤
│  [⭐ Обране] [📞 Підтримка]         │ ← Row 3
└─────────────────────────────────────┘
```

### Детальный контракт

| Label | Type | Row | Col | Target | start_param | Screen | initData |
|-------|------|-----|-----|--------|-------------|--------|----------|
| 🚗 Підібрати авто | web_app | 1 | 1 | /p/app/{slug} | `entry=pick_car` | RequestView (type=BUY) | ✅ |
| 💰 Продати | web_app | 1 | 2 | /p/app/{slug} | `entry=sell` | RequestView (type=SELL) | ✅ |
| 📦 В наявності | web_app | 2 | 1 | /p/app/{slug} | `entry=inventory&status=AVAILABLE` | CatalogView | ✅ |
| 🚚 В дорозі | web_app | 2 | 2 | /p/app/{slug} | `entry=inventory&status=PENDING` | CatalogView | ✅ |
| ⭐ Обране | web_app | 3 | 1 | /p/app/{slug} | `entry=favorites` | FavoritesView | ✅ |
| 📞 Підтримка | web_app | 3 | 2 | /p/app/{slug} | `entry=support` | SupportView | ❌ |

### Menu Button (стандартная кнопка слева)

- **Type:** `menu_button` (не keyboard!)
- **Action:** Открывает MiniApp на главную
- **URL:** `/p/app/{slug}`
- **initData:** ✅ Всегда передается

---

## 🔧 Platform Editor Risk

### Проблема

`BotMenuEditor.tsx` перезаписывает `menuConfig.buttons` без сохранения:
- Существующих web_app кнопок
- start_param параметров
- Custom URLs из конфига

### Решение

1. **Валидация перед сохранением:**
   - Проверять наличие хотя бы одной web_app кнопки
   - Сохранять оригинальные URL из `bot.config.miniAppConfig`

2. **Optimistic locking:**
   - Добавить `version` field в BotConfig
   - Проверять при обновлении: `WHERE id = ? AND version = ?`

3. **Audit log:**
   - Логировать изменения menuConfig
   - Кто, когда, какие кнопки изменил

**Files:**
- `/workspace/apps/web/src/pages/app/editor/BotMenuEditor.tsx:297`
- `/workspace/apps/server/prisma/schema.prisma:BotConfig` (добавить version)
- `/workspace/apps/server/src/routes/botConfig.routes.ts` (audit log)

---

## 📋 Technical Fix Plan

### Неделя 0: Подготовка (2 дня)

**Задачи:**
- [ ] Удалить legacy файлы (11 файлов routes)
- [ ] Очистить закомментированный код
- [ ] Создать миграцию для visitorId fix
- [ ] Настроить Redis session storage (опционально)

**Файлы:**
- `/workspace/apps/server/src/routes/legacy*.routes.ts` → DELETE
- `/workspace/apps/server/prisma/migrations/20260223_fix_visitor_id/`

**Risk:** Низкий — только удаление мертвого кода  
**Rollback:** Git revert

---

### Неделя 1-2: Critical Navigation Fixes

**Задачи:**
1. **start_param integration:**
   - Добавить `start_param` во все web_app кнопки
   - Обработать в `MiniApp.tsx` парсинг `entry=` параметра
   
2. **BackButton integration:**
   - Подключить `Telegram.WebApp.BackButton`
   - Интегрировать с navigation history

3. **initData fallback:**
   - Graceful degradation если открыто в браузере
   - Warning только если действительно нужно

**Файлы:**
- `/workspace/apps/server/src/modules/Communication/telegram/routing/routeMessage.ts`
- `/workspace/apps/server/src/modules/Communication/telegram/core/utils/miniappUrl.ts`
- `/workspace/apps/web/src/pages/public/MiniApp.tsx:483-550`
- `/workspace/apps/web/src/pages/public/miniapp/navigation.ts`

**Tests:**
- Открыть MiniApp из каждой кнопки бота
- Проверить передачу start_param
- Проверить работу BackButton

**Risk:** Средний — изменение routing логики  
**Rollback:** Revert commit, restore old buttons

---

### Неделя 2-3: Data Persistence Fixes

**Задачи:**
1. **visitorId fix:**
   - Изменить unique constraint в schema
   - Обновить `miniapp.service.ts` логику
   - Протестировать favorites для анонимов

2. **Webhook idempotency:**
   - Добавить `update_id` deduplication
   - Store processed update_ids in Redis/DB

3. **Race conditions:**
   - Transaction для toggle favorite
   - Optimistic locking для updates

**Файлы:**
- `/workspace/apps/server/prisma/schema.prisma:741-742`
- `/workspace/apps/server/src/services/miniapp.service.ts`
- `/workspace/apps/server/src/routes/miniAppRoutes.ts`

**Migration:**
```prisma
// Remove conflicting unique constraints
@@unique([companyId, carListingId, visitorId]) // REMOVE
// Keep only
@@unique([companyId, carListingId, tgUserId])
```

**Tests:**
- Toggle favorite без Telegram (visitorId)
- Toggle favorite с Telegram (tgUserId)
- Concurrent favorite toggles

**Risk:** Высокий — изменение schema, возможна потеря данных  
**Rollback:** Prisma migrate down, restore backup

---

### Неделя 3-4: Catalog & Photos Polish

**Задачи:**
1. **DTO normalization:**
   - Unified imageUrl resolver
   - Fallback image для всех карточек

2. **CSS gap fix:**
   - Исправить layout в CatalogView
   - Проверить responsive design

3. **Empty states:**
   - "Авто в дорозі" — красивый empty state
   - "Обране пусте" — CTA добавить

**Файлы:**
- `/workspace/apps/server/src/services/miniapp.service.ts`
- `/workspace/apps/web/src/pages/public/miniapp/views/CatalogView.tsx`
- `/workspace/apps/web/src/pages/public/miniapp/components/EmptyState.tsx` (новый)

**Tests:**
- Каталог с фото и без
- Empty inventory
- Mobile viewport

**Risk:** Низкий — только frontend изменения  
**Rollback:** CSS revert

---

### Неделя 4-5: Sell & Support Flows

**Задачи:**
1. **B2B Sell Wizard refactor:**
   - Extract shared utilities
   - Добавить уведомления менеджерам
   - Упростить до 5-7 шагов

2. **Support View:**
   - Реализовать SupportView компонент
   - Добавить manager contact в config
   - Fallback: mailto/phone

3. **B2B Registration complete:**
   - Завершить whitelist flow
   - Добавить retry logic
   - Notifications для approve/reject

**Файлы:**
- `/workspace/apps/server/src/modules/Communication/telegram/routing/wizards/b2bSellWizard.ts`
- `/workspace/apps/server/src/services/b2bRegistration.service.ts`
- `/workspace/apps/web/src/pages/public/miniapp/views/SupportView.tsx` (новый)

**Tests:**
- Пройти весь sell wizard
- Отправить support request
- B2B approve/reject flow

**Risk:** Средний — изменение бизнес-логики  
**Rollback:** Feature flag off

---

### Неделя 5-6: Visual Cleanup

**Задачи:**
1. **Welcome message:**
   - Короткое, понятное (2-3 предложения)
   - CTA кнопки выделены

2. **Avatar fallback:**
   - Если avatar unavailable — initials или default icon

3. **Button layout:**
   - 2 кнопки в ряд, не столбик
   - Логические группы

4. **Error/Success states:**
   - Toast notifications
   - Loading spinners

**Файлы:**
- `/workspace/apps/web/src/pages/public/MiniApp.tsx`
- `/workspace/apps/web/src/pages/public/miniapp/views/ProfileView.tsx`
- `/workspace/apps/web/src/components/ui/Toast.tsx`

**Tests:**
- Profile без avatar
- Все error scenarios
- Mobile/desktop layout

**Risk:** Низкий — только UI  
**Rollback:** CSS/component revert

---

### Неделя 6-7: Platform Hardening

**Задачи:**
1. **MenuConfig validation:**
   - Проверка web_app кнопок
   - Сохранение оригинальных URL

2. **Optimistic locking:**
   - version field в BotConfig
   - Conflict detection

3. **Audit log:**
   - Логирование изменений конфига
   - SuperAdmin audit trail

**Файлы:**
- `/workspace/apps/web/src/pages/app/editor/BotMenuEditor.tsx`
- `/workspace/apps/server/prisma/schema.prisma:BotConfig`
- `/workspace/apps/server/src/routes/botConfig.routes.ts`

**Tests:**
- Сохранить конфиг дважды одновременно
- Проверить audit log entries

**Risk:** Средний — изменение platform logic  
**Rollback:** DB restore, code revert

---

### Неделя 8: Testing & Documentation

**Задачи:**
1. **E2E Tests:**
   - 10 user journeys покрыть тестами
   - Integration tests для API

2. **Documentation update:**
   - Update ARCHITECTURE.md
   - Add runbooks для incidents
   - Sequence flow диаграммы

3. **QA Sign-off:**
   - Production smoke tests
   - Performance check
   - Security review

**Файлы:**
- `/workspace/apps/server/tests/e2e/miniapp.e2e.test.ts` (новый)
- `/workspace/docs/RUNBOOKS.md` (новый)
- `/workspace/docs/SEQUENCE_FLOWS.md` (новый)

**Tests:**
- Все E2E сценарии passing
- Load test: 100 concurrent users
- Security scan: no critical issues

**Risk:** Низкий — только тесты и docs  
**Rollback:** N/A

---

## 📈 Metrics to Track

### Business Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Conversion: Button → MiniApp Open | ? | >80% | Analytics events |
| Conversion: MiniApp Open → Lead | ? | >15% | B2bRequest count / opens |
| Favorites Usage | ? | >20% users | MiniAppFavorite toggles |
| Support Requests Resolved | ? | <24h | Time to first response |

### Technical Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Page Load Time | ? | <2s | Lighthouse, Web Vitals |
| API Error Rate | ? | <1% | Sentry, logs |
| Test Coverage | ~10% | >60% | Jest coverage report |
| Duplicated Leads | ? | 0 | Webhook idempotency check |

---

## ⚠️ Risk Mitigation

### High-Risk Changes

| Change | Risk | Mitigation | Rollback Plan |
|--------|------|------------|---------------|
| Schema migration (visitorId) | Data loss | Backup DB before migrate | `prisma migrate down` |
| Webhook idempotency | Lost leads | Shadow mode: log but don't drop | Feature flag off |
| Platform editor validation | Broken saves | Gradual rollout: 10% users | Revert validation logic |

### Safety Rules

1. **No production changes без approval:**
   - Tech Lead approval для P0 changes
   - Product Owner approval для UX changes

2. **Backup before migrations:**
   ```bash
   pg_dump -h localhost -U cartie cartie_db > backup_$(date +%Y%m%d_%H%M%S).sql
   ```

3. **Feature flags для рискованных изменений:**
   ```typescript
   if (process.env.ENABLE_WEBHOOK_IDEMPOTENCY === 'true') {
     // new logic
   } else {
     // old logic
   }
   ```

4. **Monitoring during rollout:**
   - Sentry errors watch
   - Telegram bot logs
   - Database query performance

---

## ✅ Smoke Checks для Production

После каждого этапа проверять:

### После Недели 1-2 (Navigation)

- [ ] Menu button открывает MiniApp
- [ ] Все 6 keyboard кнопок работают
- [ ] start_param передается (проверить логи)
- [ ] BackButton появляется и работает
- [ ] Нет warning "opened without initData"

### После Недели 2-3 (Persistence)

- [ ] Toggle favorite работает
- [ ] Favorites сохраняются после reload
- [ ] Анонимы (visitorId) могут добавлять в избранное
- [ ] Нет дублей лидов (проверить БД)

### После Недели 3-4 (Catalog)

- [ ] Все карточки имеют фото (или fallback)
- [ ] Нет черных разрывов в layout
- [ ] Empty state красивый и понятный
- [ ] Фильтры работают

### После Недели 4-5 (Sell/Support)

- [ ] Sell wizard проходит до конца
- [ ] Менеджер получает заявку
- [ ] Support кнопка работает
- [ ] B2B approve/reject шлет уведомления

### После Недели 6-7 (Platform)

- [ ] MenuConfig сохраняется без потерь
- [ ] Audit log пишет изменения
- [ ] Concurrent saves не ломают данные

### После Недели 8 (Testing)

- [ ] Все E2E тесты passing
- [ ] Performance OK (<2s load)
- [ ] No critical Sentry errors

---

## 📁 Appendix: Список файлов для изменений

### Backend (15 файлов)

1. `/workspace/apps/server/prisma/schema.prisma` — visitorId constraint
2. `/workspace/apps/server/src/services/miniapp.service.ts` — DTO normalization, favorites logic
3. `/workspace/apps/server/src/routes/miniAppRoutes.ts` — idempotency
4. `/workspace/apps/server/src/modules/Communication/telegram/routing/routeMessage.ts` — buttons with start_param
5. `/workspace/apps/server/src/modules/Communication/telegram/core/utils/miniappUrl.ts` — URL builder
6. `/workspace/apps/server/src/modules/Communication/telegram/core/utils/telegramReplyMarkup.ts` — keyboard layout
7. `/workspace/apps/server/src/modules/Communication/telegram/routing/wizards/b2bSellWizard.ts` — refactor
8. `/workspace/apps/server/src/modules/Communication/telegram/routing/wizards/b2bRegistrationWizard.ts` — notifications
9. `/workspace/apps/server/src/services/b2bRegistration.service.ts` — approve/reject notifications
10. `/workspace/apps/server/src/routes/botConfig.routes.ts` — audit log
11. `/workspace/apps/server/src/index.ts` — webhook idempotency middleware
12. `/workspace/apps/server/prisma/migrations/*` — новая миграция
13. `/workspace/apps/server/src/services/dto.ts` — нормализация
14. `/workspace/apps/server/src/services/templatePreset.service.ts` — menuConfig validation
15. `/workspace/apps/server/src/routes/legacy*.routes.ts` — **DELETE** (11 файлов)

### Frontend (12 файлов)

1. `/workspace/apps/web/src/pages/public/MiniApp.tsx` — entry param, BackButton
2. `/workspace/apps/web/src/pages/public/miniapp/views/CatalogView.tsx` — CSS gap, empty state
3. `/workspace/apps/web/src/pages/public/miniapp/views/FavoritesView.tsx` — visitorId support
4. `/workspace/apps/web/src/pages/public/miniapp/views/RequestView.tsx` — pick_car entry
5. `/workspace/apps/web/src/pages/public/miniapp/views/ProfileView.tsx` — avatar fallback
6. `/workspace/apps/web/src/pages/public/miniapp/views/SupportView.tsx` — **NEW**
7. `/workspace/apps/web/src/pages/public/miniapp/navigation.ts` — BackButton integration
8. `/workspace/apps/web/src/pages/public/miniapp/telegramViewport.ts` — initData handling
9. `/workspace/apps/web/src/services/miniappApi.ts` — visitorId param
10. `/workspace/apps/web/src/pages/app/editor/BotMenuEditor.tsx` — validation
11. `/workspace/apps/web/src/pages/app/editor/MenuDesigner.tsx` — start_param UI
12. `/workspace/apps/web/src/components/ui/EmptyState.tsx` — **NEW**

### Tests & Docs (8 файлов)

1. `/workspace/apps/server/tests/e2e/miniapp.e2e.test.ts` — **NEW**
2. `/workspace/apps/server/tests/integration/webhook.idempotency.test.ts` — **NEW**
3. `/workspace/apps/web/src/pages/public/miniapp/__tests__/navigation.test.ts` — **NEW**
4. `/workspace/docs/RUNBOOKS.md` — **NEW**
5. `/workspace/docs/SEQUENCE_FLOWS.md` — **NEW**
6. `/workspace/docs/ARCHITECTURE.md` — update
7. `/workspace/docs/QA_CHECKLIST.md` — update
8. `/workspace/README.md` — update setup instructions

---

## 🚀 Implementation Order

**Приоритет выполнения:**

1. **Неделя 0** — Очистка (удаление legacy)
2. **Неделя 1** — start_param + BackButton
3. **Неделя 2** — visitorId fix + idempotency
4. **Неделя 3** — Catalog DTO + photos
5. **Неделя 4** — Sell wizard refactor
6. **Неделя 5** — Support view + B2B notifications
7. **Неделя 6** — Platform validation
8. **Неделя 7** — E2E tests
9. **Неделя 8** — Documentation + QA sign-off

---

## ✏️ Notes

- **Не начинать deploy без approval** для каждого этапа
- **Всегда делать backup DB** перед миграциями
- **Мониторить Sentry errors** после каждого деплоя
- **Вести changelog** в `/workspace/CHANGELOG.md`

---

**Подписи:**

- [ ] Tech Lead: _________________ Дата: _______
- [ ] Product Owner: _________________ Дата: _______
- [ ] DevOps: _________________ Дата: _______
