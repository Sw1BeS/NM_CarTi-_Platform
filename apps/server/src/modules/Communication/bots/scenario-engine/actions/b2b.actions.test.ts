import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  b2bRequestFindFirstMock,
  requestVariantCreateMock,
  messageLogCreateMock,
  notifyQueuesMock,
  saveTelegramBotFileMock,
  sendMessageMock,
  sendMediaGroupMock,
  sendPhotoMock
} = vi.hoisted(() => ({
  b2bRequestFindFirstMock: vi.fn(),
  requestVariantCreateMock: vi.fn(),
  messageLogCreateMock: vi.fn(),
  notifyQueuesMock: vi.fn(),
  saveTelegramBotFileMock: vi.fn(),
  sendMessageMock: vi.fn(),
  sendMediaGroupMock: vi.fn(),
  sendPhotoMock: vi.fn()
}));

vi.mock('../../../../../services/prisma.js', () => ({
  prisma: {
    b2bRequest: {
      findFirst: b2bRequestFindFirstMock
    },
    requestVariant: {
      create: requestVariantCreateMock
    },
    messageLog: {
      create: messageLogCreateMock
    }
  }
}));

vi.mock('../../../../../services/mediaStorage.service.js', () => ({
  saveTelegramBotFile: saveTelegramBotFileMock
}));

vi.mock('../../../../../services/b2bRouting.service.js', () => ({
  b2bRoutingService: {
    notifyQueues: notifyQueuesMock
  }
}));

vi.mock('../../../../../services/cardRenderer.js', () => ({
  managerActionsKeyboard: vi.fn(() => ({ inline_keyboard: [] })),
  renderRequestCard: vi.fn(() => 'request-card'),
  renderVariantCard: vi.fn(() => 'variant-card')
}));

vi.mock('../../../telegram/messaging/outbox/telegramOutbox.js', () => ({
  telegramOutbox: {
    sendMediaGroup: sendMediaGroupMock,
    sendPhoto: sendPhotoMock
  }
}));

vi.mock('../adapters/telegram.adapter.js', () => ({
  sendMessage: sendMessageMock
}));

import { createVariantAndRoute } from './b2b.actions.js';

describe('createVariantAndRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    b2bRequestFindFirstMock.mockResolvedValue({
      id: 'req_1',
      publicId: 'R-1',
      title: 'BMW X5',
      requesterPartnerId: null,
      chatId: null
    });
    requestVariantCreateMock.mockImplementation(async ({ data }: any) => ({
      id: 'var_1',
      ...data
    }));
    messageLogCreateMock.mockResolvedValue({});
    notifyQueuesMock.mockResolvedValue({});
    saveTelegramBotFileMock.mockResolvedValue({
      url: '/media/cmp_1/1001/unknown/photo_1.jpg',
      path: '/srv/cartie/storage/media/cmp_1/1001/unknown/photo_1.jpg',
      fileId: 'tg_photo_1',
      filePath: 'photos/file_1.jpg'
    });
  });

  it('materializes Telegram photo file ids into public media URLs for MiniApp variants', async () => {
    const result = await createVariantAndRoute({
      bot: {
        id: 'bot_1',
        token: 'bot-token',
        companyId: 'cmp_1'
      } as any,
      requestRef: 'R-1',
      chatId: '1001',
      userId: '1001',
      variantInput: {
        title: 'BMW X5 2020',
        source: 'DEALER',
        thumbnail: 'tg_photo_1',
        mediaUrls: [],
        mediaItems: [{ tgFileId: 'tg_photo_1', source: 'TELEGRAM_BOT' }]
      },
      photoFileIds: ['tg_photo_1']
    });

    expect(result.ok).toBe(true);
    expect(saveTelegramBotFileMock).toHaveBeenCalledWith('bot-token', 'tg_photo_1', {
      companyId: 'cmp_1',
      sourceChatId: '1001'
    });

    const createArg = requestVariantCreateMock.mock.calls[0][0];
    expect(createArg.data.thumbnail).toBe('/media/cmp_1/1001/unknown/photo_1.jpg');
    expect(createArg.data.mediaUrls).toEqual(['/media/cmp_1/1001/unknown/photo_1.jpg']);
    expect(createArg.data.mediaItems).toEqual([{
      tgFileId: 'tg_photo_1',
      source: 'TELEGRAM_BOT',
      url: '/media/cmp_1/1001/unknown/photo_1.jpg',
      previewUrl: '/media/cmp_1/1001/unknown/photo_1.jpg'
    }]);
  });
});
