import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosPostMock, mockPrisma } = vi.hoisted(() => {
  return {
    axiosPostMock: vi.fn(),
    mockPrisma: {
      botConfig: {
        findUnique: vi.fn(),
        update: vi.fn()
      }
    }
  };
});

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock
  },
  post: axiosPostMock
}));

vi.mock('../services/prisma.js', () => ({
  prisma: mockPrisma
}));

import { setWebhookForBot } from '../modules/Communication/telegram/core/telegramAdmin.service.js';

describe('Telegram setWebhook allowed updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma.botConfig.findUnique.mockResolvedValue({
      id: 'bot-1',
      token: 'token-1',
      config: {},
      isEnabled: true
    } as any);

    mockPrisma.botConfig.update.mockResolvedValue({} as any);

    axiosPostMock.mockResolvedValue({
      data: {
        ok: true,
        result: true
      }
    });
  });

  it('includes channel and membership updates in allowed_updates', async () => {
    await setWebhookForBot('bot-1', {
      publicBaseUrl: 'https://example.com'
    });

    expect(axiosPostMock).toHaveBeenCalledTimes(1);

    const [, payload] = axiosPostMock.mock.calls[0];
    expect(payload.allowed_updates).toEqual(
      expect.arrayContaining(['channel_post', 'my_chat_member'])
    );
  });
});
