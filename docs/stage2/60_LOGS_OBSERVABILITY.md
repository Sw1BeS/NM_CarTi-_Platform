# 60_LOGS_OBSERVABILITY

📌 1️⃣ Таблица
🔘 `IntegrationEventLog` (integration/entityId/action/status/message/payloadMeta/createdAt)
🔘 companyId → Workspace

📌 2️⃣ Backend
🔘 Сервис: `logIntegrationEvent(...)`
🔘 События пишутся:
   ☑️ tg webhook received
   ☑️ lead created
   ☑️ channel sync started/finished/failed
   ☑️ MTProto import chunk/finished/failed
   ☑️ publish success/failed
🔘 API: `GET /api/integrations/logs?integration&entityId&status&action&from&to`

📌 3️⃣ Frontend
🔘 Settings → Integration Logs
🔘 Фильтры: integration/entity/status/date
🔘 Быстрая проверка ошибок и ретраев

📌 DoD
✅ любая проблема TG/MTProto объясняется через UI логи
✅ фильтры работают (integration/entity/status/date)

📌 Как проверить
🔘 UI: Settings → Integration Logs → фильтры
🔘 SQL: `SELECT integration, action, status, message FROM "IntegrationEventLog" ORDER BY "createdAt" DESC LIMIT 20;`
🔘 Curl: `curl -s "http://localhost:3000/api/integrations/logs?integration=TELEGRAM_MTPROTO&status=ERROR" -H "Authorization: Bearer <token>"`
