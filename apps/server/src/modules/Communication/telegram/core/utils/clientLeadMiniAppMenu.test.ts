import { describe, expect, it } from 'vitest';
import { buildClientLeadMiniAppKeyboard } from './clientLeadMiniAppMenu.js';

describe('clientLeadMiniAppMenu', () => {
  it('builds a persistent two-column text menu without reply-keyboard web_app buttons', () => {
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
    expect(flat.every(button => 'web_app' in button === false)).toBe(true);
  });
});
