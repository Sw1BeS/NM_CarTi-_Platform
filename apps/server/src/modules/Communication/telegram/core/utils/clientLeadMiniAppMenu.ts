import type { BotConfig } from '@prisma/client';
import { button, type Lang } from './telegramText.js';
import { buildMiniAppTelegramLaunchUrl, type MiniAppFilters } from './miniappUrl.js';

type TelegramKeyboardButton = {
  text: string;
  web_app?: { url: string };
};

type TelegramReplyKeyboard = {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard: true;
  is_persistent: true;
};

export const buildClientLeadMiniAppKeyboard = (bot: BotConfig, lang: Lang): TelegramReplyKeyboard => {
  const miniAppButton = (text: string, filters: MiniAppFilters): TelegramKeyboardButton => {
    const url = buildMiniAppTelegramLaunchUrl(bot, filters);
    return url ? { text, web_app: { url } } : { text };
  };

  return {
    keyboard: [
      [
        miniAppButton(button(lang, 'leadMenu.stock'), {
          entry: 'inventory',
          status: 'AVAILABLE',
          availabilityState: 'IN_STOCK'
        }),
        miniAppButton(button(lang, 'leadMenu.transit'), {
          entry: 'inventory',
          status: 'PENDING',
          availabilityState: 'IN_TRANSIT'
        })
      ],
      [
        miniAppButton(button(lang, 'leadMenu.buy'), {
          entry: 'request',
          type: 'BUY'
        }),
        miniAppButton('❤️ Обрані / Переглянуті', {
          entry: 'favorites'
        })
      ],
      [
        { text: '📩 Мої запити' },
        miniAppButton(button(lang, 'leadMenu.support'), {
          entry: 'contacts'
        })
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
};
