import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPartnerUserMock = vi.fn();
const createPartnerUserMock = vi.fn();
const updatePartnerUserMock = vi.fn();
const findPartnerCompanyByCodeMock = vi.fn();

vi.mock('./prisma.js', () => ({
  prisma: {
    partnerUser: {
      findFirst: findPartnerUserMock,
      create: createPartnerUserMock,
      update: updatePartnerUserMock
    },
    partnerCompany: {
      findUnique: findPartnerCompanyByCodeMock
    },
    b2bAccessRequest: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    showcase: {
      findUnique: vi.fn()
    }
  }
}));

describe('b2bRegistration.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid partnerCode', async () => {
    findPartnerCompanyByCodeMock.mockResolvedValueOnce(null);

    const { b2bRegistrationService } = await import('./b2bRegistration.service.js');
    const result = await b2bRegistrationService.registerAgentByPartnerCode({
      partnerCode: 'BAD-CODE',
      identity: { tgUserId: '1001', firstName: 'Іван', lastName: 'Тест' },
      context: { companyId: 'cmp-1', botId: 'bot-1' },
      contact: '+380671111111'
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('INVALID_CODE');
  });

  it('auto-activates AGENT for valid partnerCode', async () => {
    findPartnerCompanyByCodeMock.mockResolvedValueOnce({
      id: 'pc-1',
      name: 'Dealer One',
      companyId: 'cmp-1'
    });
    findPartnerUserMock.mockResolvedValueOnce(null);
    createPartnerUserMock.mockResolvedValueOnce({
      id: 'pu-1',
      role: 'AGENT'
    });

    const { b2bRegistrationService } = await import('./b2bRegistration.service.js');
    const result = await b2bRegistrationService.registerAgentByPartnerCode({
      partnerCode: 'P-ABCDEFGH',
      identity: { tgUserId: '1002', firstName: 'Петро', lastName: 'Агент' },
      context: { companyId: 'cmp-1', botId: 'bot-1' },
      contact: '+380672222222'
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.partnerCompany.id).toBe('pc-1');
      expect(createPartnerUserMock).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          role: 'AGENT',
          partnerId: 'pc-1'
        })
      }));
    }
  });
});
