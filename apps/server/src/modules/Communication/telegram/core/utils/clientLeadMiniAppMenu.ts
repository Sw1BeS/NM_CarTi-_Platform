import type { BotConfig } from '@prisma/client';
import { button, type Lang } from './telegramText.js';
import { buildMiniAppTelegramLaunchUrl, type MiniAppFilters } from './miniappUrl.js';
import { createClientLeadMiniAppAuthToken, type ClientLeadMiniAppAuthInput } from './clientLeadMiniAppAuth.js';

type TelegramKeyboardButton = {
  text: string;
  web_app?: { url: string };
};

type TelegramReplyKeyboard = {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard: true;
  is_persistent: true;
};

const withHashParam = (rawUrl: string, key: string, value?: string) => {
  if (!value) return rawUrl;
  try {
    const url = new URL(rawUrl);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    hashParams.set(key, value);
    url.hash = hashParams.toString();
    return url.toString();
  } catch {
    return rawUrl;
  }
};

export const buildClientLeadMiniAppKeyboard = (
  bot: BotConfig,
  lang: Lang,
  auth?: Omit<ClientLeadMiniAppAuthInput, 'botId' | 'companyId' | 'lang'>
): TelegramReplyKeyboard => {
  const authToken = createClientLeadMiniAppAuthToken({
    botId: bot.id,
    companyId: bot.companyId,
    lang,
    ...auth
  });
  const miniAppButton = (text: string, filters: MiniAppFilters): TelegramKeyboardButton => {
    const url = buildMiniAppTelegramLaunchUrl(bot, filters);
    return url ? { text, web_app: { url: withHashParam(url, 'kbAuth', authToken) } } : { text };
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
