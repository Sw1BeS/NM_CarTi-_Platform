import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  leadIdentityFindUniqueMock,
  leadIdentityUpsertMock,
  leadActivityFindManyMock,
  leadFindManyMock,
  b2bRequestFindManyMock,
  b2bRequestFindUniqueMock,
  messageLogFindManyMock,
  requestVariantFindManyMock,
  integrationEventLogFindManyMock
} = vi.hoisted(() => ({
  leadIdentityFindUniqueMock: vi.fn(),
  leadIdentityUpsertMock: vi.fn(),
  leadActivityFindManyMock: vi.fn(),
  leadFindManyMock: vi.fn(),
  b2bRequestFindManyMock: vi.fn(),
  b2bRequestFindUniqueMock: vi.fn(),
  messageLogFindManyMock: vi.fn(),
  requestVariantFindManyMock: vi.fn(),
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
    lead: {
      findMany: leadFindManyMock
    },
    b2bRequest: {
      findMany: b2bRequestFindManyMock,
      findUnique: b2bRequestFindUniqueMock
    },
    messageLog: {
      findMany: messageLogFindManyMock
    },
    requestVariant: {
      findMany: requestVariantFindManyMock
    },
    integrationEventLog: {
      findMany: integrationEventLogFindManyMock
    }
  }
}));

import {
  buildLeadIdentityCandidates,
  buildLeadTimeline,
  buildRequestTimeline,
  resolveLeadByIdentity,
  upsertLeadIdentities
} from './leadIdentity.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  leadIdentityFindUniqueMock.mockResolvedValue(null);
  leadIdentityUpsertMock.mockResolvedValue({ id: 'identity_1' });
  leadActivityFindManyMock.mockResolvedValue([]);
  leadFindManyMock.mockResolvedValue([]);
  b2bRequestFindManyMock.mockResolvedValue([]);
  b2bRequestFindUniqueMock.mockResolvedValue(null);
  messageLogFindManyMock.mockResolvedValue([]);
  requestVariantFindManyMock.mockResolvedValue([]);
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

  it('includes request messages and variants in chronological order', async () => {
    b2bRequestFindManyMock.mockResolvedValueOnce([
      { createdAt: new Date('2026-05-12T10:00:00Z'), id: 'req_1', publicId: 'CD-1', status: 'COLLECTING_VARIANTS' }
    ]);
    messageLogFindManyMock.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-05-12T10:01:00Z'),
        requestId: 'req_1',
        variantId: null,
        direction: 'INCOMING',
        text: 'Looking for a Cayenne',
        payload: { channel: 'telegram' }
      },
      {
        createdAt: new Date('2026-05-12T10:04:00Z'),
        requestId: 'req_1',
        variantId: 'variant_1',
        direction: 'OUTGOING',
        text: 'Offer submitted',
        payload: { channel: 'telegram' }
      }
    ]);
    requestVariantFindManyMock.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-05-12T10:03:00Z'),
        id: 'variant_1',
        requestId: 'req_1',
        status: 'SUBMITTED',
        requesterDecision: 'PENDING',
        fitQueueStatus: null,
        title: 'Porsche Cayenne',
        price: 72000,
        location: 'Kyiv'
      }
    ]);

    const timeline = await buildLeadTimeline({ leadId: 'lead_1', companyId: 'comp_1' });

    expect(messageLogFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: { in: ['req_1'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200
    }));
    expect(requestVariantFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: { in: ['req_1'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200
    }));
    expect(timeline.map((item) => item.type)).toEqual([
      'REQUEST_CREATED',
      'MESSAGE_INCOMING',
      'REQUEST_VARIANT_SUBMITTED',
      'MESSAGE_OUTGOING'
    ]);
    expect(timeline[1]).toMatchObject({
      label: 'message incoming',
      payload: {
        requestId: 'req_1',
        variantId: null,
        text: 'Looking for a Cayenne',
        direction: 'INCOMING',
        meta: { channel: 'telegram' }
      }
    });
    expect(timeline[2]).toMatchObject({
      label: 'variant Porsche Cayenne',
      payload: {
        requestId: 'req_1',
        variantId: 'variant_1',
        status: 'SUBMITTED',
        requesterDecision: 'PENDING',
        fitQueueStatus: null,
        title: 'Porsche Cayenne',
        price: 72000,
        location: 'Kyiv'
      }
    });
  });

  it('redacts sensitive keys from message and integration payload meta', async () => {
    b2bRequestFindManyMock.mockResolvedValueOnce([
      { createdAt: new Date('2026-05-12T10:00:00Z'), id: 'req_1', publicId: 'CD-1', status: 'COLLECTING_VARIANTS' }
    ]);
    messageLogFindManyMock.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-05-12T10:01:00Z'),
        requestId: 'req_1',
        variantId: null,
        direction: 'INCOMING',
        text: 'secret-ish',
        payload: {
          token: 'abc',
          nested: { password: 'pw', keep: 'ok' },
          items: [{ apiKey: 'key' }]
        }
      }
    ]);
    integrationEventLogFindManyMock.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-05-12T10:02:00Z'),
        integration: 'SALES_DRIVE',
        action: 'sync',
        status: 'OK',
        message: null,
        meta: { accessToken: 'access', safe: true }
      }
    ]);

    const timeline = await buildLeadTimeline({ leadId: 'lead_1', companyId: 'comp_1' });

    expect(timeline.find((item) => item.type === 'MESSAGE_INCOMING')?.payload).toMatchObject({
      meta: {
        token: '[REDACTED]',
        nested: { password: '[REDACTED]', keep: 'ok' },
        items: [{ apiKey: '[REDACTED]' }]
      }
    });
    expect(timeline.find((item) => item.type === 'INTEGRATION_sync')?.payload).toMatchObject({
      meta: { accessToken: '[REDACTED]', safe: true }
    });
  });

  it('redacts expanded secret key variants recursively using normalized key names', async () => {
    b2bRequestFindManyMock.mockResolvedValueOnce([
      { createdAt: new Date('2026-05-12T10:00:00Z'), id: 'req_1', publicId: 'CD-1', status: 'COLLECTING_VARIANTS' }
    ]);
    messageLogFindManyMock.mockResolvedValueOnce([
      {
        createdAt: new Date('2026-05-12T10:01:00Z'),
        requestId: 'req_1',
        variantId: null,
        direction: 'INCOMING',
        text: 'secret-ish',
        payload: {
          token: 'token-value',
          api_key: 'api-key-value',
          accessToken: 'access-token-value',
          refresh_token: 'refresh-token-value',
          clientSecret: 'client-secret-value',
          authorization: 'bearer-value',
          cookie: 'cookie-value',
          session_string: 'session-string-value',
          botToken: 'bot-token-value',
          init_data: 'init-data-value',
          hash: 'hash-value',
          signature: 'signature-value',
          nested: {
            password: 'password-value',
            Secret: 'secret-value',
            keep: 'ok'
          },
          items: [
            {
              apiKey: 'api-key-camel-value',
              access_token: 'access-token-snake-value',
              refreshToken: 'refresh-token-camel-value',
              client_secret: 'client-secret-snake-value',
              sessionString: 'session-string-camel-value',
              bot_token: 'bot-token-snake-value',
              initData: 'init-data-camel-value'
            }
          ]
        }
      }
    ]);

    const timeline = await buildLeadTimeline({ leadId: 'lead_1', companyId: 'comp_1' });

    expect(timeline.find((item) => item.type === 'MESSAGE_INCOMING')?.payload).toMatchObject({
      meta: {
        token: '[REDACTED]',
        api_key: '[REDACTED]',
        accessToken: '[REDACTED]',
        refresh_token: '[REDACTED]',
        clientSecret: '[REDACTED]',
        authorization: '[REDACTED]',
        cookie: '[REDACTED]',
        session_string: '[REDACTED]',
        botToken: '[REDACTED]',
        init_data: '[REDACTED]',
        hash: '[REDACTED]',
        signature: '[REDACTED]',
        nested: {
          password: '[REDACTED]',
          Secret: '[REDACTED]',
          keep: 'ok'
        },
        items: [
          {
            apiKey: '[REDACTED]',
            access_token: '[REDACTED]',
            refreshToken: '[REDACTED]',
            client_secret: '[REDACTED]',
            sessionString: '[REDACTED]',
            bot_token: '[REDACTED]',
            initData: '[REDACTED]'
          }
        ]
      }
    });
  });

  it('requests newest timeline rows first with deterministic secondary sort for limited queries', async () => {
    b2bRequestFindManyMock.mockResolvedValueOnce([
      { createdAt: new Date('2026-05-12T10:00:00Z'), id: 'req_1', publicId: 'CD-1', status: 'COLLECTING_VARIANTS' }
    ]);

    await buildLeadTimeline({ leadId: 'lead_1', companyId: 'comp_1' });

    expect(leadActivityFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100
    }));
    expect(b2bRequestFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100
    }));
    expect(integrationEventLogFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100
    }));
    expect(messageLogFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: { in: ['req_1'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200
    }));
    expect(requestVariantFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: { in: ['req_1'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200
    }));
  });

  it('sorts equal timestamps deterministically by type priority and source id', async () => {
    const at = new Date('2026-05-12T10:00:00Z');
    b2bRequestFindManyMock.mockResolvedValueOnce([
      { createdAt: at, id: 'req_1', publicId: 'CD-1', status: 'COLLECTING_VARIANTS' }
    ]);
    messageLogFindManyMock.mockResolvedValueOnce([
      {
        id: 'msg_b',
        createdAt: at,
        requestId: 'req_1',
        variantId: null,
        direction: 'INCOMING',
        text: 'message B',
        payload: {}
      },
      {
        id: 'msg_a',
        createdAt: at,
        requestId: 'req_1',
        variantId: null,
        direction: 'INCOMING',
        text: 'message A',
        payload: {}
      }
    ]);
    requestVariantFindManyMock.mockResolvedValueOnce([
      {
        createdAt: at,
        id: 'variant_1',
        requestId: 'req_1',
        status: 'SUBMITTED',
        requesterDecision: 'PENDING',
        fitQueueStatus: null,
        title: 'Variant',
        price: 72000,
        location: 'Kyiv'
      }
    ]);

    const timeline = await buildLeadTimeline({ leadId: 'lead_1', companyId: 'comp_1' });

    expect(timeline.map((item) => item.type)).toEqual([
      'REQUEST_CREATED',
      'MESSAGE_INCOMING',
      'MESSAGE_INCOMING',
      'REQUEST_VARIANT_SUBMITTED'
    ]);
    expect(timeline.map((item) => item.payload)).toEqual([
      expect.objectContaining({ requestId: 'req_1' }),
      expect.objectContaining({ text: 'message A' }),
      expect.objectContaining({ text: 'message B' }),
      expect.objectContaining({ variantId: 'variant_1' })
    ]);
  });

  it('does not query request messages or variants when the lead has no linked requests', async () => {
    b2bRequestFindManyMock.mockResolvedValueOnce([]);

    await buildLeadTimeline({ leadId: 'lead_1', companyId: 'comp_1' });

    expect(messageLogFindManyMock).not.toHaveBeenCalled();
    expect(requestVariantFindManyMock).not.toHaveBeenCalled();
  });

  it('builds a request timeline from request, linked lead activity, messages, variants, and integration logs', async () => {
    b2bRequestFindUniqueMock.mockResolvedValueOnce({
      id: 'req_1',
      publicId: 'CD-2026-000777',
      companyId: 'comp_1',
      leadId: 'lead_1',
      status: 'COLLECTING_VARIANTS',
      createdAt: new Date('2026-05-12T10:00:00Z')
    });
    leadActivityFindManyMock.mockResolvedValueOnce([
      {
        id: 'activity_1',
        createdAt: new Date('2026-05-12T10:01:00Z'),
        type: 'ADMIN_ACTION',
        payload: { status: 'assigned', token: 'secret-token' }
      }
    ]);
    messageLogFindManyMock.mockResolvedValueOnce([
      {
        id: 'message_1',
        createdAt: new Date('2026-05-12T10:02:00Z'),
        requestId: 'req_1',
        variantId: null,
        direction: 'INCOMING',
        text: 'Клієнт питає про Ioniq',
        payload: { channel: 'telegram', initData: 'raw-init-data' }
      }
    ]);
    requestVariantFindManyMock.mockResolvedValueOnce([
      {
        id: 'variant_1',
        requestId: 'req_1',
        createdAt: new Date('2026-05-12T10:03:00Z'),
        status: 'SUBMITTED',
        requesterDecision: 'PENDING',
        fitQueueStatus: null,
        title: 'Hyundai Ioniq 5',
        price: 16000,
        location: 'Lviv'
      }
    ]);
    integrationEventLogFindManyMock.mockResolvedValueOnce([
      {
        id: 'log_1',
        createdAt: new Date('2026-05-12T10:04:00Z'),
        integration: 'SALES_DRIVE',
        action: 'sync_preview',
        status: 'FAILED',
        message: 'SalesDrive unavailable',
        meta: { accessToken: 'secret-access', safe: true }
      }
    ]);

    const timeline = await buildRequestTimeline({ requestId: 'req_1', companyId: 'comp_1' });

    expect(b2bRequestFindUniqueMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'req_1' }
    }));
    expect(leadActivityFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { leadId: 'lead_1' }
    }));
    expect(messageLogFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: 'req_1' }
    }));
    expect(requestVariantFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { requestId: 'req_1' }
    }));
    expect(integrationEventLogFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: 'comp_1',
        OR: expect.arrayContaining([
          { entityId: 'req_1' },
          { entityId: 'variant_1' },
          { traceId: 'req_1' }
        ])
      })
    }));
    expect(timeline.map((item) => item.type)).toEqual([
      'REQUEST_CREATED',
      'ADMIN_ACTION',
      'MESSAGE_INCOMING',
      'REQUEST_VARIANT_SUBMITTED',
      'INTEGRATION_sync_preview'
    ]);
    expect(timeline.find((item) => item.type === 'ADMIN_ACTION')?.payload).toMatchObject({
      token: '[REDACTED]'
    });
    expect(timeline.find((item) => item.type === 'MESSAGE_INCOMING')?.payload).toMatchObject({
      meta: { initData: '[REDACTED]' }
    });
    expect(timeline.find((item) => item.type === 'INTEGRATION_sync_preview')?.payload).toMatchObject({
      meta: { accessToken: '[REDACTED]', safe: true }
    });
  });
});
