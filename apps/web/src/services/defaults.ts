import { BotMenuButtonConfig, MiniAppConfig } from '../types';

export const DEFAULT_MENU_CONFIG: { buttons: BotMenuButtonConfig[]; welcomeMessage: string } = {
    welcomeMessage: "👋 Вітаємо в CarTié Concierge!\n\nМи допоможемо з підбором та продажем авто.\nОберіть дію нижче.",
    buttons: [
        { id: 'btn_buy', label: '🚗 Купити авто', label_uk: '🚗 Купити авто', label_ru: '🚗 Купить авто', type: 'SCENARIO', value: 'scn_buy', row: 0, col: 0 },
        { id: 'btn_sell', label: '💰 Продати авто', label_uk: '💰 Продати авто', label_ru: '💰 Продать авто', type: 'SCENARIO', value: 'scn_sell', row: 0, col: 1 },
        { id: 'btn_app', label: '📱 Додаток', label_uk: '📱 Додаток', label_ru: '📱 Приложение', type: 'WEB_APP', value: '{{MINI_APP_URL}}', row: 1, col: 0 },
        { id: 'btn_sup', label: '📞 Підтримка', label_uk: '📞 Підтримка', label_ru: '📞 Поддержка', type: 'SCENARIO', value: 'scn_support', row: 2, col: 0 },
        { id: 'btn_lang', label: '🌐 Мова', label_uk: '🌐 Мова', label_ru: '🌐 Язык', type: 'SCENARIO', value: 'scn_lang', row: 2, col: 1 }
    ]
};

export const DEFAULT_B2B_MENU_CONFIG: { buttons: BotMenuButtonConfig[]; welcomeMessage: string } = {
    welcomeMessage: "🤝 CarDealer Lviv B2B\n\nСтворюйте структурований запит та отримуйте пропозиції через кнопку «Є авто».",
    buttons: [
        { id: 'btn_b2b_req', label: '📝 Створити запит', label_uk: '📝 Створити запит', label_ru: '📝 Создать запрос', type: 'SCENARIO', value: 'scn_b2b_request', row: 0, col: 0 },
        { id: 'btn_b2b_offer', label: '💼 Подати варіант', label_uk: '💼 Подати варіант', label_ru: '💼 Подать вариант', type: 'SCENARIO', value: 'scn_b2b_offer', row: 0, col: 1 },
        { id: 'btn_b2b_app', label: '📱 Застосунок', label_uk: '📱 Застосунок', label_ru: '📱 Приложение', type: 'WEB_APP', value: '{{MINI_APP_URL}}', row: 1, col: 0 },
        { id: 'btn_b2b_help', label: 'ℹ️ Правила', label_uk: 'ℹ️ Правила', label_ru: 'ℹ️ Правила', type: 'SCENARIO', value: 'scn_b2b_help', row: 1, col: 1 },
        { id: 'btn_b2b_menu', label: '🏠 Меню', label_uk: '🏠 Меню', label_ru: '🏠 Меню', type: 'TEXT', value: '/menu', row: 2, col: 0 }
    ]
};

export const DEFAULT_MINI_APP_CONFIG: MiniAppConfig = {
    isEnabled: true,
    surfaceMode: 'LEAD',
    title: 'CarTié Premium',
    welcomeText: 'Ваш персональний помічник з підбору авто.',
    primaryColor: '#D4AF37',
    accentColor: '#111111',
    layout: 'GRID',
    actions: [
        { id: 'act_stock', label: 'Інвентар', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'act_req', label: 'Запит', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
        { id: 'act_chat', label: 'Чат', icon: 'MessageCircle', actionType: 'LINK', value: 'https://t.me/cartie_manager' },
        { id: 'act_sell', label: 'Оцінка Trade-In', icon: 'DollarSign', actionType: 'SCENARIO', value: 'scn_sell' }
    ],
    navItems: [
        { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
        { id: 'nav_stock', label: 'Інвентар', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'nav_saved', label: 'Обране', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
        { id: 'nav_request', label: 'Запит', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
        { id: 'nav_status', label: 'Статус', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
    ]
};

export const DEFAULT_B2B_MINI_APP_CONFIG: MiniAppConfig = {
    isEnabled: true,
    surfaceMode: 'B2B',
    title: 'CarDealer Lviv B2B',
    welcomeText: 'Інвентар партнерів та статуси B2B-запитів у реальному часі.',
    primaryColor: '#2AA876',
    accentColor: '#0B1F17',
    layout: 'GRID',
    actions: [
        { id: 'act_stock', label: 'Запити/інвентар', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'act_fav', label: 'Обране', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
        { id: 'act_status', label: 'Статуси', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
    ],
    navItems: [
        { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
        { id: 'nav_stock', label: 'Мережа', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'nav_saved', label: 'Обране', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
        { id: 'nav_status', label: 'Статуси', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
    ]
};

type BotTemplate = 'CLIENT_LEAD' | 'B2B';

const cloneMenu = (config: { buttons: BotMenuButtonConfig[]; welcomeMessage: string }, miniAppUrl: string) => ({
    welcomeMessage: config.welcomeMessage,
    buttons: config.buttons.map(btn =>
        (btn.type === 'LINK' || btn.type === 'WEB_APP') && btn.value === '{{MINI_APP_URL}}'
            ? { ...btn, value: miniAppUrl }
            : { ...btn }
    )
});

export const buildDefaultBotMenuConfig = (template: BotTemplate, miniAppUrl: string) => {
    if (template === 'B2B') return cloneMenu(DEFAULT_B2B_MENU_CONFIG, miniAppUrl);
    return cloneMenu(DEFAULT_MENU_CONFIG, miniAppUrl);
};

export const buildDefaultMiniAppConfig = (template: BotTemplate, miniAppUrl: string, showcaseSlug: string): MiniAppConfig => {
    const base = template === 'B2B' ? DEFAULT_B2B_MINI_APP_CONFIG : DEFAULT_MINI_APP_CONFIG;
    return {
        ...base,
        url: miniAppUrl,
        showcaseSlug
    };
};
