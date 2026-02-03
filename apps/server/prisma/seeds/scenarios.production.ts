/**
 * Production Bot Scenario Seeds
 * Ready-to-use scenario templates for common automotive use cases
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const PRODUCTION_SCENARIOS = [
    {
        id: 'scenario_lead_capture',
        name: 'Збір контактів клієнтів',
        category: 'LEAD_GEN',
        description: 'Збирає ім\'я, телефон та деталі запиту від потенційних клієнтів',
        isPremium: false,

        structure: {
            nodes: [
                {
                    id: 'start',
                    type: 'MESSAGE',
                    text: '👋 Вітаю! Допоможу підібрати автомобіль.\n\nЯк до вас звертатись?',
                    nextNode: 'ask_phone'
                },
                {
                    id: 'ask_phone',
                    type: 'ASK_INPUT',
                    text: 'Чудово! Ваш номер телефону для зв\'язку?',
                    variable: 'phone',
                    nextNode: 'ask_budget'
                },
                {
                    id: 'ask_budget',
                    type: 'ASK_INPUT',
                    text: 'Який у вас бюджет? (в доларах)',
                    variable: 'budget',
                    nextNode: 'ask_preferences'
                },
                {
                    id: 'ask_preferences',
                    type: 'ASK_INPUT',
                    text: 'Які марки/моделі вас цікавлять? Які побажання?',
                    variable: 'request',
                    nextNode: 'confirm'
                },
                {
                    id: 'confirm',
                    type: 'MESSAGE',
                    text: '✅ Дякую! Ваша заявка прийнята.\n\nМенеджер зв\'яжеться з вами найближчим часом.',
                    actions: ['SAVE_LEAD']
                }
            ]
        }
    },
    {
        id: 'scenario_catalog_browse',
        name: 'Перегляд каталогу',
        category: 'E_COMMERCE',
        description: 'Дозволяє клієнтам переглядати наявні автомобілі з фільтрацією',
        isPremium: false,

        structure: {
            nodes: [
                {
                    id: 'menu',
                    type: 'MENU',
                    text: '🚗 Каталог автомобілів\n\nОберіть дію:',
                    buttons: [
                        { text: '🔍 Пошук за маркою', action: 'search_brand' },
                        { text: '📋 Всі доступні авто', action: 'show_all' },
                        { text: '💎 Преміум сегмент', action: 'show_premium' },
                        { text: '💰 До $15,000', action: 'show_budget' }
                    ]
                },
                {
                    id: 'search_brand',
                    type: 'SEARCH_CARS',
                    text: 'Введіть марку (наприклад: BMW, Mercedes):',
                    nextNode: 'show_results'
                },
                {
                    id: 'show_results',
                    type: 'SHOW_CARS',
                    text: '✅ Знайдені автомобілі:',
                    actions: ['SHOW_DETAILS', 'REQUEST_CALLBACK']
                }
            ]
        }
    },
    {
        id: 'scenario_b2b_dealer',
        name: 'B2B Запит для дилерів',
        category: 'B2B',
        description: 'Обробка запитів від дилерської мережі з автоматичним створенням B2B заявок',
        isPremium: true,

        structure: {
            nodes: [
                {
                    id: 'welcome',
                    type: 'MESSAGE',
                    text: '🤝 B2B Portal\n\nВведіть деталі вашого запиту:\n- Марка/модель\n- Бюджет\n- Кількість авто\n- Терміни',
                    nextNode: 'parse_request'
                },
                {
                    id: 'parse_request',
                    type: 'PARSE_REQUEST',
                    text: 'Аналізую запит...',
                    nextNode: 'create_b2b'
                },
                {
                    id: 'create_b2b',
                    type: 'CREATE_REQUEST',
                    text: '✅ B2B заявку створено.\n\nПочинаємо пошук варіантів у нашій мережі.',
                    actions: ['SAVE_REQUEST', 'NOTIFY_MANAGERS']
                }
            ]
        }
    },
    {
        id: 'scenario_faq',
        name: 'FAQ - Поширені питання',
        category: 'SUPPORT',
        description: 'Автоматичні відповіді на часті питання клієнтів',
        isPremium: false,

        structure: {
            nodes: [
                {
                    id: 'faq_menu',
                    type: 'MENU',
                    text: '❓ Як я можу допомогти?\n\nОберіть тему:',
                    buttons: [
                        { text: '📍 Де ви знаходитесь?', action: 'location' },
                        { text: '⏰ Графік роботи', action: 'hours' },
                        { text: '💳 Способи оплати', action: 'payment' },
                        { text: '🚚 Доставка авто', action: 'delivery' },
                        { text: '📞 Зв\'язок з менеджером', action: 'contact_manager' }
                    ]
                },
                {
                    id: 'location',
                    type: 'MESSAGE',
                    text: '📍 Ми знаходимось:\n\nКиїв, вул. Хрещатик, 1\n🗺 Карта: [посилання]\n\n🚗 Безкоштовна парковка',
                    nextNode: 'faq_menu'
                },
                {
                    id: 'hours',
                    type: 'MESSAGE',
                    text: '⏰ Графік роботи:\n\nПн-Пт: 9:00 - 19:00\nСб: 10:00 - 17:00\nНд: вихідний',
                    nextNode: 'faq_menu'
                },
                {
                    id: 'payment',
                    type: 'MESSAGE',
                    text: '💳 Способи оплати:\n\n✅ Готівка\n✅ Банківський переказ\n✅ Кредит/розстрочка\n✅ Trade-In (обмін старого авто)',
                    nextNode: 'faq_menu'
                },
                {
                    id: 'contact_manager',
                    type: 'ESCALATE',
                    text: '📞 Передаю вас менеджеру...\n\nОчікуйте на відповідь.',
                    action: 'ASSIGN_TO_HUMAN'
                }
            ]
        }
    },
    {
        id: 'scenario_test_drive',
        name: 'Запис на тест-драйв',
        category: 'LEAD_GEN',
        description: 'Бронювання тест-драйву з вибором дати та часу',
        isPremium: false,

        structure: {
            nodes: [
                {
                    id: 'intro',
                    type: 'MESSAGE',
                    text: '🚗 Тест-драйв\n\nОберіть автомобіль для тест-драйву або введіть марку/модель:',
                    nextNode: 'select_car'
                },
                {
                    id: 'select_car',
                    type: 'SEARCH_CARS',
                    variable: 'selected_car',
                    nextNode: 'ask_date'
                },
                {
                    id: 'ask_date',
                    type: 'ASK_INPUT',
                    text: 'Коли вам зручно? (дата та час)\n\nНаприклад: 25 січня, 14:00',
                    variable: 'preferred_date',
                    nextNode: 'ask_contact'
                },
                {
                    id: 'ask_contact',
                    type: 'ASK_INPUT',
                    text: 'Ваш номер телефону для підтвердження:',
                    variable: 'phone',
                    nextNode: 'confirm'
                },
                {
                    id: 'confirm',
                    type: 'MESSAGE',
                    text: '✅ Тест-драйв заброньовано!\n\nМи зателефонуємо для підтвердження.\n\n📍 Адреса: Київ, вул. Хрещатик, 1',
                    actions: ['SAVE_LEAD', 'CREATE_CALENDAR_EVENT']
                }
            ]
        }
    }
    ,
    {
        id: 'tpl_buy_request',
        name: 'Buy Request (UA/RU/EN)',
        category: 'B2B',
        description: 'Collects buy request details and creates a B2B request.',
        isPremium: false,
        structure: {
            triggerCommand: 'buy',
            keywords: ['buy', 'купити', 'купить'],
            entryNodeId: 'start',
            nodes: [
                { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'greet' },
                { id: 'greet', type: 'MESSAGE', content: { text: '👋 Hi! Let’s find a car for you.', text_uk: '👋 Вітаємо! Допоможемо підібрати авто.', text_ru: '👋 Здравствуйте! Поможем подобрать авто.' }, nextNodeId: 'ask_brand' },
                { id: 'ask_brand', type: 'QUESTION_TEXT', content: { text: 'Which brand?', text_uk: 'Яка марка вас цікавить?', text_ru: 'Какая марка интересует?', variableName: 'brand' }, nextNodeId: 'ask_model' },
                { id: 'ask_model', type: 'QUESTION_TEXT', content: { text: 'Model?', text_uk: 'Яка модель?', text_ru: 'Какая модель?', variableName: 'model' }, nextNodeId: 'ask_budget' },
                { id: 'ask_budget', type: 'QUESTION_TEXT', content: { text: 'Budget (USD)?', text_uk: 'Бюджет (USD)?', text_ru: 'Бюджет (USD)?', variableName: 'budget' }, nextNodeId: 'ask_year' },
                { id: 'ask_year', type: 'QUESTION_TEXT', content: { text: 'Year (e.g., 2019+)?', text_uk: 'Рік (наприклад 2019+)?', text_ru: 'Год (например 2019+)?', variableName: 'year' }, nextNodeId: 'ask_city' },
                { id: 'ask_city', type: 'QUESTION_TEXT', content: { text: 'City?', text_uk: 'Місто?', text_ru: 'Город?', variableName: 'city' }, nextNodeId: 'ask_contact' },
                { id: 'ask_contact', type: 'REQUEST_CONTACT', content: { text: 'Please share your contact so we can reach you.', text_uk: 'Поділіться контактом для звʼязку.', text_ru: 'Поделитесь контактом для связи.' }, nextNodeId: 'create_lead' },
                { id: 'create_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'BUY' }, nextNodeId: 'create_request' },
                { id: 'create_request', type: 'ACTION', content: { actionType: 'CREATE_REQUEST', requestType: 'BUY' }, nextNodeId: 'confirm' },
                { id: 'confirm', type: 'MESSAGE', content: { text: '✅ Request created. We will contact you shortly.', text_uk: '✅ Запит створено. Звʼяжемося найближчим часом.', text_ru: '✅ Запрос создан. Свяжемся в ближайшее время.' } }
            ]
        }
    },
    {
        id: 'tpl_sell_tradein',
        name: 'Sell / Trade-in (UA/RU/EN)',
        category: 'B2B',
        description: 'Collects sell/trade-in details and creates a B2B request.',
        isPremium: false,
        structure: {
            triggerCommand: 'sell',
            keywords: ['sell', 'продати', 'продать', 'trade-in'],
            entryNodeId: 'start',
            nodes: [
                { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'greet' },
                { id: 'greet', type: 'MESSAGE', content: { text: '👋 Let’s evaluate your car.', text_uk: '👋 Оцінимо ваше авто.', text_ru: '👋 Оценим ваш автомобиль.' }, nextNodeId: 'ask_brand' },
                { id: 'ask_brand', type: 'QUESTION_TEXT', content: { text: 'Brand?', text_uk: 'Марка?', text_ru: 'Марка?', variableName: 'brand' }, nextNodeId: 'ask_model' },
                { id: 'ask_model', type: 'QUESTION_TEXT', content: { text: 'Model?', text_uk: 'Модель?', text_ru: 'Модель?', variableName: 'model' }, nextNodeId: 'ask_year' },
                { id: 'ask_year', type: 'QUESTION_TEXT', content: { text: 'Year?', text_uk: 'Рік?', text_ru: 'Год?', variableName: 'year' }, nextNodeId: 'ask_mileage' },
                { id: 'ask_mileage', type: 'QUESTION_TEXT', content: { text: 'Mileage (km)?', text_uk: 'Пробіг (км)?', text_ru: 'Пробег (км)?', variableName: 'mileage' }, nextNodeId: 'ask_vin' },
                { id: 'ask_vin', type: 'QUESTION_TEXT', content: { text: 'VIN (optional)?', text_uk: 'VIN (необовʼязково)?', text_ru: 'VIN (необязательно)?', variableName: 'vin' }, nextNodeId: 'ask_price' },
                { id: 'ask_price', type: 'QUESTION_TEXT', content: { text: 'Expected price (USD)?', text_uk: 'Очікувана ціна (USD)?', text_ru: 'Ожидаемая цена (USD)?', variableName: 'budget' }, nextNodeId: 'ask_city' },
                { id: 'ask_city', type: 'QUESTION_TEXT', content: { text: 'City?', text_uk: 'Місто?', text_ru: 'Город?', variableName: 'city' }, nextNodeId: 'ask_contact' },
                { id: 'ask_contact', type: 'REQUEST_CONTACT', content: { text: 'Please share your contact.', text_uk: 'Поділіться контактом.', text_ru: 'Поделитесь контактом.' }, nextNodeId: 'create_lead' },
                { id: 'create_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'SELL' }, nextNodeId: 'create_request' },
                { id: 'create_request', type: 'ACTION', content: { actionType: 'CREATE_REQUEST', requestType: 'SELL' }, nextNodeId: 'confirm' },
                { id: 'confirm', type: 'MESSAGE', content: { text: '✅ Thanks! We will contact you with an offer.', text_uk: '✅ Дякуємо! Звʼяжемося з пропозицією.', text_ru: '✅ Спасибо! Свяжемся с предложением.' } }
            ]
        }
    },
    {
        id: 'tpl_status_support',
        name: 'Support / Status (UA/RU/EN)',
        category: 'SUPPORT',
        description: 'Checks request status or creates a support lead.',
        isPremium: false,
        structure: {
            triggerCommand: 'status',
            keywords: ['status', 'support', 'статус', 'підтримка', 'поддержка'],
            entryNodeId: 'start',
            nodes: [
                { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'ask_lookup' },
                { id: 'ask_lookup', type: 'QUESTION_TEXT', content: { text: 'Enter request ID or phone number.', text_uk: 'Введіть ID заявки або телефон.', text_ru: 'Введите ID заявки или телефон.', variableName: 'lookup' }, nextNodeId: 'lookup_action' },
                { id: 'lookup_action', type: 'ACTION', content: { actionType: 'LOOKUP_REQUEST', lookupVar: 'lookup' }, nextNodeId: 'check_found' },
                { id: 'check_found', type: 'CONDITION', content: { conditionVariable: 'lookup_found', conditionOperator: 'HAS_VALUE', trueNodeId: 'show_status', falseNodeId: 'not_found' } },
                { id: 'show_status', type: 'MESSAGE', content: { text: '✅ Status for #{requestPublicId}: {request_status}. Manager: {request_manager}', text_uk: '✅ Статус заявки #{requestPublicId}: {request_status}. Менеджер: {request_manager}', text_ru: '✅ Статус заявки #{requestPublicId}: {request_status}. Менеджер: {request_manager}' } },
                { id: 'not_found', type: 'MESSAGE', content: { text: 'We could not find a request. Creating support request...', text_uk: 'Не знайшли заявку. Створюємо запит у підтримку...', text_ru: 'Не нашли заявку. Создаем запрос в поддержку...' }, nextNodeId: 'support_lead' },
                { id: 'support_lead', type: 'ACTION', content: { actionType: 'CREATE_LEAD', leadType: 'SUPPORT' }, nextNodeId: 'notify_admin' },
                { id: 'notify_admin', type: 'ACTION', content: { actionType: 'NOTIFY_ADMIN', text: '🔔 Support request from {lookup}' } }
            ]
        }
    },
    {
        id: 'tpl_lang_select',
        name: 'Language Selector',
        category: 'SUPPORT',
        description: 'Sets the preferred language for the session.',
        isPremium: false,
        structure: {
            triggerCommand: 'lang',
            keywords: ['lang', 'language', 'мова', 'язык'],
            entryNodeId: 'start',
            nodes: [
                { id: 'start', type: 'START', content: { text: '' }, nextNodeId: 'choose_lang' },
                { id: 'choose_lang', type: 'QUESTION_CHOICE', content: { text: 'Choose language', text_uk: 'Оберіть мову', text_ru: 'Выберите язык', variableName: 'language', choices: [
                    { label: 'English', label_uk: 'English', label_ru: 'English', value: 'EN', nextNodeId: 'set_lang' },
                    { label: 'Ukrainian', label_uk: 'Українська', label_ru: 'Украинский', value: 'UK', nextNodeId: 'set_lang' },
                    { label: 'Russian', label_uk: 'Російська', label_ru: 'Русский', value: 'RU', nextNodeId: 'set_lang' }
                ] } },
                { id: 'set_lang', type: 'ACTION', content: { actionType: 'SET_LANG' }, nextNodeId: 'confirm' },
                { id: 'confirm', type: 'MESSAGE', content: { text: 'Language updated ✅', text_uk: 'Мову змінено ✅', text_ru: 'Язык обновлен ✅' } }
            ]
        }
    }
];

export async function seedProductionScenarios() {
    console.log('🎭 Seeding production scenarios...');

    for (const scenario of PRODUCTION_SCENARIOS) {
        await prisma.scenarioTemplate.upsert({
            where: { id: scenario.id },
            create: scenario as any,
            update: {
                name: scenario.name,
                category: scenario.category as any,
                description: scenario.description,
                structure: scenario.structure as any,
                isPremium: scenario.isPremium,

            }
        });
        console.log(`   ✅ ${scenario.name}`);
    }

    console.log('✅ Production scenarios seeded');
}

