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

export const DEFAULT_MINI_APP_CONFIG: MiniAppConfig = {
    isEnabled: true,
    title: 'CarTié Inventory',
    welcomeText: 'Browse the latest arrivals.',
    tagline: 'Curated stock. Updated daily.',
    primaryColor: '#D4AF37',
    accentColor: '#111111',
    ctaLabel: 'Request details',
    styleVariant: 'NOIR',
    layout: 'GRID',
    actions: [
        { id: 'act_stock', label: 'Inventory', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'act_saved', label: 'Favorites', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' }
    ],
    navItems: [
        { id: 'nav_home', label: 'Home', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
        { id: 'nav_stock', label: 'Stock', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'nav_saved', label: 'Saved', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' }
    ]
};
