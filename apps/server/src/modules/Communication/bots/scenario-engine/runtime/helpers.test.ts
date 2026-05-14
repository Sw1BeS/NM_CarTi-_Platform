import { describe, expect, it } from 'vitest';
import { resolveMenuLink } from './helpers.js';
import type { BotRuntime } from '../types.js';

const bot = {
  id: 'bot_1',
  token: 'token',
  config: {
    miniAppConfig: {
      url: 'https://example.com/p/app/cartie?theme=dark'
    },
    defaultShowcaseSlug: 'cartie'
  }
} satisfies BotRuntime;

describe('scenario-engine runtime helpers', () => {
  it('normalizes Telegram MiniApp aliases while preserving startapp filters and query params', () => {
    const url = new URL(resolveMenuLink(
      bot,
      'https://t.me/cartie_bot/app?startapp=view_transit&utm_source=menu'
    ));

    expect(url.origin).toBe('https://example.com');
    expect(url.pathname).toBe('/p/app/cartie');
    expect(url.searchParams.get('theme')).toBe('dark');
    expect(url.searchParams.get('entry')).toBe('inventory');
    expect(url.searchParams.get('status')).toBe('PENDING');
    expect(url.searchParams.get('utm_source')).toBe('menu');
  });
});
