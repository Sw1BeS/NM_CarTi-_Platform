import { describe, expect, it, vi } from 'vitest';

const findPartnerUserMock = vi.fn();
const findAccessRequestMock = vi.fn();
const createAccessRequestMock = vi.fn();

vi.mock('./prisma.js', () => ({
  prisma: {
    partnerUser: {
      findFirst: findPartnerUserMock
    },
    b2bAccessRequest: {
      findFirst: findAccessRequestMock,
      create: createAccessRequestMock
    }
  }
}));

describe('b2bWhitelist.service', () => {
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
});
