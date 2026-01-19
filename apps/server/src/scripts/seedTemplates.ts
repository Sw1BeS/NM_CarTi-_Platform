
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEMPLATES = [
    {
        id: 'tmpl_buy_v1',
        name: '🚗 Car Buying Assistant (Premium)',
        category: 'LEAD_GEN',
        description: 'A sophisticated flow to qualify buyers, asking for budget, brand preferences, and timeline.',
        isPublic: true,
        structure: {
            nodes: [
                {
                    id: 'node_start',
                    type: 'MESSAGE',
                    content: {
                        text: "Welcome to our Premium Concierge service. I'm here to help you find your perfect car.\n\nTo get started, could you tell me what kind of vehicle you are looking for?",
                        text_uk: "Вітаємо у нашому преміум консьєрж-сервісі. Я тут, щоб допомогти вам знайти ідеальне авто.\n\nдля початку, скажіть, який транспортний засіб ви шукаєте?",
                        text_ru: "Добро пожаловать в наш премиум консьерж-сервис. Я здесь, чтобы помочь вам найти идеальное авто.\n\nДля начала, скажите, какое транспортное средство вы ищете?"
                    },
                    nextNodeId: 'node_budget'
                },
                {
                    id: 'node_budget',
                    type: 'QUESTION_CHOICE',
                    content: {
                        text: "What is your approximate budget?",
                        text_uk: "Який ваш приблизний бюджет?",
                        text_ru: "Каков ваш приблизительный бюджет?",
                        variable: 'budget',
                        choices: [
                            { label: 'Under $10k', value: '10000' },
                            { label: '$10k - $25k', value: '25000' },
                            { label: '$25k - $50k', value: '50000' },
                            { label: '$50k+', value: '100000' }
                        ]
                    },
                    nextNodeId: 'node_brand'
                },
                {
                    id: 'node_brand',
                    type: 'QUESTION_TEXT',
                    content: {
                        text: "Do you have a specific brand or model in mind?",
                        text_uk: "Чи маєте ви на увазі конкретну марку чи модель?",
                        text_ru: "У вас есть на примете конкретная марка или модель?",
                        variable: 'brand_preference'
                    },
                    nextNodeId: 'node_search'
                },
                {
                    id: 'node_search',
                    type: 'SEARCH_CARS',
                    content: {
                        brandVar: 'brand_preference',
                        budgetVar: 'budget'
                    },
                    nextNodeId: 'node_check_results'
                },
                {
                    id: 'node_check_results',
                    type: 'CONDITION',
                    content: {
                        conditionVariable: 'found_count',
                        conditionOperator: 'GT',
                        conditionValue: '0',
                        trueNodeId: 'node_results_msg',
                        falseNodeId: 'node_fallback'
                    }
                },
                {
                    id: 'node_results_msg',
                    type: 'MESSAGE',
                    content: {
                        text: "Here are some options I found for you:",
                        text_uk: "Ось декілька варіантів, які я знайшов:",
                        text_ru: "Вот несколько вариантов, которые я нашел:"
                    },
                    nextNodeId: 'node_gallery'
                },
                {
                    id: 'node_gallery',
                    type: 'GALLERY',
                    content: {},
                    nextNodeId: 'node_contact'
                },
                {
                    id: 'node_fallback',
                    type: 'MESSAGE',
                    content: {
                        text: "I couldn't find exact matches in our immediate stock, but our team can source this for you.",
                        text_uk: "Я не знайшов точних збігів у нашому наявному складі, але наша команда може знайти це для вас.",
                        text_ru: "Я не нашел точных совпадений на складе, но наша команда может найти это для вас."
                    },
                    nextNodeId: 'node_contact'
                },
                {
                    id: 'node_contact',
                    type: 'ACTION',
                    content: {
                        actionType: 'CREATE_LEAD',
                        notifyAdmin: true
                    },
                    nextNodeId: 'node_end'
                },
                {
                    id: 'node_end',
                    type: 'MESSAGE',
                    content: {
                        text: "Thank you! A manager will contact you shortly with a personalized selection.",
                        text_uk: "Дякую! Менеджер зв'яжеться з вами найближчим часом з персональною підбіркою.",
                        text_ru: "Спасибо! Менеджер свяжется с вами в ближайшее время с персональной подборкой."
                    }
                }
            ]
        }
    },
    {
        id: 'tmpl_sell_v1',
        name: '💰 Trade-In / Sell Valuation',
        category: 'ACQUISITION',
        description: 'Collects car details from user for trade-in evaluation.',
        isPublic: true,
        structure: {
            nodes: [
                {
                    id: 'node_start',
                    type: 'MESSAGE',
                    content: {
                        text: "Great! Let's get an estimate for your car. What is the Year, Make, and Model of your vehicle?",
                        text_uk: "Чудово! Давайте оцінимо ваше авто. Який рік, марка та модель вашого автомобіля?",
                        text_ru: "Отлично! Давайте оценим ваш автомобиль. Какой год, марка и модель вашего авто?"
                    },
                    nextNodeId: 'node_details'
                },
                {
                    id: 'node_details',
                    type: 'QUESTION_TEXT',
                    content: {
                        variable: 'user_car_details',
                        text: "Please type it below (e.g., 2018 BMW X5):",
                        text_uk: "Будь ласка, напишіть нижче (наприклад, 2018 BMW X5):",
                        text_ru: "Пожалуйста, напишите ниже (например, 2018 BMW X5):"
                    },
                    nextNodeId: 'node_photos'
                },
                {
                    id: 'node_photos',
                    type: 'MESSAGE',
                    content: {
                        text: "Got it. If you have photos, you can send them now, or just click 'Skip'.",
                        text_uk: "Зрозумів. Якщо у вас є фото, можете надіслати їх зараз або натисніть 'Пропустити'.",
                        text_ru: "Понял. Если есть фото, можете отправить их сейчас или нажмите 'Пропустить'."
                    },
                    nextNodeId: 'node_skip_btn'
                },
                {
                    id: 'node_skip_btn',
                    type: 'QUESTION_CHOICE',
                    content: {
                        variable: 'photos_provided',
                        text: "Select an option:",
                        text_uk: "Оберіть опцію:",
                        text_ru: "Выберите опцию:",
                        choices: [
                            { label: 'Skip Photos', value: 'no' },
                            { label: 'I sent them', value: 'yes' }
                        ]
                    },
                    nextNodeId: 'node_action'
                },
                {
                    id: 'node_action',
                    type: 'ACTION',
                    content: { actionType: 'NOTIFY_ADMIN', text: 'New Trade-In Request: {{user_car_details}}' },
                    nextNodeId: 'node_final'
                },
                {
                    id: 'node_final',
                    type: 'MESSAGE',
                    content: {
                        text: "Thanks! We've received your request and will send you a valuation within 24 hours.",
                        text_uk: "Дякую! Ми отримали ваш запит і надішлемо оцінку протягом 24 годин.",
                        text_ru: "Спасибо! Мы получили ваш запрос и отправим оценку в течение 24 часов."
                    }
                }
            ]
        }
    },
    {
        id: 'tmpl_lang_v1',
        name: '🌐 Language Selection',
        category: 'SUPPORT',
        description: 'Allows user to select their preferred language (EN/UK/RU).',
        isPublic: true,
        structure: {
            nodes: [
                {
                    id: 'node_start',
                    type: 'MESSAGE',
                    content: {
                        text: "Please select your language:\nБудь ласка, оберіть мову:\nПожалуйста, выберите язык:",
                        text_uk: "Будь ласка, оберіть мову:",
                        text_ru: "Пожалуйста, выберите язык:"
                    },
                    nextNodeId: 'node_lang_choice'
                },
                {
                    id: 'node_lang_choice',
                    type: 'QUESTION_CHOICE',
                    content: {
                        variable: 'temp_lang',
                        text: "Options / Опції:",
                        choices: [
                            { label: '🇬🇧 English', value: 'EN', nextNodeId: 'node_set_en' },
                            { label: '🇺🇦 Українська', value: 'UK', nextNodeId: 'node_set_uk' },
                            { label: '🇷🇺 Русский', value: 'RU', nextNodeId: 'node_set_ru' }
                        ]
                    },
                    nextNodeId: ''
                },
                {
                    id: 'node_set_en',
                    type: 'ACTION',
                    content: { actionType: 'SET_LANG' },
                    nextNodeId: 'node_end_en'
                },
                {
                    id: 'node_set_uk',
                    type: 'ACTION',
                    content: { actionType: 'SET_LANG' },
                    nextNodeId: 'node_end_uk'
                },
                {
                    id: 'node_set_ru',
                    type: 'ACTION',
                    content: { actionType: 'SET_LANG' },
                    nextNodeId: 'node_end_ru'
                },
                {
                    id: 'node_end_en',
                    type: 'ACTION',
                    content: { actionType: 'SET_VAR', varName: 'language', varValue: 'EN' },
                    nextNodeId: 'node_msg_en'
                },
                {
                    id: 'node_end_uk',
                    type: 'ACTION',
                    content: { actionType: 'SET_VAR', varName: 'language', varValue: 'UK' },
                    nextNodeId: 'node_msg_uk'
                },
                {
                    id: 'node_end_ru',
                    type: 'ACTION',
                    content: { actionType: 'SET_VAR', varName: 'language', varValue: 'RU' },
                    nextNodeId: 'node_msg_ru'
                },
                {
                    id: 'node_msg_en',
                    type: 'MESSAGE',
                    content: { text: "Language set to English! 🇬🇧" }
                },
                {
                    id: 'node_msg_uk',
                    type: 'MESSAGE',
                    content: { text: "Мову змінено на Українську! 🇺🇦" }
                },
                {
                    id: 'node_msg_ru',
                    type: 'MESSAGE',
                    content: { text: "Язык изменен на Русский! 🇷🇺" }
                }
            ],
            triggerCommand: 'lang'
        }
    }
];

async function main() {
    console.log('🌱 Seeding Scenario Templates...');

    for (const t of TEMPLATES) {
        // Use upsert to avoid duplicates
        const existing = await prisma.scenarioTemplate.findUnique({ where: { id: t.id } });
        if (existing) {
            await prisma.scenarioTemplate.update({
                where: { id: t.id },
                data: t
            });
            console.log(`Updated template: ${t.name}`);
        } else {
            await prisma.scenarioTemplate.create({ data: t });
            console.log(`Created template: ${t.name}`);
        }
    }
    console.log('✅ Templates seeded successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
