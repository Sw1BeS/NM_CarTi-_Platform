-- Update client bot menu with stable deep links and improved navigation
-- This script updates the Cartie_Client_Bot configuration

-- Update menu buttons with stable start params
UPDATE "BotConfig"
SET "menuConfig" = jsonb_set(
    "menuConfig",
    '{buttons}',
    '[
        {
            "text": "🚗 Знайти авто",
            "callback_data": "open_miniapp_inventory"
        },
        {
            "text": "📝 Заявка на авто",
            "callback_data": "open_miniapp_request"
        },
        {
            "text": "⭐ Обране",
            "callback_data": "open_miniapp_favorites"
        },
        {
            "text": "📊 Статус заявки",
            "callback_data": "open_miniapp_status"
        },
        {
            "text": "💰 Продати авто",
            "callback_data": "open_miniapp_sell"
        },
        {
            "text": "❓ Підтримка",
            "callback_data": "open_support"
        },
        {
            "text": "ℹ️ Про CarTié",
            "callback_data": "show_about"
        }
    ]'::jsonb
)
WHERE "botUsername" = 'Cartie_Client_Bot';

-- Update MiniApp configuration with proper navigation items
UPDATE "BotConfig"
SET "miniAppConfig" = jsonb_set(
    "miniAppConfig",
    '{navItems}',
    '[
        {
            "id": "home",
            "label": "Головна",
            "icon": "home",
            "view": "HOME"
        },
        {
            "id": "inventory",
            "label": "Каталог",
            "icon": "car",
            "view": "INVENTORY"
        },
        {
            "id": "favorites",
            "label": "Обране",
            "icon": "star",
            "view": "FAVORITES"
        },
        {
            "id": "request",
            "label": "Заявка",
            "icon": "document",
            "view": "REQUEST"
        },
        {
            "id": "status",
            "label": "Статус",
            "icon": "chart",
            "view": "STATUS"
        }
    ]'::jsonb
)
WHERE "botUsername" = 'Cartie_Client_Bot';

-- Update welcome message with clearer instructions
UPDATE "BotConfig"
SET "welcomeMessage" = '👋 Вітаємо в CarTié!

🚗 Знайдіть своє ідеальне авто з нашою допомогою

Використуйте меню нижче для швидкого доступу:
• 🚗 Знайти авто - переглянути каталог
• 📝 Заявка на авто - подати запит на пошук
• ⭐ Обране - ваші обрані авто
• 📊 Статус заявки - перевірити статус
• 💰 Продати авто - продати свій автомобіль
• ❓ Підтримка - зв''язатися з менеджером
• ℹ️ Про CarTié - дізнатися більше про нас

Ми допоможемо вам знайти найкращі пропозиції! 🎯'
WHERE "botUsername" = 'Cartie_Client_Bot';

-- Update MiniApp URL with proper base URL
UPDATE "BotConfig"
SET "miniAppUrl" = 'https://cartie.com/miniapp'
WHERE "botUsername" = 'Cartie_Client_Bot';

-- Verify the updates
SELECT
    "botUsername",
    "menuConfig"->'buttons' as menu_buttons,
    "miniAppConfig"->'navItems' as nav_items,
    "welcomeMessage"
FROM "BotConfig"
WHERE "botUsername" = 'Cartie_Client_Bot';
