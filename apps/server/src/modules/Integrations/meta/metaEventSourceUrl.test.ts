import { describe, expect, it } from 'vitest';
import { sanitizeMetaEventSourceUrl } from './metaEventSourceUrl.js';

describe('sanitizeMetaEventSourceUrl', () => {
  it('removes Telegram and initData auth params while keeping campaign params', () => {
    const result = sanitizeMetaEventSourceUrl(
      'https://cartie.test/p/app/cartie?utm_source=meta&fbclid=ClickId&fbp=fb.1.123&fbc=fb.1.456&tgWebAppData=secret&initData=raw&init_data=raw2&telegramInitData=raw3&telegram_init_data=raw4&hash=hash&signature=sig&auth_date=1&query_id=q&user=raw_user#tgWebAppData=fragment'
    );

    expect(result).toBe('https://cartie.test/p/app/cartie?utm_source=meta&fbclid=ClickId&fbp=fb.1.123&fbc=fb.1.456');
  });
});
