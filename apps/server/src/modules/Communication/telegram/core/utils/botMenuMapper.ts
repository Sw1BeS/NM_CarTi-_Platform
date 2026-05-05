import type { BotConfig } from '@prisma/client';
import { buildMiniAppUrl } from './miniappUrl.js';

export type BotMenuAction =
  | 'view_inventory'
  | 'view_transit'
  | 'view_request'
  | 'view_favorites'
  | 'view_status'
  | 'sell_car'
  | 'support'
  | 'about';

export interface BotMenuButton {
  id: string;
  label: string;
  action: BotMenuAction;
  type: 'web_app' | 'callback';
}

export const DEFAULT_CLIENT_LEAD_MENU_BUTTONS: BotMenuButton[] = [
  { id: 'btn_buy', label: '🚗 Купити авто', action: 'view_request', type: 'web_app' },
  { id: 'btn_inventory', label: '📦 Каталог авто', action: 'view_inventory', type: 'web_app' },
  { id: 'btn_transit', label: '🛳 Авто в дорозі', action: 'view_transit', type: 'web_app' },
  { id: 'btn_favorites', label: '⭐ Обране', action: 'view_favorites', type: 'web_app' },
  { id: 'btn_status', label: '📋 Статус заявки', action: 'view_status', type: 'web_app' },
  { id: 'btn_sell', label: '💰 Продати авто', action: 'sell_car', type: 'web_app' },
  { id: 'btn_support', label: '🧑‍💼 Підтримка', action: 'support', type: 'web_app' },
  { id: 'btn_about', label: 'ℹ️ Про CarTié', action: 'about', type: 'web_app' },
];

export const mapBotActionToMiniAppUrl = (bot: BotConfig, action: BotMenuAction): string => {
  const mapping: Record<BotMenuAction, Record<string, any>> = {
    view_inventory: { entry: 'inventory', status: 'AVAILABLE' },
    view_transit: { entry: 'inventory', status: 'PENDING' },
    view_request: { entry: 'request' },
    view_favorites: { entry: 'favorites' },
    view_status: { entry: 'status' },
    sell_car: { entry: 'request', type: 'SELL' },
    support: { entry: 'support' },
    about: { entry: 'about' },
  };

  const filters = mapping[action] || {};
  return buildMiniAppUrl(bot, filters);
};

export const buildMenuButtonKeyboard = (bot: BotConfig, buttons: BotMenuButton[]): any[] => {
  const keyboard: any[] = [];

  for (const button of buttons) {
    if (button.type === 'web_app') {
      const url = mapBotActionToMiniAppUrl(bot, button.action);
      keyboard.push([{ text: button.label, web_app: { url } }]);
    }
  }

  return keyboard;
};

export const getPrimaryMenuButton = (buttons: BotMenuButton[]): BotMenuButton => {
  return buttons.find(btn => btn.action === 'view_inventory') || buttons[0];
};
