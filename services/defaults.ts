import { BotMenuButtonConfig, MiniAppConfig } from '../types';

export const DEFAULT_MENU_CONFIG: { buttons: BotMenuButtonConfig[]; welcomeMessage: string } = {
    welcomeMessage: "👋 Welcome to CarTié Concierge!\n\nWe provide premium car sourcing and selling services.\nHow can we help you today?",
    buttons: [
        { id: 'btn_buy', label: '🚗 Buy a Car', label_uk: '🚗 Купити авто', label_ru: '🚗 Купить авто', type: 'SCENARIO', value: 'scn_buy', row: 0, col: 0 },
        { id: 'btn_sell', label: '💰 Sell My Car', label_uk: '💰 Продати авто', label_ru: '💰 Продать авто', type: 'SCENARIO', value: 'scn_sell', row: 0, col: 1 },
        { id: 'btn_app', label: '📱 Open App', label_uk: '📱 Додаток', label_ru: '📱 Приложение', type: 'LINK', value: 'https://t.me/cartie_bot/app', row: 1, col: 0 },
        { id: 'btn_sup', label: '📞 Support', label_uk: '📞 Підтримка', label_ru: '📞 Поддержка', type: 'SCENARIO', value: 'scn_support', row: 2, col: 0 },
        { id: 'btn_lang', label: '🌐 Language', label_uk: '🌐 Мова', label_ru: '🌐 Язык', type: 'SCENARIO', value: 'scn_lang', row: 2, col: 1 }
    ]
};

export const DEFAULT_MINI_APP_CONFIG: MiniAppConfig = {
    isEnabled: true,
    title: 'CarTié Premium',
    welcomeText: 'Your personal automotive concierge.',
    primaryColor: '#D4AF37',
    layout: 'GRID',
    actions: [
        { id: 'act_stock', label: 'Stock', icon: 'Grid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'act_req', label: 'Request', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
        { id: 'act_chat', label: 'Chat', icon: 'MessageCircle', actionType: 'LINK', value: 'https://t.me/cartie_manager' },
        { id: 'act_sell', label: 'Trade-In', icon: 'DollarSign', actionType: 'SCENARIO', value: 'scn_sell' }
    ]
};
