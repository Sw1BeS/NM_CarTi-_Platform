import type { BotConfig } from '@prisma/client';
import { buildMiniAppUrl } from './miniappUrl.js';
import { button, type Lang } from './telegramText.js';

type TelegramKeyboardButton = {
  text: string;
  web_app?: { url: string };
};

type TelegramReplyKeyboard = {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard: true;
  is_persistent: true;
};

const webAppButton = (text: string, url: string): TelegramKeyboardButton => {
  return url ? { text, web_app: { url } } : { text };
};

export const buildClientLeadMiniAppKeyboard = (bot: BotConfig, lang: Lang): TelegramReplyKeyboard => {
  const pickUrl = buildMiniAppUrl(bot, { entry: 'request', type: 'BUY' });
  const stockUrl = buildMiniAppUrl(bot, { entry: 'inventory', status: 'AVAILABLE', availabilityState: 'IN_STOCK' });
  const transitUrl = buildMiniAppUrl(bot, { entry: 'inventory', status: 'PENDING', availabilityState: 'IN_TRANSIT' });
  const favoritesUrl = buildMiniAppUrl(bot, { entry: 'favorites' });
  const requestsUrl = buildMiniAppUrl(bot, { entry: 'status' });
  const contactsUrl = buildMiniAppUrl(bot, { entry: 'contacts' });

  return {
    keyboard: [
      [
        webAppButton(button(lang, 'leadMenu.stock'), stockUrl),
        webAppButton(button(lang, 'leadMenu.transit'), transitUrl)
      ],
      [
        webAppButton(button(lang, 'leadMenu.buy'), pickUrl),
        webAppButton('❤️ Обрані / Переглянуті', favoritesUrl)
      ],
      [
        webAppButton('📩 Мої запити', requestsUrl),
        webAppButton(button(lang, 'leadMenu.support'), contactsUrl)
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
};
