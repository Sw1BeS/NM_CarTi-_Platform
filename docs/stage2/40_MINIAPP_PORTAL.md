# 40_MINIAPP_PORTAL

📌 1️⃣ Разделы и UX
🔘 Home (витрины + быстрые действия)
🔘 Listing (карточка авто + CTA "Request This Car")
🔘 Favorites (локальное сохранение через localStorage)
🔘 Create Request (форма заявки + подтверждение)
🔘 Request Status (по ID/телефону/telegram user)

📌 2️⃣ Tracking meta (start_param/utm/ref)
🔘 `B2bRequest.payload` хранит tracking + telegram meta
🔘 `chatId` сохраняется в `B2bRequest` как telegramUserId
🔘 phone сохраняется в `payload.phone` для поиска статуса

📌 3️⃣ API
🔘 `POST /api/public/:slug/requests` — создаёт заявку (payload + initData)
🔘 `GET /api/public/:slug/request-status?publicId|phone|telegramUserId` — статус
🔘 Инвентарь: `/showcase/public/:slug/inventory` (fallback `/public/:slug/inventory`)

📌 DoD
✅ Пользователь из mini app создаёт заявку
✅ Менеджер видит заявку с источником/telegram meta в админке
✅ Статус заявки доступен через mini app

📌 Как проверить
🔘 UI: Mini App → Favorites/Listing/Request/Status доступны
🔘 UI: отправить заявку → статус NEW/DRAFT в ответе
🔘 SQL: `SELECT id, publicId, chatId, payload FROM "B2bRequest" ORDER BY "createdAt" DESC LIMIT 3;`
🔘 Curl: `curl -s "http://localhost:3000/api/public/{slug}/request-status?phone=+15551234567"`
