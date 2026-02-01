# 40_MINIAPP_PORTAL

📌 1️⃣ Разделы и UX
🔘 Home (витрины + быстрые действия)
🔘 Listing (карточка авто + CTA "Request This Car")
🔘 Favorites (персистентные, через БД)
🔘 Create Request (форма заявки + подтверждение)
🔘 Request Status (по ID/телефону/telegram user)

📌 2️⃣ Data/Model
🔘 `MiniAppFavorite`:
   ☑️ companyId
   ☑️ carListingId
   ☑️ tgUserId | visitorId
   ☑️ createdAt
🔘 `B2bRequest.payload` хранит:
   ☑️ tracking (start_param/utm/ref/entrypoint/miniappVersion)
   ☑️ telegram meta (userId/username/name)
   ☑️ request meta (carListingId/phone/comment)

📌 3️⃣ Tracking meta (start_param/utm/ref)
🔘 `B2bRequest.payload.tracking` = start_param + utm + ref + entrypoint + buildSha
🔘 `chatId` сохраняется в `B2bRequest` как telegramUserId
🔘 `payload.phone` используется для поиска статуса

📌 4️⃣ API
🔘 `GET /api/miniapp/favorites?slug&tgUserId|visitorId` — список избранного
🔘 `POST /api/miniapp/favorites/:carListingId` — toggle favorite
🔘 `POST /api/miniapp/requests` — создаёт заявку (payload + tracking)
🔘 `GET /api/miniapp/requests/status?slug&requestId|phone|telegramUserId` — статус
🔘 Инвентарь: `/showcase/public/:slug/inventory` (fallback `/public/:slug/inventory`)

📌 DoD
✅ Пользователь в mini app:
   ☑️ видит витрину с фото
   ☑️ открывает карточку авто
   ☑️ добавляет в избранное
   ☑️ создаёт заявку
   ☑️ проверяет статус заявки
✅ Менеджер видит заявку с источником/telegram meta в админке

📌 Как проверить
🔘 UI: Mini App → Home → Listing → Favorite → Request → Status
🔘 SQL favorites:
   `SELECT * FROM "MiniAppFavorite" ORDER BY "createdAt" DESC LIMIT 5;`
🔘 SQL request payload:
   `SELECT id, publicId, chatId, payload FROM "B2bRequest" ORDER BY "createdAt" DESC LIMIT 3;`
🔘 Curl:
   `curl -s "http://localhost:3000/api/miniapp/requests/status?slug={slug}&telegramUserId=123"`
