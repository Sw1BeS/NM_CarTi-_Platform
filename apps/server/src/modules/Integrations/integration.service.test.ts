import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';

const {
  prismaMock,
  axiosPostMock
} = vi.hoisted(() => ({
  prismaMock: {
    integration: {
      findUnique: vi.fn()
    },
    integrationEventLog: {
      findUnique: vi.fn(),
      create: vi.fn()
    }
  },
  axiosPostMock: vi.fn()
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock
  }
}));

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

describe('IntegrationService Meta CAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    prismaMock.integration.findUnique.mockResolvedValue({
      id: 'int_meta',
      companyId: 'company_1',
      type: 'META_PIXEL',
      isActive: true,
      config: {
        pixelId: '123456',
        accessToken: 'secret-token',
        testCode: 'TEST123'
      }
    });
    prismaMock.integrationEventLog.findUnique.mockResolvedValue(null);
    prismaMock.integrationEventLog.create.mockResolvedValue({ id: 'log_1' });
    axiosPostMock.mockResolvedValue({ data: { events_received: 1 } });
  });

  it('sends company-scoped Meta events with event_id, hashed user data, and idempotency log', async () => {
    const { IntegrationService } = await import('./integration.service.js');
    const service = new IntegrationService();

    const result = await service.metaPixelTrackEvent('company_1', 'Lead', {
      entityType: 'lead',
      entityId: 'lead_submit_1',
      stage: 'created',
      externalId: 'telegram:1001',
      phone: '+38 (063) 505-52-52',
      email: 'CLIENT@EXAMPLE.COM',
      fbp: 'fb.1.123',
      fbc: 'fb.1.456',
      value: 120,
      currency: 'USD',
      customData: {
        source_bot: 'cartie'
      }
    });

    const eventId = 'meta:company_1:Lead:lead:lead_submit_1:created';
    expect(result).toMatchObject({ success: true, eventId });
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const payload = axiosPostMock.mock.calls[0][1];
    expect(payload.test_event_code).toBe('TEST123');
    expect(payload.data[0]).toMatchObject({
      event_name: 'Lead',
      event_id: eventId,
      action_source: 'website'
    });
    expect(payload.data[0].user_data).toMatchObject({
      ph: [sha256('380635055252')],
      em: [sha256('client@example.com')],
      external_id: [sha256('telegram:1001')],
      fbp: 'fb.1.123',
      fbc: 'fb.1.456'
    });
    expect(payload.data[0].custom_data).toMatchObject({
      value: 120,
      currency: 'USD',
      source_bot: 'cartie'
    });
    expect(prismaMock.integrationEventLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyId: 'company_1',
        integration: 'META_PIXEL',
        action: 'Lead',
        status: 'SUCCESS',
        idempotencyKey: eventId
      })
    }));
  });
});
