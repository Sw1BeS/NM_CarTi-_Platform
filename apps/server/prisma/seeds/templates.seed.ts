/**
 * Seed Default Scenario Templates
 * 
 * Creates 5 starter templates for the marketplace:
 * 1. Lead Capture Bot (LEAD_GEN)
 * 2. Product Catalog (E_COMMERCE)
 * 3. B2B Request Handler (B2B)
 * 4. FAQ Support (SUPPORT)
 * 5. Event Registration (LEAD_GEN)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_TEMPLATES = [
    {
        id: 'template_lead_capture',
        name: 'Lead Capture Bot',
        category: 'LEAD_GEN',
        description: 'Simple bot for collecting customer contact information and requests',
        isPremium: false,
        structure: {
            nodes: [
                {
                    id: 'greeting',
                    type: 'MESSAGE',
                    text: 'Вітаю! 👋 Я допоможу зібрати вашу заявку.',
                    nextNode: 'ask_name'
                },
                {
                    id: 'ask_name',
                    type: 'ASK_INPUT',
                    text: 'Як до вас звертатись?',
                    variable: 'name',
                    nextNode: 'ask_phone'
                },
                {
                    id: 'ask_phone',
                    type: 'ASK_INPUT',
                    text: 'Ваш номер телефону?',
                    variable: 'phone',
                    nextNode: 'ask_request'
                },
                {
                    id: 'ask_request',
                    type: 'ASK_INPUT',
                    text: 'Опишіть ваш запит:',
                    variable: 'request',
                    nextNode: 'confirm'
                },
                {
                    id: 'confirm',
                    type: 'MESSAGE',
                    text: 'Дякуємо, {name}! Ваша заявка прийнята. Ми зв\'яжемось з вами найближчим часом.',
                    actions: ['SAVE_LEAD']
                }
            ]
        }
    },
    {
        id: 'template_catalog',
        name: 'Product Catalog',
        category: 'E_COMMERCE',
        description: 'Browse products, search, and request details',
        isPremium: false,
        structure: {
            nodes: [
                {
                    id: 'menu',
                    type: 'MENU',
                    text: 'Каталог автомобілів 🚗',
                    buttons: [
                        { text: '🔍 Пошук', action: 'search_cars' },
                        { text: '📋 Всі авто', action: 'show_all' },
                        { text: '⭐ Рекомендації', action: 'recommended' }
                    ]
                },
                {
                    id: 'search_cars',
                    type: 'SEARCH_CARS',
                    text: 'Введіть марку або модель:',
                    nextNode: 'show_results'
                },
                {
                    id: 'show_results',
                    type: 'SHOW_CARS',
                    text: 'Знайдено автомобілів:',
                    actions: ['SHOW_DETAILS', 'IM_INTERESTED']
                }
            ]
        }
    },
    {
        id: 'template_b2b',
        name: 'B2B Request Handler',
        category: 'B2B',
        description: 'Process dealer requests and match with inventory',
        isPremium: true,
        structure: {
            nodes: [
                {
                    id: 'parse_request',
                    type: 'PARSE_REQUEST',
                    text: 'Надішліть деталі вашого запиту (бюджет, характеристики)',
                    nextNode: 'search_inventory'
                },
                {
                    id: 'search_inventory',
                    type: 'SEARCH_INVENTORY',
                    text: 'Шукаю варіанти...',
                    nextNode: 'offer_variants'
                },
                {
                    id: 'offer_variants',
                    type: 'SHOW_VARIANTS',
                    text: 'Знайдено {count} варіантів:',
                    actions: ['ACCEPT', 'REJECT', 'REQUEST_MORE']
                }
            ]
        }
    },
    {
        id: 'template_faq',
        name: 'FAQ Support Bot',
        category: 'SUPPORT',
        description: 'Answer frequently asked questions with escalation to human',
        isPremium: false,
        structure: {
            nodes: [
                {
                    id: 'faq_menu',
                    type: 'MENU',
                    text: 'Як я можу допомогти?',
                    buttons: [
                        { text: '📍 Де ми знаходимось?', action: 'location' },
                        { text: '⏰ Графік роботи', action: 'hours' },
                        { text: '💳 Способи оплати', action: 'payment' },
                        { text: '👤 Зв\'язатись з менеджером', action: 'escalate' }
                    ]
                },
                {
                    id: 'location',
                    type: 'MESSAGE',
                    text: '📍 Наша адреса: вул. Хрещатик, 1, Київ\n🗺 Карта: https://...',
                    nextNode: 'faq_menu'
                },
                {
                    id: 'escalate',
                    type: 'ESCALATE',
                    text: 'Передаю вас менеджеру...',
                    action: 'ASSIGN_TO_HUMAN'
                }
            ]
        }
    },
    {
        id: 'template_event',
        name: 'Event Registration',
        category: 'LEAD_GEN',
        description: 'Register users for events and send confirmations',
        isPremium: false,
        structure: {
            nodes: [
                {
                    id: 'event_info',
                    type: 'MESSAGE',
                    text: '🎉 Запрошуємо на презентацію нових моделей!\n📅 15 лютого, 18:00\n📍 Автосалон на Столичному шосе',
                    nextNode: 'register'
                },
                {
                    id: 'register',
                    type: 'MENU',
                    text: 'Бажаєте зареєструватись?',
                    buttons: [
                        { text: '✅ Так, реєструюсь', action: 'collect_info' },
                        { text: '❌ Ні, дякую', action: 'end' }
                    ]
                },
                {
                    id: 'collect_info',
                    type: 'ASK_INPUT',
                    text: 'Ваше ім\'я та номер телефону:',
                    variable: 'contact',
                    nextNode: 'confirm_registration'
                },
                {
                    id: 'confirm_registration',
                    type: 'MESSAGE',
                    text: '✅ Реєстрація підтверджена! Очікуємо вас 15 лютого о 18:00.\n📧 Деталі надіслано на пошту.',
                    actions: ['SAVE_LEAD', 'SEND_CONFIRMATION']
                }
            ]
        }
    }
];

async function seedTemplates() {
    console.log('🌱 Seeding default templates...');

    for (const template of DEFAULT_TEMPLATES) {
        try {
            await prisma.scenarioTemplate.upsert({
                where: { id: template.id },
                create: template,
                update: {
                    name: template.name,
                    category: template.category,
                    description: template.description,
                    structure: template.structure,
                    isPremium: template.isPremium
                }
            });

            console.log(`✅ Seeded: ${template.name}`);
        } catch (e) {
            console.error(`❌ Failed to seed ${template.name}:`, e);
        }
    }

    console.log('✨ Template seeding complete!');
}

seedTemplates()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error(e);
        prisma.$disconnect();
        process.exit(1);
    });
