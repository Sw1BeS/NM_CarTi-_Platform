import type { BotConfig } from '@prisma/client';
import { buildMiniAppUrl } from './miniappUrl.js';
import { button, type Lang } from './telegramText.js';
import { ActionTokens, buildCallbackData } from './callbackUtils.js';

type TelegramInlineButton = {
  text: string;
  web_app?: { url: string };
  callback_data?: string;
};

const webAppButton = (text: string, url: string): TelegramInlineButton => {
  return url ? { text, web_app: { url } } : { text };
};

export const buildClientLeadMiniAppKeyboard = (bot: BotConfig, lang: Lang): { inline_keyboard: TelegramInlineButton[][] } => {
  const pickUrl = buildMiniAppUrl(bot, { entry: 'request', type: 'BUY' });
  const stockUrl = buildMiniAppUrl(bot, { entry: 'inventory', status: 'AVAILABLE' });
  const transitUrl = buildMiniAppUrl(bot, { entry: 'inventory', status: 'PENDING' });
  const favoritesUrl = buildMiniAppUrl(bot, { entry: 'favorites' });
  const supportUrl = buildMiniAppUrl(bot, { entry: 'support' });

  return {
    inline_keyboard: [
      [
        webAppButton(button(lang, 'leadMenu.buy'), pickUrl),
        { text: button(lang, 'leadMenu.sell'), callback_data: buildCallbackData(ActionTokens.CL_SELL) }
      ],
      [
        webAppButton(button(lang, 'leadMenu.stock'), stockUrl),
        webAppButton(button(lang, 'leadMenu.transit'), transitUrl)
      ],
      [
        webAppButton('⭐ Обране', favoritesUrl),
        webAppButton(button(lang, 'leadMenu.support'), supportUrl)
      ]
    ]
  };
};
