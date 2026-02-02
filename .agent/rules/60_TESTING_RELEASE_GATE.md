---
trigger: always_on
---

# Testing & Release Gate (P0)

📌 Минимальный тест-гейт перед деплоем
1️⃣ `api/health` отвечает 200.
2️⃣ TG webhook:
   🔘 принимает апдейт
   🔘 проходит secret-token check
   🔘 не падает pipeline
3️⃣ Inbox/Leads:
   🔘 создаётся лид
   🔘 имя/username тянутся если доступны из TG
4️⃣ Inventory:
   🔘 нет дублей по source ids (минимум)

📌 Правило регресса
1️⃣ Если фикс в TG модуле — обязательна проверка:
   🔘 message
   🔘 callback
   🔘 web_app_data
   🔘 channel_post (если затронуто)
   🔘 my_chat_member (если затронуто)
