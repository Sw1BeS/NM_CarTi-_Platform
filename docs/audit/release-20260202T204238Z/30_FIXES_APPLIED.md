# Fixes Applied During Audit
## Audit report: release-20260202T204238Z
## Commit range: 8aa880d (feat/stage2-tg-productize) → 8d428ea (main после merge)

---

## 📌 Статус применения правок

**В ходе аудита правки НЕ применялись.**  
Согласно инструкциям промпта, аудит должен был выявить проблемы и задокументировать их, но **не исправлять** без явной необходимости (только hotfix уровня P0/P1 если блокируют проверку).

Все обнаруженные баги (BUG-1 — BUG-5) **задокументированы** в `20_FINDINGS.md`, но **не исправлены** в рамках этого аудита.

---

## ✅ Единственная "правка" — Git merge

### Коммит: `8d428ea` (merge commit)
**Дата:** 2026-02-02T20:41Z  
**Ветка:** `main`  
**Что сделано:** Слияние ветки `feat/stage2-tg-productize` в `main`

#### Детали merge:
```
Merge made by the 'ort' strategy.
19 files changed, 1701 insertions(+), 149 deletions(-)
```

#### Ключевые файлы добавлены:
- `apps/server/src/modules/Communication/telegram/destinations/destination.routes.ts` (NEW)
- `apps/server/src/modules/Communication/telegram/destinations/destination.service.ts` (NEW)
- `apps/web/src/pages/app/MTProtoIntegration.tsx` (NEW)
- `apps/web/src/pages/app/TelegramSources.tsx` (NEW)
- `apps/web/src/services/destination.service.ts` (NEW)
- `apps/web/src/services/mtproto.service.ts` (NEW)
- `docs/stage2/30_INGESTION_UNIFICATION.md` (NEW)
- `docs/stage2/40_MEDIA_MVP.md` (NEW)
- `docs/stage2/50_MINIAPP_PORTAL.md` (NEW)
- `docs/stage2/60_CONTENT_CALENDAR.md` (NEW)
- `docs/stage2/70_OBSERVABILITY.md` (NEW)

#### Изменены:
- `docs/PLAN.md` (108 insertions, 15 deletions)
- `docs/stage2/00_SUMMARY.md` (138 insertions, 25 deletions)
- `docs/stage2/10_SOURCE_DESTINATIONS.md` (64 insertions, 27 deletions)
- `docs/stage2/20_IMPORT_BY_DATE.md` (53 insertions, 18 deletions)

#### Как проверить:
```bash
cd /srv/cartie && git log --oneline -n 5
# Результат: 8d428ea merge: stage2 up to m4
```

---

## ❌ Почему правки не применялись?

### 1️⃣ BUG-1 (ChannelSource пуст)
- **Причина:** Требует решения: добавить тестовый источник вручную ИЛИ исправить UI/MTProto auth flow
- **Риск:** Неизвестно какой подход предпочитает пользователь (manual SQL или UI fix)
- **Рекомендация:** спросить пользователя или добавить тестовый источник в следующем этапе

### 2️⃣ BUG-2 (TelegramImportJob пуст)
- **Зависимость:** Блокировано BUG-1 (foreign key constraint)
- **Не применяется до фикса BUG-1**

### 3️⃣ BUG-3 (mediaItems null)
- **Требует код-ревью:** нужно открыть `channel-ingestion.service.ts` и найти метод обработки медиа
- **Риск:** Большая правка (может затронуть логику импорта), требует тестирования на реальном посте с фото
- **Рекомендация:** выделить отдельную задачу для фикса M4

### 4️⃣ BUG-4 (Caddy не найден)
- **Не критично:** прокси работает (smoke test прошёл), но неизвестно какой сервер
- **Рекомендация:** задокументировать текущую инфраструктуру (nginx или Next.js rewrites)

### 5️⃣ BUG-5 (TelegramDestination schema)
- **Не баг:** схема работает, просто отличается от ожиданий промпта
- **Рекомендация:** обновить документацию

---

## 📋 Если бы правки применялись — что было бы сделано?

### Hotfix для BUG-1 (добавление тестового ChannelSource)
```sql
-- [HYPOTHETICAL] Не выполнялось в рамках аудита
INSERT INTO "ChannelSource" (id, connectorId, channelId, title, status, importRules, createdAt, updatedAt)
VALUES (
  'audit_test_src_20260202',
  'placeholder_connector_id',
  '-1001234567890',
  'Audit Test Channel',
  'ACTIVE',
  '{"targetEntity":"CarListing","fields":{}}',
  NOW(),
  NOW()
);
```

**Коммит (гипотетический):**
```
fix(audit): add test ChannelSource to unblock M1/M2 verification

- Insert test channel source for audit purposes
- Enables verification of Import Job flow
- Ref: BUG-1 in audit report
```

**Как проверить (гипотетически):**
```sql
SELECT COUNT(*) FROM "ChannelSource"; -- должно вернуть 1
```

---

### Hotfix для BUG-3 (добавление логов в channel-ingestion.service.ts)
```typescript
// [HYPOTHETICAL] Не выполнялось в рамках аудита
// apps/server/src/services/channel-ingestion.service.ts

async ingestChannelPost(...) {
  // ... existing code ...
  
  // ADD DEBUG LOGS:
  console.log('[ChannelIngestion] Processing media:', {
    photoCount: message.photo?.length || 0,
    mediaGroupId: message.media_group_id,
    fileIds: message.photo?.map(p => p.file_id) || []
  });
  
  const mediaItems = await this.processMediaGroup(message);
  console.log('[ChannelIngestion] mediaItems to save:', mediaItems);
  
  // ... rest of code ...
}
```

**Коммит (гипотетический):**
```
debug(audit): add media processing logs to channel-ingestion

- Log photo count and file_ids for debugging
- Track mediaItems before saving to DB
- Helps diagnose BUG-3 (mediaItems always null)
- Ref: 20_FINDINGS.md BUG-3
```

**Как проверить (гипотетически):**
```bash
# После коммита:
docker logs -f infra2-api-1 | grep "ChannelIngestion"
# Импортировать тестовый пост с фото через Telegram
# Проверить логи: должны появиться [ChannelIngestion] Processing media
```

---

## 🔄 Fallback (если что-то пошло не так)

### Если merge сломал систему — откат:
```bash
# Вернуться на тэг перед merge:
cd /srv/cartie
git checkout pre-merge-20260202T204105Z

# Перезапуск:
docker restart infra2-api-1 infra2-web-1

# Проверка:
curl -fsS https://cartie2.umanoff-analytics.space/api/health
```

---

## 📊 Итого

| Действие | Выполнено | Причина |
|----------|-----------|---------|
| Merge `feat/stage2-tg-productize` → `main` | ✅ Да | Основная задача аудита |
| Исправление BUG-1 (ChannelSource) | ❌ Нет | Требует решения: SQL или UI fix |
| Исправление BUG-2 (TelegramImportJob) | ❌ Нет | Зависит от BUG-1 |
| Исправление BUG-3 (mediaItems) | ❌ Нет | Требует код-ревью + тестирование |
| Документация BUG-4 (Caddy) | ❌ Нет | Нужно найти реальный прокси |
| Обновление доков для BUG-5 | ❌ Нет | Низкий приоритет |

---

**Конец отчёта о правках.**
