import { beforeEach, describe, expect, it, vi } from 'vitest';

const findPartnerUserMock = vi.fn();
const createPartnerUserMock = vi.fn();
const updatePartnerUserMock = vi.fn();

const findPartnerCompanyByCodeMock = vi.fn();
const findPartnerCompanyByNameOrSlugMock = vi.fn();
const createPartnerCompanyMock = vi.fn();
const updatePartnerCompanyMock = vi.fn();

const findAccessRequestByIdMock = vi.fn();
const updateAccessRequestMock = vi.fn();

const findShowcaseBySlugMock = vi.fn();

vi.mock('./prisma.js', () => ({
  prisma: {
    partnerUser: {
      findFirst: findPartnerUserMock,
      create: createPartnerUserMock,
      update: updatePartnerUserMock
    },
    partnerCompany: {
      findUnique: findPartnerCompanyByCodeMock,
      findFirst: findPartnerCompanyByNameOrSlugMock,
      create: createPartnerCompanyMock,
      update: updatePartnerCompanyMock
    },
    b2bAccessRequest: {
      findUnique: findAccessRequestByIdMock,
      findFirst: vi.fn(),
      create: vi.fn(),
      update: updateAccessRequestMock
    },
    showcase: {
      findUnique: findShowcaseBySlugMock
    }
  }
}));

describe('b2bRegistration approve path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates OWNER and assigns partnerCode + showcaseSlug on approval', async () => {
    findAccessRequestByIdMock.mockResolvedValue({
      id: 'ar_1',
      tgUserId: '1005',
      username: 'owner_user',
      companyId: 'cmp_1',
      reason: JSON.stringify({
        kind: 'NEW_PARTNER',
        chatId: '1005',
        company: {
          name: 'Dealer One',
          city: 'Львів',
          phone: '+380671111111',
          note: 'test'
        },
        applicant: {
          tgUserId: '1005',
          firstName: 'Іван',
          lastName: 'Власник',
          contact: '+380671111111'
        }
      })
    });

    findPartnerCompanyByNameOrSlugMock.mockImplementation(async ({ where }: any) => {
      if (where?.name) return null;
      if (where?.showcaseSlug) return null;
      return null;
    });

    createPartnerCompanyMock.mockResolvedValue({
      id: 'pc_1',
      name: 'Dealer One',
      companyId: 'cmp_1',
      partnerCode: null,
      showcaseSlug: null,
      city: 'Львів',
      contact: '+380671111111',
      notes: 'test'
    });

    findPartnerCompanyByCodeMock.mockResolvedValue(null);
    findShowcaseBySlugMock.mockResolvedValue(null);

    updatePartnerCompanyMock.mockImplementation(async ({ data }: any) => ({
      id: 'pc_1',
      name: 'Dealer One',
      companyId: 'cmp_1',
      partnerCode: data.partnerCode || 'P-ABCDEFGH',
      showcaseSlug: data.showcaseSlug || 'dealer-one',
      city: 'Львів',
      contact: '+380671111111',
      notes: 'test'
    }));

    findPartnerUserMock.mockResolvedValue(null);
    createPartnerUserMock.mockResolvedValue({
      id: 'pu_1',
      role: 'OWNER',
      name: 'Іван Власник'
    });

    updateAccessRequestMock.mockResolvedValue({
      id: 'ar_1',
      status: 'APPROVED'
    });

    const { b2bRegistrationService } = await import('./b2bRegistration.service.js');
    const result = await b2bRegistrationService.approveNewPartnerRequest({
      accessRequestId: 'ar_1',
      reviewedBy: '9000'
    });

    expect(result).not.toBeNull();
    expect(updatePartnerCompanyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'pc_1' },
      data: expect.objectContaining({
        partnerCode: expect.stringMatching(/^P-/),
        showcaseSlug: expect.any(String)
      })
    }));
    expect(createPartnerUserMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: 'OWNER',
        partnerId: 'pc_1'
      })
    }));
  });
});
