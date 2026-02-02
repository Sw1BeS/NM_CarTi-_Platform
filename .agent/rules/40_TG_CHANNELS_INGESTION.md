---
trigger: always_on
---

# Telegram Channels/Chats → Inventory/Content (P0)

📌 Проблема класса “две правды”
1️⃣ Bot API `channel_post` сейчас создаёт Draft эвристикой.
2️⃣ MTProto sync создаёт CarListing с dedup по source ids.
3️⃣ Это нельзя развивать параллельно как два независимых импорта.

📌 Единый целевой дизайн
1️⃣ “Канал/чат как источник” должен вести к одному пайплайну импорта:
   🔘 либо через ChannelSource + MTProto mapping
   🔘 либо через общий сервис “ingestion”, который умеет и BotAPI, и MTProto
2️⃣ Dedup обязателен:
   🔘 `sourceChatId + sourceMessageId` (как минимум)
   🔘 mediaGroupKey (если альбом)

📌 Draft vs CarListing
1️⃣ CarListing = инвентарь (продаваемая сущность).
2️⃣ Draft = контент/публикации (calendar).
3️⃣ Канальные посты про авто должны попадать в CarListing (или в Draft только как промежуточная стадия, но тогда нужен явный “конвертер Draft → CarListing”).

📌 Медиа
1️⃣ `file_id` — не “thumbnail url”.
2️⃣ Если пока нет скачивания — сохраняем `file_id` отдельным полем/metadata и не выдаём как URL в UI.
