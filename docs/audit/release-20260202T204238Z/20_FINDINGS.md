# Findings — Ошибки и баги
## Audit report: release-20260202T204238Z
## Commit: 8d428ea (main)

---

## 🐛 BUG-1: ChannelSource таблица пуста (блокер для M1/M2)

**Приоритет:** 🔴 **P0** (блокирует проверку Stage-2 M1, M2)

### 1️⃣ Симптом
Таблица `ChannelSource` существует, схема корректная, но **0 записей** в БД.

### 2️⃣ Как воспроизвести
```sql
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "SELECT COUNT(*) FROM \"ChannelSource\";"
-- Результат: 0
```

### 3️⃣ Ожидаемое поведение
- После добавления MTProto коннектора (или через UI `TelegramSources.tsx`) должна создаться запись в `ChannelSource`
- Минимум 1 источник для демонстрации импорта авто из каналов

### 4️⃣ Фактическое
- Таблица пуста
- Нет способа проверить M1 (Sources Registry) и M2 (Import by date) без реальных источников

### 5️⃣ Причина (предположение)
- **Возможная причина 1:** UI `TelegramSources.tsx` требует MTProto аутентификацию по телефону (прошлые отчёты упоминали блокировку на phone auth)
- **Возможная причина 2:** API endpoint для добавления ChannelSource не вызывается (нет интеграции между UI и бэкендом)
- **Возможная причина 3:** пользователь не добавил источники вручную (нормально для свежей установки)

### 6️⃣ Фикс
**Не применялся** (требует решения: добавить тестовый источник вручную или исправить UI/auth flow)

**Рекомендация для фикса:**
```sql
-- Временный тестовый источник (подставить реальный connectorId):
INSERT INTO "ChannelSource" (id, connectorId, channelId, title, status, importRules, createdAt, updatedAt)
VALUES (
  'test_ch_source_1',
  '<insert_real_connector_id_here>',
  '-1001234567890',
  'Test Auto Channel',
  'ACTIVE',
  '{"targetEntity":"CarListing","fields":{}}',
  NOW(),
  NOW()
);
```

---

## 🐛 BUG-2: TelegramImportJob пуст (M2 не проверен)

**Приоритет:** 🟠 **P1** (зависит от BUG-1)

### 1️⃣ Симптом
Таблица `TelegramImportJob` существует, но **0 записей** → нельзя проверить M2 (Import by date range + preview + jobs).

### 2️⃣ Как воспроизвести
```sql
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "SELECT COUNT(*) FROM \"TelegramImportJob\";"
-- Результат: 0
```

### 3️⃣ Ожидаемое поведение
- Пользователь создаёт Import Job через UI (`TelegramSources.tsx` + date picker)
- Job сохраняется в БД с полями `fromDate`, `toDate`, `status='PENDING'`
- Worker обрабатывает job, меняет статус на `PROCESSING` → `COMPLETED`

### 4️⃣ Фактическое
- Таблица пуста → worker не обрабатывал ни одного job

### 5️⃣ Причина
- **Блокировано BUG-1:** без `ChannelSource` нельзя создать Import Job (foreign key constraint)

### 6️⃣ Фикс
**Не применялся** (зависит от фикса BUG-1)

---

## 🐛 BUG-3: mediaItems всегда null (M4 не заполнено)

**Приоритет:** 🔴 **P0** (блокирует демо клиенту)

### 1️⃣ Симптом
Поле `mediaItems` (jsonb) существует в таблице `CarListing`, но у всех 20 последних эвристик **media_cnt = 0** (пусто).

### 2️⃣ Как воспроизвести
```sql
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "
SELECT id, jsonb_array_length(COALESCE(\"mediaItems\"::jsonb,'[]'::jsonb)) AS media_cnt, 
       (\"mediaItems\"::jsonb->0->>'url') AS first_url
FROM \"CarListing\" ORDER BY \"updatedAt\" DESC LIMIT 20;
"
-- Результат: все 20 строк media_cnt=0, first_url=null
```

### 3️⃣ Ожидаемое поведение
- При импорте поста с фото (channel_post или MTProto) код должен:
  1. Извлечь `file_id` из Telegram API
  2. Скачать файл через `getFile` → сохранить в `/srv/cartie/storage/media/`
  3. Записать в `mediaItems`: `[{ url: "/media/...", type: "photo", fileId: "..." }]`

### 4️⃣ Фактическое
- `mediaItems` пусто у всех листингов
- Фото не скачиваются и не сохраняются

### 5️⃣ Причина (предположение)
- **Возможная причина 1:** код `channel-ingestion.service.ts` не вызывает логику скачивания медиа (закомментирована или не активна)
- **Возможная причина 2:** Telegram API не возвращает `file_id` (маловероятно)
- **Возможная причина 3:** путь `/srv/cartie/storage/media/` не создан или нет прав записи (но smoke test прошёл → путь рабочий)
- **Наиболее вероятно:** логика сохранения медиа внутри `channelIngestionService.ingestChannelPost()` не реализована или не вызывается

### 6️⃣ Фикс
**Не применялся** (требует код-ревью + добавление логов + тест на реальном посте с фото)

**Рекомендация для фикса:**
1. Открыть `apps/server/src/services/channel-ingestion.service.ts`
2. Найти метод `ingestChannelPost()` или `processMediaGroup()`
3. Проверить: вызывается ли `getFile()` и `saveToStorage()`
4. Добавить логи:
   ```typescript
   console.log('[ChannelIngestion] file_id:', photoFileId, 'mediaItems:', mediaItems);
   ```
5. Импортировать тестовый пост с фото
6. Проверить логи и `SELECT "mediaItems" FROM "CarListing" WHERE id='<новый>';`

---

## 🐛 BUG-4: Caddy прокси не найден (⚠️ риск)

**Приоритет:** 🟡 **P2** (не блокирует, но требует уточнения)

### 1️⃣ Симптом
Команда `docker ps | grep -i caddy` не нашла контейнер, `systemctl is-active caddy` вернул `inactive`.

### 2️⃣ Как воспроизвести
```bash
docker ps --format '{{.Names}}' | grep -i caddy
# Результат: (пусто)

sudo systemctl is-active caddy
# Результат: inactive
```

### 3️⃣ Ожидаемое поведение
- Caddy прокси должен быть запущен (контейнер или systemd)
- `/media/*` должен проксироваться на API через Caddy

### 4️⃣ Фактическое
- Caddy не найден, но `/media/_smoke/ping.txt` доступен через `https://cartie2.umanoff-analytics.space/media/_smoke/ping.txt`
- **Вывод:** прокси работает, но неизвестно какой сервер это делает (возможно, nginx или встроенный в `infra2-web-1`)

### 5️⃣ Причина
- **Возможная причина 1:** Caddy установлен в другом месте (не контейнер, не systemd)
- **Возможная причина 2:** прокси встроен в `infra2-web-1` (Next.js rewrites или nginx sidecart)
- **Возможная причина 3:** промпт ожидал Caddy, но инфраструктура использует другой прокси

### 6️⃣ Фикс
**Не применялся** (нужно найти реальный прокси-сервер и задокументировать)

**Рекомендация для фикса:**
```bash
# Проверить все контейнеры:
docker ps --format "table {{.Names}}\t{{.Image}}"

# Проверить nginx:
ps aux | grep nginx

# Проверить Next.js rewrites:
cat apps/web/next.config.js | grep -A 10 "rewrites"
```

---

## 🐛 BUG-5: TelegramDestination схема не соответствует ожиданиям (⚠️ минор)

**Приоритет:** 🟢 **P3** (не блокирует, но требует уточнения модели)

### 1️⃣ Симптом
Промпт ожидал поле `integrationId` в `TelegramDestination`, но реальная схема использует `tgId`, `access`, `role`.

### 2️⃣ Как воспроизвести
```sql
docker exec infra2-db-1 psql -U cartie -d cartie_db -c "\d \"TelegramDestination\""
-- Результат: поля tgId, access, role, connectorId, channelSourceId, botId
-- НЕТ поля integrationId
```

### 3️⃣ Ожидаемое поведение (из промпта)
- `integrationId` — FK на Integration
- `status`, `lastSyncAt`

### 4️⃣ Фактическое
- Схема расширена: `tgId`, `access` (BotAPI/MTProto), `role` (participant/admin/owner?), `connectorId`, `channelSourceId`, `botId`
- Более детальная модель, чем ожидалось

### 5️⃣ Причина
- **Вероятно:** модель эволюционировала и стала более гибкой (поддержка разных типов доступа и ролей)

### 6️⃣ Фикс
**Не требуется** (схема работает, но нужно обновить документацию/промпт)

**Рекомендация:**
- Обновить Stage-2 M1 документацию: описать реальную схему `TelegramDestination`
- Или добавить миграцию, если `integrationId` критичен для будущих фич

---

## 📊 Сводная таблица багов

| BUG ID | Description | Priority | Blocking | Fix Applied |
|--------|-------------|----------|----------|-------------|
| BUG-1 | ChannelSource пуст | 🔴 P0 | M1, M2 | ❌ No |
| BUG-2 | TelegramImportJob пуст | 🟠 P1 | M2 | ❌ No (depends on BUG-1) |
| BUG-3 | mediaItems всегда null | 🔴 P0 | M4, демо клиенту | ❌ No |
| BUG-4 | Caddy proxy not found | 🟡 P2 | — | ❌ No |
| BUG-5 | TelegramDestination schema mismatch | 🟢 P3 | — | ❌ No |

---

**Конец отчёта о багах.**
