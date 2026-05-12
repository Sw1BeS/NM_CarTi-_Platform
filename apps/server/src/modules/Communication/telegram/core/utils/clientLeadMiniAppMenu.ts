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
  const sellUrl = buildMiniAppUrl(bot, { entry: 'request', type: 'SELL' });
  const stockUrl = buildMiniAppUrl(bot, { entry: 'inventory', status: 'AVAILABLE' });
  const transitUrl = buildMiniAppUrl(bot, { entry: 'inventory', status: 'PENDING' });
  const favoritesUrl = buildMiniAppUrl(bot, { entry: 'favorites' });
  const contactsUrl = buildMiniAppUrl(bot, { entry: 'contacts' });

  return {
    keyboard: [
      [
        webAppButton(button(lang, 'leadMenu.buy'), pickUrl),
        webAppButton(button(lang, 'leadMenu.sell'), sellUrl)
      ],
      [
        webAppButton(button(lang, 'leadMenu.stock'), stockUrl),
        webAppButton(button(lang, 'leadMenu.transit'), transitUrl)
      ],
      [
        webAppButton('⭐ Обране', favoritesUrl),
        webAppButton('📞 Контакти', contactsUrl)
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
};
