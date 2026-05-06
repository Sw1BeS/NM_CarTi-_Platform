import crypto from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const botConfigMock = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn()
}));

vi.mock('./prisma.js', () => ({
  prisma: {
    botConfig: botConfigMock
  }
}));

const signInitData = (botToken: string, userId = 123456) => {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `test_${userId}`,
    user: JSON.stringify({ id: userId, first_name: 'Test' })
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
};

describe('miniAppAuth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts initData signed by another enabled bot in the same company', async () => {
    const { verifyMiniAppInitDataForScope } = await import('./miniAppAuth.service.js');
    const initData = signInitData('b2b-token');

    botConfigMock.findFirst.mockResolvedValue({ id: 'client-bot', token: 'client-token' });
    botConfigMock.findMany.mockResolvedValue([{ id: 'b2b-bot', token: 'b2b-token' }]);

    const result = await verifyMiniAppInitDataForScope(initData, {
      companyId: 'workspace-1',
      botId: 'client-bot'
    }, 43200);

    expect(result).toEqual({ ok: true, verifiedBotId: 'b2b-bot', matchedBy: 'company' });
    expect(botConfigMock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'workspace-1',
        id: { not: 'client-bot' }
      })
    }));
  });

  it('rejects initData that is not signed by a bot in scope', async () => {
    const { verifyMiniAppInitDataForScope } = await import('./miniAppAuth.service.js');
    const initData = signInitData('outside-token');

    botConfigMock.findFirst.mockResolvedValue({ id: 'client-bot', token: 'client-token' });
    botConfigMock.findMany.mockResolvedValue([{ id: 'b2b-bot', token: 'b2b-token' }]);

    const result = await verifyMiniAppInitDataForScope(initData, {
      companyId: 'workspace-1',
      botId: 'client-bot'
    }, 43200);

    expect(result).toEqual({ ok: false, message: 'Invalid Telegram init data' });
  });
});
