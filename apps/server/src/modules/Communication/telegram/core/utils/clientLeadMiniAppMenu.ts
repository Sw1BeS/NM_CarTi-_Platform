import type { BotConfig } from '@prisma/client';
import { buildMiniAppTelegramLaunchUrl } from './miniappUrl.js';
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
  // Telegram Desktop/macOS may launch reply-keyboard web_app URLs with query params without signed initData.
  // Use a bare canonical app URL here so request writes stay authenticated.
  const appUrl = buildMiniAppTelegramLaunchUrl(bot);

  return {
    keyboard: [
      [
        webAppButton(button(lang, 'leadMenu.stock'), appUrl),
        webAppButton(button(lang, 'leadMenu.transit'), appUrl)
      ],
      [
        webAppButton(button(lang, 'leadMenu.buy'), appUrl),
        webAppButton('❤️ Обрані / Переглянуті', appUrl)
      ],
      [
        webAppButton('📩 Мої запити', appUrl),
        webAppButton(button(lang, 'leadMenu.support'), appUrl)
      ]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
};
