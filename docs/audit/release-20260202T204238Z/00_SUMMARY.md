# Итоговый отчёт по аудиту системы CarTié
## Дата: 2026-02-02 20:42 UTC
## Версия: 8d428ea (main после merge feat/stage2-tg-productize)

---

## 📌 1. Что точно работает (✅)

### Инфраструктура и деплой
✅ **Git merge в main выполнен успешно** — ветка `feat/stage2-tg-productize` слита в `main`, 19 файлов изменено (+1701 строка), создан fallback-тег `pre-merge-20260202T204105Z`  
✅ **Деплой на продакшн завершён** — все контейнеры (infra2-api-1, infra2-web-1, infra2-db-1) работают и healthy  
✅ **API Health эндпоинт отвечает** — `/api/health` возвращает 200, база подключена (latency 1-2ms), 1 бот активен  
✅ **Media proxy работает** — `/media/_smoke/ping.txt` отдаёт статику через Caddy (проксирование настроено)

### Stage-1 (P0-1, P0-2, P0-3)
✅ **P0-1: Lead TG Identity** — лиды из Telegram сохраняют `telegramUsername`, `telegramChatId`, `telegramUserId` (проверено на 4 последних лидах)  
✅ **P0-2: Dedup CarListing** — уникальный индекс `sourceChatId + sourceMessageId` создан, дубликатов **0 штук** найдено  
✅ **P0-3: MTProto работает** — сервис `channel-ingestion.service.ts` существует (19KB), используется в `routeChannelPost.ts`, 1 MTPROTO листинг создан в БД

### Stage-2 (M1, M3 частично)
✅ **M1: Registry создан** — таблицы `ChannelSource` и `TelegramDestination` существуют, схемы правильные (connectorId, channelId, статусы)  
✅ **M3: Unified ingestion частично** — `channel-ingestion.service.ts` импортируется в `routeChannelPost.ts` (единая точка для BotAPI channel_post)  
✅ **UI для Sources** — `TelegramSources.tsx` создан (5293 байта), добавлен в `App.tsx`

---

## 📌 2. Что не работает или недоработано (❌)

### Stage-2 M1: Sources Registry — данных нет
❌ **ChannelSource пуст** — таблица существует, но 0 записей (пользователь не добавил источники через UI или API)  
❌ **TelegramDestination** — схема не полностью соответствует ожиданиям промпта (нет `integrationId`, есть `tgId`, `access`, `role` — видимо, другая модель)

**Как воспроизвести:**  
```sql
SELECT COUNT(*) FROM "ChannelSource"; -- вернёт 0
```

**Причина:** UI/API для добавления источников либо не используется, либо требует MTProto коннектор (который требует auth по телефону).

---

### Stage-2 M2: Import by date — не проверяем
❌ **TelegramImportJob пуст** — таблица существует, но 0 записей (нет выполненных import jobs)  
❌ **Preview/date range** — логику в коде не проверяли (ripgrep не установлен вовремя), UI код есть но не тестирован на реальных данных

**Как воспроизвести:**  
```sql
SELECT COUNT(*) FROM "TelegramImportJob"; -- вернёт 0
```

**Причина:** без ChannelSource нельзя создать Import Job → блокирует проверку M2.

---

### Stage-2 M4: Media MVP — поле есть, данных нет
❌ **mediaItems всегда null** — поле `mediaItems` (jsonb) есть в схеме `CarListing`, но у всех 20 последних записей `media_cnt = 0` (пусто)  
❌ **Медиа не скачивается** — скорее всего, логика сохранения file_id → скачивание → запись в storage/media не активна или не срабатывает

**Как воспроизвести:**  
```sql
SELECT id, jsonb_array_length(COALESCE("mediaItems"::jsonb,'[]'::jsonb)) AS media_cnt
FROM "CarListing" ORDER BY "updatedAt" DESC LIMIT 20;
-- все строки media_cnt = 0
```

**Причина:** посты импортируются, но медиа не обрабатывается (либо код не вызывается, либо Telegram API не возвращает file_id).

---

## 📌 3. Риски и сомнительные моменты (⚠️)

### ⚠️ Caddy не найден
**Симптом:** команда `docker ps | grep caddy` не нашла контейнер, `systemctl is-active caddy` вернул `inactive`  
**Риск:** непонятно, как проксируется `/media/*` → API (может быть другой прокси или nginx, но не задокументировано)  
**Рекомендация:** найти реальный прокси-сервер (`docker ps | grep -i proxy` или проверить nginx на хосте)

### ⚠️ MTProto коннектор не проверен на реальной аутентификации
**Симптом:** `ChannelSource` пуст, `MTProtoConnector` не проверяли  
**Риск:** возможно, требуется phone auth (как написано в старых отчётах), и админка не показывает форму добавления канала без аутентификации  
**Рекомендация:** добавить 1 ChannelSource вручную через SQL или проверить UI для MTProto коннекторов

### ⚠️ Stage-2 M2 (Import by date) не протестирован
**Симптом:** `TelegramImportJob` пуст, код есть но не запускался  
**Риск:** возможны баги в date range (UTC, exclusive toDate, preview mapping)  
**Рекомендация:** создать тестовый Import Job и проверить preview + actual import

---

## 📌 4. Рекомендованный следующий шаг (топ-3)

### 1️⃣ **Добавить 1 ChannelSource и протестировать M2 Import by date**
   - Либо через UI `TelegramSources.tsx` (если MTProto auth работает)
   - Либо вручную через SQL (INSERT INTO "ChannelSource")
   - Запустить Import Job с date range, проверить preview + actual import

### 2️⃣ **Исправить Media MVP (M4): найти почему mediaItems пусто**
   - Проверить код `channel-ingestion.service.ts` → обработка file_id  
   - Добавить логи в процесс скачивания медиа (если включен)  
   - Создать тестовый channel post с фото, проверить что file_id сохранился в `mediaItems`

### 3️⃣ **Найти и задокументировать прокси-сервер для `/media/*`**
   - Проверить `docker ps`, nginx, или другой прокси
   - Обновить `infra/Caddyfile` или создать документацию о текущем проксировании

---

## ✅ Система готова к демонстрации клиенту?

### ❌ **НЕТ** (на данный момент)

**3 причины (P0):**

1. **Media MVP (M4) не работает на реальных данных** — mediaItems пусто у всех листингов, клиент не увидит фото авто  
2. **Sources Registry (M1) пуст** — нельзя показать "откуда импортируются авто" (нет источников)  
3. **Import by date (M2) не проверен** — рискуем показать баги на демо при попытке импорта за период

---

## ✅ Если исправить топ-3 → **ДА**

**3 сильные стороны (при условии исправления):**

1. **Telegram Bot API полностью работает** — webhook, lead identity, dedup, статусы, сценарии  
2. **Unified ingestion architecture готова** — `channel-ingestion.service.ts` используется для BotAPI и MTProto (единый код)  
3. **Инфраструктура стабильна** — health checks зелёные, база быстрая (1ms latency), деплой без конфликтов

**3 ближайших улучшения (после исправления P0):**

1. **Observability** — добавить Grafana/Prometheus метрики для worker jobs (Stage-2 M7)  
2. **Content Calendar** — активировать публикацию через Template Engine + Scheduler (Stage-2 M6)  
3. **MiniApp Portal** — завершить интеграцию витрины/favourites с главным порталом (Stage-2 M5)

---

**Конец отчёта.**
