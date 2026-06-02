import { describe, expect, it } from 'vitest';
import { buildClientLeadMiniAppKeyboard } from './clientLeadMiniAppMenu.js';

describe('clientLeadMiniAppMenu', () => {
  it('builds a persistent two-column menu with direct MiniApp web_app buttons', () => {
    const markup = buildClientLeadMiniAppKeyboard({
      config: {
        miniAppConfig: { url: 'https://example.com/p/app/cartie' },
        defaultShowcaseSlug: 'cartie'
      }
    } as any, 'UK');

    expect(markup.inline_keyboard).toBeUndefined();
    expect(markup.keyboard).toHaveLength(3);
    expect(markup.keyboard.map(row => row.length)).toEqual([2, 2, 2]);
    expect(markup.resize_keyboard).toBe(true);
    expect(markup.is_persistent).toBe(true);

    const flat = markup.keyboard.flat();

    expect(flat[0].text).toContain('Авто в наявності');
    expect(flat[1].text).toContain('Авто в дорозі');
    expect(flat[4].text).toContain('Мої запити');
    expect(flat[5].text).toContain('менеджером');
    expect(flat.filter(button => button.web_app)).toHaveLength(5);
    expect(flat[4].web_app).toBeUndefined();
    expect(flat.filter(button => button.web_app).every(button => button.web_app?.url?.startsWith('https://example.com/p/app/cartie'))).toBe(true);

    const stockUrl = new URL(flat[0].web_app!.url);
    expect(stockUrl.searchParams.get('entry')).toBe('inventory');
    expect(stockUrl.searchParams.get('status')).toBe('AVAILABLE');
    expect(stockUrl.searchParams.get('availabilityState')).toBe('IN_STOCK');

    const transitUrl = new URL(flat[1].web_app!.url);
    expect(transitUrl.searchParams.get('entry')).toBe('inventory');
    expect(transitUrl.searchParams.get('status')).toBe('PENDING');
    expect(transitUrl.searchParams.get('availabilityState')).toBe('IN_TRANSIT');

    const requestUrl = new URL(flat[2].web_app!.url);
    expect(requestUrl.searchParams.get('entry')).toBe('request');
    expect(requestUrl.searchParams.get('type')).toBe('BUY');

    const contactsUrl = new URL(flat[5].web_app!.url);
    expect(contactsUrl.searchParams.get('entry')).toBe('contacts');
    expect(contactsUrl.searchParams.has('v')).toBe(false);
  });
});
