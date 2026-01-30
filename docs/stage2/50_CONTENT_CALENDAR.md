# 50_CONTENT_CALENDAR

📌 1️⃣ Сущности
🔘 `Template` — хранит текст шаблона с переменными
🔘 `PublicationJob` — очередь публикаций (status/scheduledAt/attempts/lastError)
🔘 `PublicationResult` — результат попытки (success/failed + messageId)

📌 2️⃣ Backend
🔘 Preview endpoint: `POST /api/content/templates/preview`
🔘 Templates CRUD: `GET/POST/PUT/DELETE /api/content/templates`
🔘 Jobs CRUD + retry: `GET/POST/DELETE /api/content/publication-jobs`, `POST /api/content/publication-jobs/:id/retry`
🔘 Content worker публикует `PublicationJob` → создаёт `PublicationResult`

📌 3️⃣ Frontend
🔘 Content Manager: шаблоны + предпросмотр + публикации + retry
🔘 Calendar: очередь/календарь использует `PublicationJob`
🔘 Вставки переменных: {title} {brand} {price} {year} {location} {link} {car}

📌 DoD
✅ 10 публикаций уходят в канал, статусы корректны
✅ Ошибки видны, есть retry
✅ Preview показывает сообщение до запуска

📌 Как проверить
🔘 UI: Content → создать пост → Preview → Schedule → статус
🔘 UI: Content → Failed → Retry
🔘 SQL: `SELECT id, status, scheduledAt, postedAt, lastError FROM "PublicationJob" ORDER BY "createdAt" DESC LIMIT 10;`
🔘 SQL: `SELECT jobId, status, messageId FROM "PublicationResult" ORDER BY "createdAt" DESC LIMIT 10;`
🔘 Curl: `curl -s -X POST http://localhost:3000/api/content/templates/preview -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"template":"{title} {price}","carId":"<carId>"}'`
