import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyTelegramInitData } from './telegramAuth.js';

const buildDataCheckString = (params: URLSearchParams) => Array.from(params.entries())
  .filter(([key]) => key !== 'hash')
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

const signMiniAppInitData = (botToken: string) => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAEAAAE-test',
    user: JSON.stringify({ id: 219480233, first_name: 'Ivan', username: 'cartie_test' })
  });
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(buildDataCheckString(params)).digest('hex'));
  return params.toString();
};

const signLegacyLoginWidgetStyle = (botToken: string) => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAEAAAE-test',
    user: JSON.stringify({ id: 219480233, first_name: 'Ivan', username: 'cartie_test' })
  });
  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secretKey).update(buildDataCheckString(params)).digest('hex'));
  return params.toString();
};

describe('telegramAuth MiniApp initData validation', () => {
  it('accepts Telegram Mini App initData signed with the WebAppData HMAC secret', () => {
    expect(verifyTelegramInitData(signMiniAppInitData('123:miniapp-token'), '123:miniapp-token', 43200)).toBe(true);
  });

  it('rejects Login Widget style hashes for Mini App initData', () => {
    expect(verifyTelegramInitData(signLegacyLoginWidgetStyle('123:miniapp-token'), '123:miniapp-token', 43200)).toBe(false);
  });
});
