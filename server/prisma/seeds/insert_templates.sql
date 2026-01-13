-- Insert 5 default templates via SQL

-- Template 1: Lead Capture Bot
INSERT INTO "ScenarioTemplate" ("id", "name", "category", "description", "isPremium", "structure", "createdAt", "updatedAt")
VALUES (
  'template_lead_capture',
  'Lead Capture Bot',
  'LEAD_GEN',
  'Simple bot for collecting customer contact information and requests',
  false,
  '{"nodes":[{"id":"greeting","type":"MESSAGE","text":"Вітаю! 👋 Я допоможу зібрати вашу заявку.","nextNode":"ask_name"},{"id":"ask_name","type":"ASK_INPUT","text":"Як до вас звертатись?","variable":"name","nextNode":"ask_phone"},{"id":"ask_phone","type":"ASK_INPUT","text":"Ваш номер телефону?","variable":"phone","nextNode":"ask_request"},{"id":"ask_request","type":"ASK_INPUT","text":"Опишіть ваш запит:","variable":"request","nextNode":"confirm"},{"id":"confirm","type":"MESSAGE","text":"Дякуємо! Ваша заявка прийнята.","actions":["SAVE_LEAD"]}]}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Template 2: Product Catalog
INSERT INTO "ScenarioTemplate" ("id", "name", "category", "description", "isPremium", "structure", "createdAt", "updatedAt")
VALUES (
  'template_catalog',
  'Product Catalog',
  'E_COMMERCE',
  'Browse products, search, and request details',
  false,
  '{"nodes":[{"id":"menu","type":"MENU","text":"Каталог автомобілів 🚗","buttons":[{"text":"🔍 Пошук","action":"search_cars"},{"text":"📋 Всі авто","action":"show_all"}]},{"id":"search_cars","type":"SEARCH_CARS","text":"Введіть марку або модель:","nextNode":"show_results"},{"id":"show_results","type":"SHOW_CARS","text":"Знайдено автомобілів:","actions":["SHOW_DETAILS","IM_INTERESTED"]}]}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Template 3: B2B Request Handler (Premium)
INSERT INTO "ScenarioTemplate" ("id", "name", "category", "description", "isPremium", "structure", "createdAt", "updatedAt")
VALUES (
  'template_b2b',
  'B2B Request Handler',
  'B2B',
  'Process dealer requests and match with inventory',
  true,
  '{"nodes":[{"id":"parse_request","type":"PARSE_REQUEST","text":"Надішліть деталі вашого запиту","nextNode":"search_inventory"},{"id":"search_inventory","type":"SEARCH_INVENTORY","text":"Шукаю варіанти...","nextNode":"offer_variants"},{"id":"offer_variants","type":"SHOW_VARIANTS","text":"Знайдено варіантів:","actions":["ACCEPT","REJECT","REQUEST_MORE"]}]}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Template 4: FAQ Support Bot
INSERT INTO "ScenarioTemplate" ("id", "name", "category", "description", "isPremium", "structure", "createdAt", "updatedAt")
VALUES (
  'template_faq',
  'FAQ Support Bot',
  'SUPPORT',
  'Answer frequently asked questions with escalation to human',
  false,
  '{"nodes":[{"id":"faq_menu","type":"MENU","text":"Як я можу допомогти?","buttons":[{"text":"📍 Де ми?","action":"location"},{"text":"⏰ Графік","action":"hours"},{"text":"👤 Менеджер","action":"escalate"}]},{"id":"location","type":"MESSAGE","text":"📍 Київ, вул. Хрещатик, 1","nextNode":"faq_menu"},{"id":"escalate","type":"ESCALATE","text":"Передаю менеджеру...","action":"ASSIGN_TO_HUMAN"}]}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Template 5: Event Registration
INSERT INTO "ScenarioTemplate" ("id", "name", "category", "description", "isPremium", "structure", "createdAt", "updatedAt")
VALUES (
  'template_event',
  'Event Registration',
  'LEAD_GEN',
  'Register users for events and send confirmations',
  false,
  '{"nodes":[{"id":"event_info","type":"MESSAGE","text":"🎉 Запрошуємо на презентацію!","nextNode":"register"},{"id":"register","type":"MENU","text":"Зареєструватись?","buttons":[{"text":"✅ Так","action":"collect_info"},{"text":"❌ Ні","action":"end"}]},{"id":"collect_info","type":"ASK_INPUT","text":"Ваше ім\u0027я та телефон:","variable":"contact","nextNode":"confirm_registration"},{"id":"confirm_registration","type":"MESSAGE","text":"✅ Реєстрація підтверджена!","actions":["SAVE_LEAD","SEND_CONFIRMATION"]}]}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
