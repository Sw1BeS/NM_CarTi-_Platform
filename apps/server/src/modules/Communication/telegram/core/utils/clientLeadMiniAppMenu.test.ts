import { describe, expect, it } from 'vitest';
import { buildClientLeadMiniAppKeyboard } from './clientLeadMiniAppMenu.js';

describe('clientLeadMiniAppMenu', () => {
  it('builds a two-column keyboard and keeps sell bot-native', () => {
    const keyboard = buildClientLeadMiniAppKeyboard({
      config: {
        miniAppConfig: { url: 'https://example.com/p/app/cartie' },
        defaultShowcaseSlug: 'cartie'
      }
    } as any, 'UK');

    expect(keyboard).toHaveLength(3);
    expect(keyboard.map(row => row.length)).toEqual([2, 2, 2]);

    const flat = keyboard.flat();
    expect(flat[0].web_app.url).toContain('entry=request');
    expect(flat[0].web_app.url).toContain('type=BUY');
    expect(flat[1].text).toContain('Продати');
    expect(flat[1].web_app).toBeUndefined();
    expect(flat[2].web_app.url).toContain('status=AVAILABLE');
    expect(flat[3].web_app.url).toContain('status=PENDING');
    expect(flat[4].web_app.url).toContain('entry=favorites');
    expect(flat[5].web_app.url).toContain('entry=support');
  });
});
