import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  connectorFindUniqueMock,
  channelSourceFindUniqueMock,
  channelSourceUpdateMock,
  connectMock,
  getEntityMock,
  getMessagesMock
} = vi.hoisted(() => ({
  connectorFindUniqueMock: vi.fn(),
  channelSourceFindUniqueMock: vi.fn(),
  channelSourceUpdateMock: vi.fn(),
  connectMock: vi.fn(),
  getEntityMock: vi.fn(),
  getMessagesMock: vi.fn()
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    mTProtoConnector: {
      findUnique: connectorFindUniqueMock
    },
    channelSource: {
      findUnique: channelSourceFindUniqueMock,
      update: channelSourceUpdateMock
    }
  }
}));

vi.mock('telegram/sessions/index.js', () => ({
  StringSession: vi.fn().mockImplementation((value = '') => ({ value }))
}));

vi.mock('telegram/extensions/Logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({ error: vi.fn() }))
}));

vi.mock('telegram', () => {
  class TelegramClient {
    connect = connectMock;
    getEntity = getEntityMock;
    getMessages = getMessagesMock;

    constructor() {}
  }

  return {
    TelegramClient,
    Api: {}
  };
});

describe('MTProtoService.getHistory source status recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.TG_API_ID = '29960572';
    process.env.TG_API_HASH = 'env_hash';
    connectorFindUniqueMock.mockResolvedValue({
      id: 'conn_1',
      sessionString: 'ready-session',
      workspaceApiId: 29960572,
      workspaceApiHash: 'workspace_hash'
    });
    connectMock.mockResolvedValue(undefined);
    getEntityMock.mockResolvedValue({
      className: 'Channel',
      id: BigInt(2913209509),
      username: 'CarTie_Showroom'
    });
    getMessagesMock.mockResolvedValue([
      { id: 1521, date: 1781615765, message: 'BMW X5 2024', className: 'Message' }
    ]);
  });

  it('marks an ERROR channel source ACTIVE after history is read successfully', async () => {
    channelSourceFindUniqueMock.mockResolvedValue({
      id: 'source_1',
      username: 'CarTie_Showroom',
      status: 'ERROR'
    });

    const { MTProtoService } = await import('./mtproto.service.js');
    const messages = await MTProtoService.getHistory('conn_1', '2913209509', 5, 0, undefined, {
      sourceId: 'source_1'
    });

    expect(messages).toHaveLength(1);
    expect(channelSourceUpdateMock).toHaveBeenCalledWith({
      where: { id: 'source_1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        lastError: null,
        lastSyncedAt: expect.any(Date)
      })
    });
  });

  it('clears stale history errors without activating a PAUSED channel source', async () => {
    channelSourceFindUniqueMock.mockResolvedValue({
      id: 'source_paused',
      username: 'cartieimport',
      status: 'PAUSED'
    });

    const { MTProtoService } = await import('./mtproto.service.js');
    await MTProtoService.getHistory('conn_1', '2637732266', 5, 0, undefined, {
      sourceId: 'source_paused'
    });

    expect(channelSourceUpdateMock).toHaveBeenCalledWith({
      where: { id: 'source_paused' },
      data: expect.not.objectContaining({
        status: 'ACTIVE'
      })
    });
    expect(channelSourceUpdateMock).toHaveBeenCalledWith({
      where: { id: 'source_paused' },
      data: expect.objectContaining({
        lastError: null,
        lastSyncedAt: expect.any(Date)
      })
    });
  });
});
