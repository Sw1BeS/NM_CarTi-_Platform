---
trigger: always_on
---

# Telegram → Leads: Identity & Data (P0)

📌 Главный принцип
1️⃣ Если лид создан из TG — он обязан иметь максимально “человеческую” идентификацию:
   🔘 `telegramUserId` (если это user)
   🔘 `telegramChatId`
   🔘 `telegramUsername` (если есть)
   🔘 `telegramName` (first+last или из mini app meta)

📌 Нельзя создавать лиды без попытки подтянуть имя
1️⃣ Любой код, который вызывает `createOrMergeLead(...)`, должен передавать:
   🔘 `telegramName`
   🔘 `telegramUsername`
   🔘 `userId/chatId`
2️⃣ Если имя недоступно — тогда:
   🔘 используем fallback (например “Client”)
   🔘 но сохраняем raw поля TG, чтобы потом дообогатить

📌 Merge/Dedup правило (минимум)
1️⃣ Primary key для TG-лида: `companyId + (telegramUserId || telegramChatId)`
2️⃣ Если пришёл username/name позже — обновляем лид (обогащение), не создаём новый.

📌 Минимальные ожидания по данным
1️⃣ В `lead.payload` сохраняем:
   🔘 откуда пришло (message/webapp/callback)
   🔘 ссылку на источник (tg message url если применимо)
   🔘 метки языка (если знаем)
