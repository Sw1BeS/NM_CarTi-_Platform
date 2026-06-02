import { describe, expect, it } from 'vitest';
import {
  createClientLeadMiniAppAuthToken,
  verifyClientLeadMiniAppAuthToken
} from './clientLeadMiniAppAuth.js';

describe('clientLeadMiniAppAuth', () => {
  it('signs and verifies a scoped B2C reply-keyboard MiniApp auth token', () => {
    const token = createClientLeadMiniAppAuthToken({
      botId: 'bot_1',
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      username: 'client',
      name: 'Client User',
      lang: 'UK',
      ttlSeconds: 3600
    });

    expect(token).toMatch(/^v1\./);
    const result = verifyClientLeadMiniAppAuthToken(token, {
      botId: 'bot_1',
      companyId: 'company_1'
    });

    expect(result).toMatchObject({
      ok: true,
      payload: expect.objectContaining({
        typ: 'client_lead_reply_keyboard',
        botId: 'bot_1',
        companyId: 'company_1',
        chatId: '1001',
        userId: '1001',
        username: 'client'
      })
    });
  });

  it('rejects expired and wrong-scope tokens', () => {
    const token = createClientLeadMiniAppAuthToken({
      botId: 'bot_1',
      companyId: 'company_1',
      chatId: '1001',
      userId: '1001',
      now: new Date('2026-06-02T00:00:00Z'),
      ttlSeconds: 60
    });

    expect(verifyClientLeadMiniAppAuthToken(token, {
      botId: 'bot_1',
      now: new Date('2026-06-02T00:02:00Z')
    })).toEqual({ ok: false, reason: 'expired' });
    expect(verifyClientLeadMiniAppAuthToken(token, {
      botId: 'bot_2',
      now: new Date('2026-06-02T00:00:30Z')
    })).toEqual({ ok: false, reason: 'scope_mismatch' });
  });
});
