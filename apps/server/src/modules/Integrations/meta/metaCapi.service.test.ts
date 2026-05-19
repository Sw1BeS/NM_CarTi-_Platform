import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('axios', () => ({
  default: {
    post: axiosPostMock
  }
}));

const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

describe('MetaCapiService', () => {
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
        test_event_code: 'TEST123'
      }
    });
    prismaMock.integrationEventLog.findUnique.mockResolvedValue(null);
    prismaMock.integrationEventLog.create.mockResolvedValue({ id: 'log_1' });
    axiosPostMock.mockResolvedValue({ data: { events_received: 1 } });
  });

  it('does not send when META_CAPI_ENABLED is disabled', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'false');
    const { MetaCapiService } = await import('./metaCapi.service.js');
    const service = new MetaCapiService();

    const result = await service.trackEvent('company_1', 'Lead', {
      entityType: 'lead',
      entityId: 'lead_1'
    });

    expect(result).toMatchObject({
      success: false,
      skipped: true,
      reason: 'META_CAPI_DISABLED'
    });
    expect(prismaMock.integration.findUnique).not.toHaveBeenCalled();
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(prismaMock.integrationEventLog.create).not.toHaveBeenCalled();
  });

  it('sends hashed ph and external_id with stable event_id', async () => {
    const { MetaCapiService } = await import('./metaCapi.service.js');
    const service = new MetaCapiService();

    const result = await service.trackEvent('company_1', 'Lead', {
      entityType: 'lead',
      entityId: 'lead_1',
      stage: 'created',
      externalId: 'telegram:1001',
      phone: '+38 (063) 505-52-52',
      email: 'CLIENT@EXAMPLE.COM',
      actionSource: 'chat',
      fbp: 'fb.1.123',
      fbc: 'fb.1.456'
    });

    const eventId = 'meta:company_1:Lead:lead:lead_1:created';
    expect(result).toMatchObject({ success: true, eventId });
    const payload = axiosPostMock.mock.calls[0][1];
    expect(payload.test_event_code).toBe('TEST123');
    expect(payload.data[0]).toMatchObject({
      event_name: 'Lead',
      event_id: eventId,
      action_source: 'chat'
    });
    expect(payload.data[0].user_data).toMatchObject({
      ph: [hash('380635055252')],
      em: [hash('client@example.com')],
      external_id: [hash('telegram:1001')],
      fbp: 'fb.1.123',
      fbc: 'fb.1.456'
    });
    expect(prismaMock.integrationEventLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        integration: 'META_PIXEL',
        status: 'SUCCESS',
        idempotencyKey: eventId,
        entityType: 'lead',
        entityId: 'lead_1'
      })
    }));
  });

  it('skips duplicate event_id through IntegrationEventLog idempotencyKey', async () => {
    const eventId = 'meta:company_1:Lead:lead:lead_1:created';
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'log_existing',
      status: 'SUCCESS',
      idempotencyKey: eventId
    });
    const { MetaCapiService } = await import('./metaCapi.service.js');
    const service = new MetaCapiService();

    const result = await service.trackEvent('company_1', 'Lead', {
      entityType: 'lead',
      entityId: 'lead_1',
      stage: 'created'
    });

    expect(result).toMatchObject({ success: true, eventId, duplicate: true });
    expect(axiosPostMock).not.toHaveBeenCalled();
    expect(prismaMock.integrationEventLog.create).not.toHaveBeenCalled();
  });

  it('logs Graph error without token or raw PII', async () => {
    axiosPostMock.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: 'Bad token secret-token for +380671234567 and CLIENT@EXAMPLE.COM'
          }
        }
      }
    });
    const { MetaCapiService } = await import('./metaCapi.service.js');
    const service = new MetaCapiService();

    const result = await service.trackEvent('company_1', 'Lead', {
      entityType: 'lead',
      entityId: 'lead_1',
      stage: 'created',
      phone: '+380671234567',
      email: 'CLIENT@EXAMPLE.COM'
    });

    expect(result.success).toBe(false);
    expect(String(result.error)).not.toContain('secret-token');
    expect(String(result.error)).not.toContain('+380671234567');
    expect(String(result.error)).not.toContain('CLIENT@EXAMPLE.COM');
    const errorLog = prismaMock.integrationEventLog.create.mock.calls[0][0].data;
    expect(errorLog.status).toBe('ERROR');
    expect(errorLog.message).not.toContain('secret-token');
    expect(errorLog.message).not.toContain('+380671234567');
    expect(errorLog.message).not.toContain('CLIENT@EXAMPLE.COM');
  });
});
