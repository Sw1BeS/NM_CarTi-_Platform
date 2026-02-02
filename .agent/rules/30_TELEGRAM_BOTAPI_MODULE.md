---
trigger: always_on
---

# Telegram Bot API — Rules (P0)

📌 Webhook контракт (нельзя ломать)
1️⃣ Endpoint: `POST /api/telegram/webhook/:botId`
2️⃣ Обязательная проверка: `X-Telegram-Bot-Api-Secret-Token`
3️⃣ Ответ Telegram: 200 OK сразу, обработка — async (уже сделано).

📌 Allowed updates (должны оставаться включены, иначе фичи “умирают”)
1️⃣ `message`
2️⃣ `callback_query`
3️⃣ `inline_query`
4️⃣ `channel_post`
5️⃣ `my_chat_member`

📌 Pipeline (единая точка обработки апдейтов)
1️⃣ Dedup обязателен (не плодим лиды/сообщения).
2️⃣ Routing по типам:
   🔘 inline_query → `routeInline`
   🔘 callback_query → `routeCallback`
   🔘 web_app_data → `routeWebApp`
   🔘 message → `routeMessage`
   🔘 channel_post → `routeChannelPost`
   🔘 my_chat_member → `routeMyChatMember`

📌 Нормализация данных TG
1️⃣ TG id всегда хранить как string (`String(chat.id)`), учитывая `-100...` для каналов.
2️⃣ Username/Name тянуть из `from` и/или payload mini app.
3️⃣ Не предполагать, что `last_name` есть.

📌 Логи
1️⃣ Ошибки — с контекстом botId/companyId/chatId.
2️⃣ Нельзя логировать токены и сырые PII.
