# 20_IMPORT_BY_DATE

📌 1️⃣ Что сделано (Backend)
🔘 Добавлен `TelegramImportJob` (queue/job) с чекпоинтом `lastMessageId/lastMessageDate`
🔘 MTProto history читает по `offsetDate` и идёт назад по диапазону дат
🔘 Preview endpoint отдаёт 5–10 сообщений с результатом маппинга + skipReason (без записи в БД)
🔘 Импорт работает в режиме `INVENTORY` или `DRAFT_ONLY`
🔘 Семантика дат: UTC, `fromDate` inclusive, `toDate` exclusive

📌 2️⃣ API
🔘 `POST /api/integrations/mtproto/:connectorId/channels/:sourceId/preview` (fromDate, toDate, mode)
🔘 `POST /api/integrations/mtproto/:connectorId/channels/:sourceId/import` (fromDate, toDate, mode)
🔘 `GET /api/integrations/mtproto/import-jobs?sourceId=...` — статус/прогресс

📌 3️⃣ UX
🔘 В MTProto Sources добавлен Import modal
🔘 Форма диапазона дат + mode + Preview → подтверждение → Import
🔘 Видны статусы/прогресс импорт-джобов + причины skip в preview
🔘 Подсказка в UI: UTC, `toDate` не включительно

📌 DoD
✅ Импорт по диапазону дат даёт предсказуемый результат
✅ Повторный импорт диапазона не создаёт дублей
✅ Preview показывает “что будет создано” и что будет пропущено до запуска

📌 Как проверить
🔘 SQL: `SELECT id, status, totalImported, lastMessageDate FROM "TelegramImportJob" ORDER BY "createdAt" DESC LIMIT 5;`
🔘 curl: `POST /api/integrations/mtproto/{connectorId}/channels/{sourceId}/preview` с датами
🔘 curl: `POST /api/integrations/mtproto/{connectorId}/channels/{sourceId}/import`
🔘 UI: Telegram Hub → Channels → Import → Preview → Start Import → Jobs
