import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPartnerUserMock = vi.fn();
const findAccessRequestMock = vi.fn();
const createAccessRequestMock = vi.fn();
const updateAccessRequestMock = vi.fn();
const findAccessRequestByIdMock = vi.fn();
const findPartnerCompanyMock = vi.fn();
const createPartnerCompanyMock = vi.fn();
const updatePartnerCompanyMock = vi.fn();
const createPartnerUserMock = vi.fn();
const updatePartnerUserMock = vi.fn();

vi.mock('./prisma.js', () => ({
  prisma: {
    partnerUser: {
      findFirst: findPartnerUserMock,
      create: createPartnerUserMock,
      update: updatePartnerUserMock
    },
    partnerCompany: {
      findFirst: findPartnerCompanyMock,
      create: createPartnerCompanyMock,
      update: updatePartnerCompanyMock
    },
    b2bAccessRequest: {
      findFirst: findAccessRequestMock,
      findUnique: findAccessRequestByIdMock,
      create: createAccessRequestMock,
      update: updateAccessRequestMock
    }
  }
}));

describe('b2bWhitelist.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns allowed when partner mapping exists', async () => {
    findPartnerUserMock.mockResolvedValueOnce({ id: 'u1', partnerId: 'p1', partner: { id: 'p1', name: 'Dealer A' } });

    const { b2bWhitelistService } = await import('./b2bWhitelist.service.js');
    const result = await b2bWhitelistService.resolveParticipant({ tgUserId: '1001' }, { companyId: 'cmp', botId: 'bot' });

    expect(result.allowed).toBe(true);
    expect(result.partnerCompany?.name).toBe('Dealer A');
  });

  it('creates NEW access request for non-whitelist user', async () => {
    findPartnerUserMock.mockResolvedValueOnce(null);
    findAccessRequestMock.mockResolvedValueOnce(null);
    createAccessRequestMock.mockResolvedValueOnce({ id: 'ar1', status: 'NEW' });

    const { b2bWhitelistService } = await import('./b2bWhitelist.service.js');
    const result = await b2bWhitelistService.ensureAccess(
      { tgUserId: '1002', username: 'dealer2' },
      { companyId: 'cmp', botId: 'bot' },
      'Need access'
    );

    expect(result.allowed).toBe(false);
    expect(result.accessRequest?.id).toBe('ar1');
  });

  it('approves request and auto-creates partner and partner user', async () => {
    findAccessRequestByIdMock.mockResolvedValueOnce({
      id: 'ar2',
      companyId: 'cmp',
      botId: 'bot',
      tgUserId: '1003',
      username: 'dealer3',
      fullName: 'Dealer Three',
      reason: 'telegram_callback_request_access;chatId=-1003702407477;chatType=supergroup'
    });

    findPartnerUserMock.mockResolvedValueOnce(null);
    findPartnerCompanyMock.mockResolvedValueOnce(null);
    createPartnerCompanyMock.mockResolvedValueOnce({ id: 'pc1', name: 'Dealer Three', adminGroupChatId: '-1003702407477' });
    createPartnerUserMock.mockResolvedValueOnce({ id: 'pu1', telegramId: '1003', partnerId: 'pc1', partner: { id: 'pc1', name: 'Dealer Three' } });
    updateAccessRequestMock.mockResolvedValueOnce({ id: 'ar2', status: 'APPROVED' });

    const { b2bWhitelistService } = await import('./b2bWhitelist.service.js');
    const result = await b2bWhitelistService.reviewAccessRequest({
      accessRequestId: 'ar2',
      decision: 'APPROVE',
      reviewedBy: '219480233'
    });

    expect(createPartnerCompanyMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        adminGroupChatId: '-1003702407477'
      })
    }));
    expect(createPartnerUserMock).toHaveBeenCalled();
    expect(updateAccessRequestMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'APPROVED' })
    }));
    expect(result?.partnerCompany?.id).toBe('pc1');
  });
});
