import { describe, expect, it } from 'vitest';
import { buildClientLeadMiniAppKeyboard } from './clientLeadMiniAppMenu.js';

describe('clientLeadMiniAppMenu', () => {
  it('builds a persistent two-column reply menu whose buttons open MiniApp sections', () => {
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
    expect(flat[0].web_app.url).toContain('status=AVAILABLE');
    expect(flat[1].text).toContain('Авто в дорозі');
    expect(flat[1].web_app.url).toContain('status=PENDING');
    expect(flat[2].web_app.url).toContain('entry=request');
    expect(flat[2].web_app.url).toContain('type=BUY');
    expect(flat[3].web_app.url).toContain('entry=favorites');
    expect(flat[4].text).toContain('Мої запити');
    expect(flat[4].web_app.url).toContain('entry=status');
    expect(flat[5].text).toContain('менеджером');
    expect(flat[5].web_app.url).toContain('entry=contacts');
  });
});
