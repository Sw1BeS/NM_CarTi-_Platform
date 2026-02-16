import { BotMenuButtonConfig, MiniAppConfig } from '../types';

export const DEFAULT_MENU_CONFIG: { buttons: BotMenuButtonConfig[]; welcomeMessage: string } = {
    welcomeMessage: "👋 Welcome to CarTié Concierge!\n\nWe provide premium car sourcing and selling services.\nHow can we help you today?",
    buttons: [
        { id: 'btn_buy', label: '🚗 Buy a Car', label_uk: '🚗 Купити авто', label_ru: '🚗 Купить авто', type: 'SCENARIO', value: 'scn_buy', row: 0, col: 0 },
        { id: 'btn_sell', label: '💰 Sell My Car', label_uk: '💰 Продати авто', label_ru: '💰 Продать авто', type: 'SCENARIO', value: 'scn_sell', row: 0, col: 1 },
        { id: 'btn_app', label: '📱 Open App', label_uk: '📱 Додаток', label_ru: '📱 Приложение', type: 'WEB_APP', value: '{{MINI_APP_URL}}', row: 1, col: 0 },
        { id: 'btn_sup', label: '📞 Support', label_uk: '📞 Підтримка', label_ru: '📞 Поддержка', type: 'SCENARIO', value: 'scn_support', row: 2, col: 0 },
        { id: 'btn_lang', label: '🌐 Language', label_uk: '🌐 Мова', label_ru: '🌐 Язык', type: 'SCENARIO', value: 'scn_lang', row: 2, col: 1 }
    ]
};

export const DEFAULT_B2B_MENU_CONFIG: { buttons: BotMenuButtonConfig[]; welcomeMessage: string } = {
    welcomeMessage: "🤝 CarDealer Lviv B2B\n\nCreate a structured request and get offers from partner dealers.",
    buttons: [
        { id: 'btn_b2b_req', label: '📝 Створити запит', label_uk: '📝 Створити запит', label_ru: '📝 Создать запрос', type: 'TEXT', value: '/request', row: 0, col: 0 },
        { id: 'btn_b2b_app', label: '📱 Mini App', label_uk: '📱 Mini App', label_ru: '📱 Mini App', type: 'WEB_APP', value: '{{MINI_APP_URL}}', row: 0, col: 1 },
        { id: 'btn_b2b_menu', label: '🏠 Меню', label_uk: '🏠 Меню', label_ru: '🏠 Меню', type: 'TEXT', value: '/menu', row: 1, col: 0 }
    ]
};

export const DEFAULT_MINI_APP_CONFIG: MiniAppConfig = {
    isEnabled: true,
    title: 'CarTié Premium',
    welcomeText: 'Your personal automotive concierge.',
    primaryColor: '#D4AF37',
    accentColor: '#111111',
    layout: 'GRID',
    actions: [
        { id: 'act_stock', label: 'Stock', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'act_req', label: 'Request', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
        { id: 'act_chat', label: 'Chat', icon: 'MessageCircle', actionType: 'LINK', value: 'https://t.me/cartie_manager' },
        { id: 'act_sell', label: 'Trade-In', icon: 'DollarSign', actionType: 'SCENARIO', value: 'scn_sell' }
    ],
    navItems: [
        { id: 'nav_home', label: 'Home', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
        { id: 'nav_stock', label: 'Stock', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'nav_saved', label: 'Saved', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
        { id: 'nav_request', label: 'Request', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
        { id: 'nav_status', label: 'Status', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
    ]
};

export const DEFAULT_B2B_MINI_APP_CONFIG: MiniAppConfig = {
    isEnabled: true,
    title: 'CarDealer Lviv B2B',
    welcomeText: 'Live inventory and partner request tracking.',
    primaryColor: '#D4AF37',
    accentColor: '#111111',
    layout: 'GRID',
    actions: [
        { id: 'act_stock', label: 'Inventory', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'act_fav', label: 'Favorites', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
        { id: 'act_status', label: 'Status', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
    ],
    navItems: [
        { id: 'nav_home', label: 'Home', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
        { id: 'nav_stock', label: 'Stock', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'nav_saved', label: 'Saved', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
        { id: 'nav_status', label: 'Status', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
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
