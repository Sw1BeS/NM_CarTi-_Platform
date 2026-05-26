import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  connectorFindManyMock,
  connectorUpdateMock,
  getClientMock,
  forgetClientMock
} = vi.hoisted(() => ({
  connectorFindManyMock: vi.fn(),
  connectorUpdateMock: vi.fn(),
  getClientMock: vi.fn(),
  forgetClientMock: vi.fn()
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    mTProtoConnector: {
      findMany: connectorFindManyMock,
      update: connectorUpdateMock
    }
  }
}));

vi.mock('./mtproto.service.js', () => ({
  MTProtoService: {
    getClient: getClientMock,
    forgetClient: forgetClientMock
  }
}));

describe('MTProtoLifeCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connectorUpdateMock.mockResolvedValue({});
    forgetClientMock.mockResolvedValue(undefined);
  });

  it('marks revoked sessions as ERROR and clears the stored session during restore', async () => {
    connectorFindManyMock.mockResolvedValue([{
      id: 'conn_revoked',
      name: '+380980066466',
      phone: '+380980066466'
    }]);
    getClientMock.mockResolvedValue({
      connect: vi.fn().mockResolvedValue(undefined),
      getMe: vi.fn().mockRejectedValue(new Error('401: SESSION_REVOKED (caused by users.GetUsers)'))
    });

    const { MTProtoLifeCycle } = await import('./mtproto.lifecycle.js');

    await MTProtoLifeCycle.initAll();

    expect(forgetClientMock).toHaveBeenCalledWith('conn_revoked');
    expect(connectorUpdateMock).toHaveBeenCalledWith({
      where: { id: 'conn_revoked' },
      data: expect.objectContaining({
        status: 'ERROR',
        sessionString: null,
        lastError: '401: SESSION_REVOKED (caused by users.GetUsers)'
      })
    });
  });
});
