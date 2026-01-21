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


