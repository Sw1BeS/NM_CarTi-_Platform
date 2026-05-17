import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  leadIdentityFindUniqueMock,
  leadIdentityUpsertMock,
  leadActivityFindManyMock,
  b2bRequestFindManyMock,
  integrationEventLogFindManyMock
} = vi.hoisted(() => ({
  leadIdentityFindUniqueMock: vi.fn(),
  leadIdentityUpsertMock: vi.fn(),
  leadActivityFindManyMock: vi.fn(),
  b2bRequestFindManyMock: vi.fn(),
  integrationEventLogFindManyMock: vi.fn()
}));

vi.mock('./prisma.js', () => ({
  prisma: {
    leadIdentity: {
      findUnique: leadIdentityFindUniqueMock,
      upsert: leadIdentityUpsertMock
    },
    leadActivity: {
      findMany: leadActivityFindManyMock
    },
    b2bRequest: {
      findMany: b2bRequestFindManyMock
    },
    integrationEventLog: {
      findMany: integrationEventLogFindManyMock
    }
  }
}));

import {
  buildLeadIdentityCandidates,
  buildLeadTimeline,
  resolveLeadByIdentity,
  upsertLeadIdentities
} from './leadIdentity.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  leadIdentityFindUniqueMock.mockResolvedValue(null);
  leadIdentityUpsertMock.mockResolvedValue({ id: 'identity_1' });
  leadActivityFindManyMock.mockResolvedValue([]);
  b2bRequestFindManyMock.mockResolvedValue([]);
  integrationEventLogFindManyMock.mockResolvedValue([]);
});

describe('leadIdentity.service', () => {
  it('builds normalized, de-duplicated identity candidates from lead payloads', () => {
    const candidates = buildLeadIdentityCandidates({
      telegramUserId: '123',
      phone: '063 505 52 52',
      payload: {
        telegramUserId: '123',
        telegram: { userId: '123' },
        tracking: { visitorId: 'visitor_1' }
      }
    });

    expect(candidates).toEqual([
      expect.objectContaining({ provider: 'TELEGRAM', externalId: '123' }),
      expect.objectContaining({ provider: 'PHONE', externalId: '+380635055252' }),
      expect.objectContaining({ provider: 'WEBSITE', externalId: 'visitor_1', confidence: 'LOW' })
    ]);
  });

  it('resolves the first matching durable identity to its lead', async () => {
    leadIdentityFindUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'identity_phone', lead: { id: 'lead_1' } });

    const lead = await resolveLeadByIdentity({
      companyId: 'comp_1',
      candidates: [
        { provider: 'TELEGRAM', externalId: '123' },
        { provider: 'PHONE', externalId: '+380635055252' }
      ]
    });

    expect(lead?.id).toBe('lead_1');
    expect(leadIdentityFindUniqueMock).toHaveBeenCalledTimes(2);
  });

  it('upserts identity rows for a resolved lead', async () => {
    await upsertLeadIdentities({
      companyId: 'comp_1',
      leadId: 'lead_1',
      candidates: [{ provider: 'TELEGRAM', externalId: '123' }]
    });

    expect(leadIdentityUpsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId_provider_externalId: {
          companyId: 'comp_1',
          provider: 'TELEGRAM',
          externalId: '123'
        }
      },
      create: expect.objectContaining({
        companyId: 'comp_1',
        leadId: 'lead_1'
      }),
      update: expect.objectContaining({
        leadId: 'lead_1'
      })
    }));
  });

  it('combines lead activities, requests, and integration logs into a chronological timeline', async () => {
    leadActivityFindManyMock.mockResolvedValueOnce([
      { createdAt: new Date('2026-05-12T10:00:00Z'), type: 'INCOMING_MESSAGE', payload: { text: 'hello' } }
    ]);
    b2bRequestFindManyMock.mockResolvedValueOnce([
      { createdAt: new Date('2026-05-12T10:05:00Z'), id: 'req_1', publicId: 'CD-1', status: 'COLLECTING_VARIANTS' }
    ]);
    integrationEventLogFindManyMock.mockResolvedValueOnce([
      { createdAt: new Date('2026-05-12T10:03:00Z'), integration: 'META_CAPI', action: 'Lead', status: 'OK', message: null, meta: null }
    ]);

    const timeline = await buildLeadTimeline({ leadId: 'lead_1', companyId: 'comp_1' });

    expect(timeline.map((item) => item.type)).toEqual([
      'INCOMING_MESSAGE',
      'INTEGRATION_Lead',
      'REQUEST_CREATED'
    ]);
  });
});
