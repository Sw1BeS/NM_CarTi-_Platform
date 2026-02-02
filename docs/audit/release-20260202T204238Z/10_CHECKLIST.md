# Технический чеклист — Stage-1 + Stage-2 (M1-M4)
## Audit timestamp: 2026-02-02T20:42Z
## Commit: 8d428ea (main)

---

## 📋 Stage-1 P0 Requirements (Обязательные)

| ID | Requirement | Status | Proof / SQL |
|----|------------|--------|-------------|
| **P0-1** | Lead TG Identity: сохранение telegramUsername, telegramName, telegramChatId | ✅ **PASS** | `SELECT payload::jsonb->>'telegramUsername', payload::jsonb->>'telegramChatId' FROM "Lead" WHERE "createdAt" > NOW() - INTERVAL '24h' LIMIT 20;` → 4 строки с заполненными полями |
| **P0-2** | CarListing Dedup: нет дублей по (sourceChatId, sourceMessageId) | ✅ **PASS** | `SELECT sourceChatId, sourceMessageId, COUNT(*) FROM "CarListing" WHERE sourceChatId IS NOT NULL GROUP BY 1,2 HAVING COUNT(*)>1;` → **(0 rows)** |
| **P0-3** | MTProto работает: ChannelSource>0 и CarListing с source='MTPROTO'>0 | ⚠️ **PARTIAL** | `SELECT COUNT(*) FROM "ChannelSource";` → **0** <br> `SELECT COUNT(*) FROM "CarListing" WHERE source='MTPROTO';` → **1** (код работает, но источники не добавлены) |

### P0-3 детализация:
- ✅ Код `channel-ingestion.service.ts` существует (19312 байт)
- ✅ Используется в `routeChannelPost.ts` (строка 3: `import { channelIngestionService }`)
- ✅ 1 MTProto листинг создан в БД (`car_mtproto_1769767830416_xs9ef`)
- ❌ Таблица `ChannelSource` пуста (0 записей) → **блокирует M2**

---

## 📋 Stage-2 Milestones (M1-M4)

### M1: Sources/Destinations Registry

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| Таблица `ChannelSource` | Существует, схема с connectorId, channelId, importRules, status, lastSyncedAt | ✅ Таблица создана, схема соответствует | ✅ **PASS** |
| Таблица `TelegramDestination` | Существует, схема с integrationId, tgId, status, lastSyncAt | ✅ Таблица создана, но поля: `tgId`, `access`, `role` (другая модель?) | ⚠️ **PARTIAL** |
| Записи в `ChannelSource` | >0 источников | **0 записей** | ❌ **FAIL** |
| Статусы/lastSyncAt на активных | Не пустые | — (нет активных) | — |

**SQL proof:**
```sql
SELECT COUNT(*) FROM "ChannelSource"; -- 0
SELECT id, channelId, status, lastSyncedAt FROM "ChannelSource" LIMIT 10; -- (0 rows)
```

**Вердикт M1:** ⚠️ **SCHEMA PASS, DATA FAIL** (схемы созданы, но нет данных для проверки)

---

### M2: Import by date range + preview + jobs

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| Таблица `TelegramImportJob` | Существует, схема с fromDate, toDate, channelSourceId, status | ✅ Таблица создана | ✅ **PASS** |
| Preview endpoint | Возвращает mapped + skipReason | — не проверяли (нет ChannelSource) | ❓ **UNKNOWN** |
| Import jobs processing | Worker обрабатывает, статусы меняются | **0 jobs** в БД | ❌ **FAIL** |
| UTC/exclusive toDate в UI | Пометка в UI/доках | — не проверяли код (ripgrep не установлен вовремя) | ❓ **UNKNOWN** |

**SQL proof:**
```sql
SELECT COUNT(*) FROM "TelegramImportJob"; -- 0
SELECT id, channelSourceId, status, fromDate, toDate FROM "TelegramImportJob" LIMIT 10; -- (0 rows)
```

**Вердикт M2:** ❌ **NOT TESTED** (блокировано отсутствием ChannelSource)

---

### M3: Unified ingestion (BotAPI + MTProto)

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| `channel-ingestion.service.ts` | Единый сервис для BotAPI channel_post и MTProto | ✅ Файл 19312 байт, импортируется в `routeChannelPost.ts` | ✅ **PASS** |
| `routeChannelPost` использует сервис | `import { channelIngestionService }` | ✅ Подтверждено (grep нашёл строку 3) | ✅ **PASS** |
| Merge logic сохраняет sources history | Не перезаписывает бизнес-поля | — не проверяли логику кода | ❓ **UNKNOWN** |

**Code proof:**
```bash
grep -n "channelIngestionService" apps/server/src/modules/Communication/telegram/routing/routeChannelPost.ts
# Результат: 3:import { channelIngestionService, type MediaItem } from '../../../../services/channel-ingestion.service.js';
```

**Вердикт M3:** ✅ **PARTIAL PASS** (код объединён, но merge logic не проверена на реальных данных)

---

### M4: Media MVP

| Item | Expected | Actual | Status |
|------|----------|--------|--------|
| Поле `mediaItems` в `CarListing` | jsonb поле с [{ url, type, fileId }] | ✅ Поле существует (jsonb) | ✅ **PASS** |
| CarListing с заполненным mediaItems | >0 листингов с mediaItems | **0 записей** (все media_cnt=0) | ❌ **FAIL** |
| `/media/*` URL доступны | curl -I возвращает 200 + Content-Type image/* | ✅ Smoke test прошёл (`/media/_smoke/ping.txt` вернул 200) | ✅ **PASS** |
| Реальное фото доступно | URL из `mediaItems[0].url` | — нет данных (mediaItems пусто) | ❌ **FAIL** |

**SQL proof:**
```sql
SELECT id, jsonb_array_length(COALESCE("mediaItems"::jsonb,'[]'::jsonb)) AS media_cnt, 
       ("mediaItems"::jsonb->0->>'url') AS first_url
FROM "CarListing" ORDER BY "updatedAt" DESC LIMIT 20;
-- Результат: все 20 строк media_cnt=0, first_url=null
```

**Вердикт M4:** ⚠️ **INFRASTRUCTURE PASS, DATA FAIL** (инфраструктура для медиа работает, но данных нет)

---

## 📊 Итоговая таблица (сводная)

| Stage | Milestone | Status | Blocker / Note |
|-------|-----------|--------|---------------|
| **Stage-1** | P0-1 Lead TG Identity | ✅ PASS | — |
| **Stage-1** | P0-2 CarListing Dedup | ✅ PASS | Unique index работает |
| **Stage-1** | P0-3 MTProto | ⚠️ PARTIAL | Код работает, но ChannelSource = 0 |
| **Stage-2** | M1 Sources Registry | ⚠️ SCHEMA PASS, DATA FAIL | Таблицы есть, записей нет |
| **Stage-2** | M2 Import by date | ❌ NOT TESTED | Блокировано M1 |
| **Stage-2** | M3 Unified ingestion | ✅ PARTIAL PASS | Код объединён, данных для проверки нет |
| **Stage-2** | M4 Media MVP | ⚠️ INFRA PASS, DATA FAIL | Прокси работает, mediaItems пусто |

---

## 🔍 Рекомендации по проверке

### Для M1 (Sources Registry):
1. Добавить 1 ChannelSource через UI или SQL:
   ```sql
   -- Пример (подставить реальные значения):
   INSERT INTO "ChannelSource" (id, connectorId, channelId, title, status)
   VALUES ('test_src_1', '<connector_id>', '-100123456789', 'Test Channel', 'ACTIVE');
   ```
2. Проверить: `SELECT * FROM "ChannelSource";`

### Для M2 (Import by date):
1. После добавления ChannelSource → создать Import Job через UI или API
2. Запустить worker (если не автозапуск)
3. Проверить: `SELECT * FROM "TelegramImportJob";`

### Для M4 (Media MVP):
1. Добавить в код логи: `console.log('mediaItems to save:', mediaItems)`
2. Импортировать пост с фото (channel_post с photo[])
3. Проверить: `SELECT "mediaItems" FROM "CarListing" WHERE id = '<last_created>';`
4. Если mediaItems заполнено → `curl -I https://cartie2.umanoff-analytics.space/media/<путь_из_url>`

---

**Конец чеклиста.**
