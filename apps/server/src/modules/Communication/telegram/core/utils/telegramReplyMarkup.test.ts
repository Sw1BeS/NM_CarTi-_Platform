import { describe, expect, it } from 'vitest';
import {
  buildOpenBotAndMiniAppKeyboard,
  isPrivateChatId,
  resolveReplyMarkupForChat
} from './telegramReplyMarkup.js';

describe('telegramReplyMarkup', () => {
  const bot = {
    config: {
      botUsername: 'Cartie_Client_Bot',
      miniAppConfig: {
        url: 'https://example.com/p/app/cartie'
      }
    }
  } as any;

  it('keeps reply keyboard in private chat', () => {
    const markup = resolveReplyMarkupForChat({
      bot,
      chatType: 'private',
      replyMarkup: {
        keyboard: [[{ text: 'Button' }]],
        resize_keyboard: true
      }
    });

    expect(markup?.keyboard).toBeTruthy();
  });

  it('replaces reply keyboard in supergroup with inline open buttons', () => {
    const markup = resolveReplyMarkupForChat({
      bot,
      chatType: 'supergroup',
      replyMarkup: {
        keyboard: [[{ text: 'Button' }]],
        resize_keyboard: true
      }
    });

    expect(markup?.inline_keyboard).toBeTruthy();
    expect(markup.inline_keyboard[0][0].text).toBe('Відкрити бота');
    expect(markup.inline_keyboard[1][0].url).toBe('https://t.me/Cartie_Client_Bot/app?startapp=home');
  });

  it('preserves MiniApp intent when downgrading group web_app buttons to direct links', () => {
    const markup = resolveReplyMarkupForChat({
      bot,
      chatType: 'supergroup',
      replyMarkup: {
        inline_keyboard: [[
          {
            text: 'Авто в дорозі',
            web_app: { url: 'https://example.com/p/app/cartie?entry=inventory&status=PENDING' }
          },
          {
            text: 'Продати авто',
            web_app: { url: 'https://example.com/p/app/cartie?entry=request&type=SELL' }
          }
        ]]
      }
    });

    expect(markup.inline_keyboard[0][0].url).toBe('https://t.me/Cartie_Client_Bot/app?startapp=view_transit');
    expect(markup.inline_keyboard[0][1].url).toBe('https://t.me/Cartie_Client_Bot/app?startapp=sell_car');
  });

  it('detects private vs group by chat id when type missing', () => {
    expect(isPrivateChatId('219480233')).toBe(true);
    expect(isPrivateChatId('-1003785260526')).toBe(false);
  });

  it('builds inline open actions keyboard', () => {
    const markup = buildOpenBotAndMiniAppKeyboard(bot, { preferWebAppButton: true });
    expect(markup?.inline_keyboard?.length).toBeGreaterThan(0);
  });
});
