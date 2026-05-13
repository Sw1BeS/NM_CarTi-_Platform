import { describe, expect, it } from 'vitest';
import { assertTelegramApiOk, extractChatMenuButtonUrl } from './chatMenuSync.js';

describe('chatMenuSync utilities', () => {
  it('extracts web_app menu URLs from Telegram getChatMenuButton shapes', () => {
    expect(extractChatMenuButtonUrl({
      ok: true,
      result: {
        type: 'web_app',
        web_app: { url: 'https://cartie.test/p/app/cartie?v=fresh' }
      }
    })).toBe('https://cartie.test/p/app/cartie?v=fresh');

    expect(extractChatMenuButtonUrl({
      ok: true,
      result: {
        menu_button: {
          type: 'web_app',
          web_app: { url: 'https://cartie.test/p/app/b2b?v=fresh' }
        }
      }
    })).toBe('https://cartie.test/p/app/b2b?v=fresh');
  });

  it('throws on Telegram JSON failures even when HTTP request resolved', () => {
    expect(() => assertTelegramApiOk('setChatMenuButton', {
      ok: false,
      error_code: 400,
      description: 'Bad Request: invalid menu button URL'
    })).toThrow('setChatMenuButton failed: Bad Request: invalid menu button URL');
  });
});
