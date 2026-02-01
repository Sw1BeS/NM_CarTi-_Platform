# 30_MEDIA_MVP

📌 1️⃣ Storage стратегия
🔘 Выбран локальный storage: `/srv/cartie/storage`
🔘 Публичная выдача: `/media/...` (Express static)
🔘 Структура: `/srv/cartie/storage/media/<companyId>/<sourceChatId>/<messageId>/<fileId>.<ext>`
🔘 Лимит: 25MB (MEDIA_TOO_LARGE → skip + log)
🔘 Retention: выключен (Stage‑2)

📌 2️⃣ Backend
🔘 `CarListing.mediaItems` (JSONB) + `mediaUrls` наполняются реальными URL
🔘 BotAPI: скачивание файлов через `getFile` → local storage (INVENTORY)
🔘 MTProto: `downloadMedia` → local storage (INVENTORY)
🔘 Media Group: если `mediaGroupKey` совпадает — фото добавляются к существующему лоту
🔘 CONTENT/Draft: только refs/preview‑метаданные, без скачивания
🔘 Только фото/альбомы: другое медиа → `MEDIA_UNSUPPORTED`

📌 3️⃣ Frontend
🔘 Inventory: карточка авто показывает галерею (основное фото + миниатюры)
🔘 Mini App: превью и lightbox берут изображения из `mediaItems/mediaUrls`

📌 DoD
✅ ≥10 импортированных авто отображают фото во фронте
✅ Альбомы отображаются как несколько фото
✅ Фото доступны по `/media/...`

📌 Как проверить
🔘 SQL: `SELECT id, mediaUrls, mediaItems FROM "CarListing" WHERE array_length("mediaUrls", 1) > 0 LIMIT 5;`
🔘 SQL: `SELECT id, "sourceChatId", "sourceMessageId", "thumbnail" FROM "CarListing" WHERE "thumbnail" LIKE '/media/%' LIMIT 5;`
🔘 UI: Inventory → открыть карточки с несколькими фото
🔘 UI: Mini App → открыть карточку → Lightbox с несколькими фото
