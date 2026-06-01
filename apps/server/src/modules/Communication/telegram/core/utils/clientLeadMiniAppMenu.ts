import type { BotConfig } from '@prisma/client';
import { button, type Lang } from './telegramText.js';

type TelegramKeyboardButton = {
  text: string;
};

type TelegramReplyKeyboard = {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard: true;
  is_persistent: true;
};

export const buildClientLeadMiniAppKeyboard = (bot: BotConfig, lang: Lang): TelegramReplyKeyboard => {
  void bot;

  return {
    keyboard: [
      [
        { text: button(lang, 'leadMenu.stock') },
        { text: button(lang, 'leadMenu.transit') }
      ],
      [
        { text: button(lang, 'leadMenu.buy') },
        { text: '❤️ Обрані / Переглянуті' }
      ],
      [
        { text: '📩 Мої запити' },
        { text: button(lang, 'leadMenu.support') }
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
};
