/**
 * Seed Production Bot Scenarios
 * 
 * Scenarios:
 * 1. CLIENT_REQUEST - Client creates car request via bot
 * 2. DEALER_OFFER - Dealer submits offer
 * 3. MAIN_MENU - Interactive menu with inline keyboard
 * 4. SEARCH_MENU - Auto.ria search integration
 * 5. MINI_APP_ENTRY - Links to Mini App pages
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Telegram text templates (multi-language)
const TEXTS = {
    welcome: {
        RU: '👋 Добро пожаловать в CarTie!\n\nЯ помогу вам найти идеальный автомобиль.',
        UK: '👋 Ласкаво просимо до CarTie!\n\nЯ допоможу вам знайти ідеальне авто.',
        EN: '👋 Welcome to CarTie!\n\nI will help you find the perfect car.'
    },
    menu: {
        RU: '📋 *Главное меню*\n\nВыберите действие:',
        UK: '📋 *Головне меню*\n\nОберіть дію:',
        EN: '📋 *Main Menu*\n\nSelect an action:'
    },
    request_start: {
        RU: '🚗 *Поиск авто*\n\nКакую марку вы ищете?',
        UK: '🚗 *Пошук авто*\n\nЯку марку ви шукаєте?',
        EN: '🚗 *Car Search*\n\nWhat make are you looking for?'
    },
    request_model: {
        RU: '📝 Отлично! Теперь укажите модель:',
        UK: '📝 Чудово! Тепер вкажіть модель:',
        EN: '📝 Great! Now specify the model:'
    },
    request_budget: {
        RU: '💰 Какой у вас бюджет (в USD)?',
        UK: '💰 Який у вас бюджет (в USD)?',
        EN: '💰 What is your budget (in USD)?'
    },
    request_year: {
        RU: '📅 Минимальный год выпуска?',
        UK: '📅 Мінімальний рік випуску?',
        EN: '📅 Minimum year?'
    },
    request_phone: {
        RU: '📱 Отправьте ваш номер телефона для связи:',
        UK: '📱 Надішліть ваш номер телефону:',
        EN: '📱 Send your phone number:'
    },
    request_success: {
        RU: '✅ *Заявка создана!*\n\nНомер: #{publicId}\n\nМенеджер свяжется с вами в ближайшее время.',
        UK: '✅ *Заявку створено!*\n\nНомер: #{publicId}\n\nМенеджер зв\'яжеться з вами найближчим часом.',
        EN: '✅ *Request created!*\n\nNumber: #{publicId}\n\nA manager will contact you shortly.'
    },
    my_requests: {
        RU: '📋 *Ваши заявки:*\n\n',
        UK: '📋 *Ваші заявки:*\n\n',
        EN: '📋 *Your requests:*\n\n'
    },
    no_requests: {
        RU: '📭 У вас пока нет заявок.',
        UK: '📭 У вас поки немає заявок.',
        EN: '📭 You have no requests yet.'
    }
};

// Inline keyboard templates
const KEYBOARDS = {
    main_menu: {
        inline_keyboard: [
            [{ text: '🚗 Найти авто', callback_data: 'action:find_car' }],
            [{ text: '📋 Мои заявки', callback_data: 'action:my_requests' }],
            [{ text: '💬 Связаться', callback_data: 'action:contact' }],
            [{ text: '⚙️ Настройки', callback_data: 'action:settings' }]
        ]
    },
    language_select: {
        inline_keyboard: [
            [{ text: '🇷🇺 Русский', callback_data: 'lang:RU' }],
            [{ text: '🇺🇦 Українська', callback_data: 'lang:UK' }],
            [{ text: '🇬🇧 English', callback_data: 'lang:EN' }]
        ]
    },
    share_phone: {
        keyboard: [
            [{ text: '📱 Отправить номер', request_contact: true }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
    }
};

export async function seedScenarios(companyId: string, botId: string) {
    console.log('🤖 Seeding bot scenarios...');

    // 1. Main Menu Scenario
    await prisma.scenario.upsert({
        where: { id: `scenario_menu_${companyId}` },
        update: {},
        create: {
            id: `scenario_menu_${companyId}`,
            name: 'Main Menu',
            triggerCommand: '/menu',
            isActive: true,
            keywords: ['menu', 'меню', 'start'],
            companyId,
            entryNodeId: 'node_menu',
            nodes: [
                {
                    id: 'node_menu',
                    type: 'MESSAGE',
                    content: {
                        text: TEXTS.menu.RU,
                        parseMode: 'Markdown',
                        keyboard: KEYBOARDS.main_menu
                    }
                }
            ]
        }
    });

    // 2. Welcome / Start Scenario
    await prisma.scenario.upsert({
        where: { id: `scenario_start_${companyId}` },
        update: {},
        create: {
            id: `scenario_start_${companyId}`,
            name: 'Welcome',
            triggerCommand: '/start',
            isActive: true,
            keywords: [],
            companyId,
            entryNodeId: 'node_welcome',
            nodes: [
                {
                    id: 'node_welcome',
                    type: 'MESSAGE',
                    content: {
                        text: TEXTS.welcome.RU,
                        keyboard: KEYBOARDS.main_menu
                    },
                    nextNodeId: null
                }
            ]
        }
    });

    // 3. Car Request Flow
    await prisma.scenario.upsert({
        where: { id: `scenario_request_${companyId}` },
        update: {},
        create: {
            id: `scenario_request_${companyId}`,
            name: 'Car Request',
            triggerCommand: null, // Triggered by callback
            isActive: true,
            keywords: ['найти авто', 'find car', 'знайти авто'],
            companyId,
            entryNodeId: 'node_ask_make',
            nodes: [
                {
                    id: 'node_ask_make',
                    type: 'QUESTION',
                    content: {
                        text: TEXTS.request_start.RU,
                        variable: 'make'
                    },
                    nextNodeId: 'node_ask_model'
                },
                {
                    id: 'node_ask_model',
                    type: 'QUESTION',
                    content: {
                        text: TEXTS.request_model.RU,
                        variable: 'model'
                    },
                    nextNodeId: 'node_ask_budget'
                },
                {
                    id: 'node_ask_budget',
                    type: 'QUESTION',
                    content: {
                        text: TEXTS.request_budget.RU,
                        variable: 'budget',
                        validation: 'number'
                    },
                    nextNodeId: 'node_ask_year'
                },
                {
                    id: 'node_ask_year',
                    type: 'QUESTION',
                    content: {
                        text: TEXTS.request_year.RU,
                        variable: 'year',
                        validation: 'year'
                    },
                    nextNodeId: 'node_ask_phone'
                },
                {
                    id: 'node_ask_phone',
                    type: 'REQUEST_CONTACT',
                    content: {
                        text: TEXTS.request_phone.RU,
                        keyboard: KEYBOARDS.share_phone
                    },
                    nextNodeId: 'node_create_request'
                },
                {
                    id: 'node_create_request',
                    type: 'ACTION',
                    content: {
                        action: 'CREATE_REQUEST',
                        successText: TEXTS.request_success.RU,
                        keyboard: KEYBOARDS.main_menu
                    },
                    nextNodeId: null
                }
            ]
        }
    });

    // 4. Language Settings
    await prisma.scenario.upsert({
        where: { id: `scenario_lang_${companyId}` },
        update: {},
        create: {
            id: `scenario_lang_${companyId}`,
            name: 'Language Selection',
            triggerCommand: '/language',
            isActive: true,
            keywords: ['язык', 'мова', 'language'],
            companyId,
            entryNodeId: 'node_lang',
            nodes: [
                {
                    id: 'node_lang',
                    type: 'MESSAGE',
                    content: {
                        text: '🌐 Выберите язык / Оберіть мову / Select language:',
                        keyboard: KEYBOARDS.language_select
                    }
                }
            ]
        }
    });

    // 5. My Requests
    await prisma.scenario.upsert({
        where: { id: `scenario_myrequests_${companyId}` },
        update: {},
        create: {
            id: `scenario_myrequests_${companyId}`,
            name: 'My Requests',
            triggerCommand: '/requests',
            isActive: true,
            keywords: ['мои заявки', 'мої заявки', 'my requests'],
            companyId,
            entryNodeId: 'node_list',
            nodes: [
                {
                    id: 'node_list',
                    type: 'ACTION',
                    content: {
                        action: 'LIST_USER_REQUESTS',
                        emptyText: TEXTS.no_requests.RU,
                        headerText: TEXTS.my_requests.RU
                    }
                }
            ]
        }
    });

    console.log('✅ Bot scenarios seeded successfully');
}

// CLI entry point
async function main() {
    const companyId = process.argv[2] || 'company_system';
    const botId = process.argv[3] || 'bot_demo';

    await seedScenarios(companyId, botId);
    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
});
