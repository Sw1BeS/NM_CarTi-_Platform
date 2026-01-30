# 10_SOURCES_DESTINATIONS

📌 1️⃣ Модель и данные
🔘 Добавлена сущность `TelegramDestination` (registry) с полями: tgId, type, title, username, access, role, status, lastSyncAt, lastError
🔘 `ChannelSource` расширен полем `lastError` для UX диагностики
🔘 Registry синхронизируется с MTProto источниками, бот-каналами и диалогами (последние 500 сообщений)

📌 2️⃣ API (Integrations → Telegram Registry)
🔘 `GET /api/integrations/telegram/registry` — список Sources & Destinations
🔘 `POST /api/integrations/telegram/registry` — создать запись (ручное добавление)
🔘 `PUT /api/integrations/telegram/registry/:id` — обновить запись
🔘 `POST /api/integrations/telegram/registry/:id/pause` — пауза
🔘 `POST /api/integrations/telegram/registry/:id/resume` — возобновить
🔘 `POST /api/integrations/telegram/registry/:id/sync` — Sync Now (для MTProto источников)
🔘 `GET /api/integrations/telegram/registry/:id/logs` — логи (CarListing/BotMessage)

📌 3️⃣ UI (Telegram → Sources & Destinations)
🔘 Новый таб в Telegram Hub: Sources & Destinations
🔘 Пустые состояния с CTA (Connect MTProto / Add Destination)
🔘 Быстрые действия: Sync / Retry / Pause / Resume / Logs
🔘 Статус и причина ошибки видны в карточке

📌 DoD
✅ Из UI видно: какие источники активны, что сломано, почему сломано
✅ Можно включить/выключить источник без сервера
✅ Sync/Retry доступен для MTProto источников

📌 Как проверить
🔘 SQL: `SELECT id, tgId, access, role, status, lastError FROM "TelegramDestination" ORDER BY "updatedAt" DESC LIMIT 20;`
🔘 SQL: `SELECT id, title, status, lastError FROM "ChannelSource" ORDER BY "updatedAt" DESC;`
🔘 curl: `GET /api/integrations/telegram/registry` (под ADMIN/MANAGER токеном)
🔘 UI: Telegram Hub → Sources (таб) → Pause/Resume/Sync/Logs
