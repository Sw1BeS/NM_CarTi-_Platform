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
    axiosPostMock.mockResolvedValue({ data: { events_received: 1, fbtrace_id: 'trace_1' } });
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

  it('masks B2C bot access tokens without exposing the middle', async () => {
    const { maskMetaAccessToken } = await import('./metaCapi.service.js');

    expect(maskMetaAccessToken('EAAQcYqftYEoBRs18wHbeCJtfYCOHLE95EV74UsDmPd8vAFTrUUFtabAF0nOmS8ZCiqvfqvR3SsvXJjE5g8SoiBnEw2wPuZBLN4ZAU71p5xN7Y9p5TFTN0jswdxmkOhWqc6BnfxgHVBhE05uPxm5sRn0KpvZCeMEYR7xvyfYMyFnuXOqWnBXZBsJBIq6bAZBuQ6PQZDZD'))
      .toBe('EA***ZDZD');
  });

  it('does not send B2C bot dataset production events when META_CAPI_ENABLED is disabled', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'false');
    vi.stubEnv('META_B2C_BOT_CAPI_ENABLED', 'true');
    vi.stubEnv('META_B2C_BOT_DATASET_ID', '1152615213548168');
    vi.stubEnv('META_B2C_BOT_DESTINATION_KEY', 'b2c_bot_sandbox');
    vi.stubEnv('META_B2C_BOT_ACCESS_TOKEN', 'secret-b2c-token');
    vi.stubEnv('META_B2C_BOT_TEST_EVENT_CODE', 'TEST46105');
    const { MetaCapiService } = await import('./metaCapi.service.js');
    const service = new MetaCapiService();

    const result = await service.trackB2CBotDatasetEvent('company_1', 'Lead', {
      entityType: 'salesdrive_status',
      entityId: '37193',
      eventId: 'cartie:lead_1:Lead:b2c_bot_sandbox',
      externalId: 'salesdrive:37193',
      phone: '+380635055252'
    });

    expect(result).toMatchObject({
      success: false,
      skipped: true,
      reason: 'META_CAPI_DISABLED'
    });
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('sends B2C bot dataset test events as CRM Conversion Leads payloads', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    vi.stubEnv('META_B2C_BOT_CAPI_ENABLED', 'true');
    vi.stubEnv('META_B2C_BOT_TEST_MODE', 'true');
    vi.stubEnv('META_B2C_BOT_DATASET_ID', '1152615213548168');
    vi.stubEnv('META_B2C_BOT_DESTINATION_KEY', 'b2c_bot_sandbox');
    vi.stubEnv('META_B2C_BOT_ACCESS_TOKEN', 'secret-b2c-token');
    vi.stubEnv('META_B2C_BOT_TEST_EVENT_CODE', 'TEST46105');
    const { MetaCapiService } = await import('./metaCapi.service.js');
    const service = new MetaCapiService();
    const eventId = 'crm-lead-test:b2c_bot_sandbox:1760000000';

    const result = await service.trackB2CBotDatasetEvent('company_1', 'Lead', {
      entityType: 'salesdrive_status',
      entityId: '37193',
      eventId,
      externalId: 'salesdrive:37193',
      phone: '+38 (063) 505-52-52',
      actionSource: 'website',
      customData: {
        crm_status: 'raw_lead_test',
        event_source: 'wrong',
        lead_event_source: 'wrong',
        destination_key: 'wrong'
      }
    });

    expect(result).toMatchObject({ success: true, eventId, destinationKey: 'b2c_bot_sandbox' });
    expect(axiosPostMock).toHaveBeenCalledTimes(1);
    const [url, payload, init] = axiosPostMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v25.0/1152615213548168/events');
    expect(url).not.toContain('secret-b2c-token');
    expect(init.headers.Authorization).toBe('Bearer secret-b2c-token');
    expect(payload.test_event_code).toBe('TEST46105');
    expect(payload.data[0]).toMatchObject({
      event_name: 'Lead',
      event_id: eventId,
      action_source: 'system_generated'
    });
    expect(payload.data[0].custom_data).toMatchObject({
      event_source: 'crm',
      lead_event_source: 'CarTié SalesDrive',
      crm_status: 'raw_lead_test',
      destination_key: 'b2c_bot_sandbox'
    });
    expect(payload.data[0].user_data).toMatchObject({
      ph: [hash('380635055252')],
      external_id: [hash('salesdrive:37193')]
    });
    expect(prismaMock.integrationEventLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        integration: 'META_B2C_BOT',
        action: 'Lead',
        status: 'SUCCESS',
        idempotencyKey: eventId,
        meta: expect.objectContaining({
          mode: 'CRM_CONVERSION_LEADS',
          destinationKey: 'b2c_bot_sandbox',
          testEventCodeUsed: true,
          token: undefined,
          fbtrace_id: 'trace_1',
          response: expect.objectContaining({ events_received: 1 }),
          payloadSummary: expect.objectContaining({
            topLevelHasTestEventCode: true,
            topLevelHasData: true,
            eventName: 'Lead',
            eventId,
            actionSource: 'system_generated',
            customDataKeys: expect.arrayContaining(['event_source', 'lead_event_source', 'crm_status', 'destination_key']),
            customDataPreview: expect.objectContaining({
              event_source: 'crm',
              lead_event_source: 'CarTié SalesDrive',
              crm_status: 'raw_lead_test',
              destination_key: 'b2c_bot_sandbox'
            }),
            userDataKeys: expect.arrayContaining(['ph', 'external_id'])
          })
        })
      })
    }));
    const logPayload = JSON.stringify(prismaMock.integrationEventLog.create.mock.calls[0][0].data);
    expect(logPayload).not.toContain('secret-b2c-token');
    expect(logPayload).not.toContain('+38 (063) 505-52-52');
  });

  it('does not send unsupported B2C CRM event names such as generic Contact', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    vi.stubEnv('META_B2C_BOT_CAPI_ENABLED', 'true');
    vi.stubEnv('META_B2C_BOT_TEST_MODE', 'true');
    vi.stubEnv('META_B2C_BOT_DATASET_ID', '1152615213548168');
    vi.stubEnv('META_B2C_BOT_DESTINATION_KEY', 'b2c_bot_sandbox');
    vi.stubEnv('META_B2C_BOT_ACCESS_TOKEN', 'secret-b2c-token');
    vi.stubEnv('META_B2C_BOT_TEST_EVENT_CODE', 'TEST46105');
    const { MetaCapiService } = await import('./metaCapi.service.js');

    const result = await new MetaCapiService().trackB2CBotDatasetEvent('company_1', 'Contact', {
      entityType: 'salesdrive_status',
      entityId: '37193',
      eventId: 'salesdrive:37193:Contact:13:1760000000:b2c_bot_sandbox'
    });

    expect(result).toMatchObject({
      success: false,
      skipped: true,
      reason: 'META_B2C_BOT_CRM_EVENT_NOT_APPROVED'
    });
    expect(axiosPostMock).not.toHaveBeenCalled();
  });

  it('stores B2C bot dataset delivery logs without fake company id when company context is unavailable', async () => {
    vi.stubEnv('META_CAPI_ENABLED', 'true');
    vi.stubEnv('META_B2C_BOT_CAPI_ENABLED', 'true');
    vi.stubEnv('META_B2C_BOT_TEST_MODE', 'true');
    vi.stubEnv('META_B2C_BOT_DATASET_ID', '1152615213548168');
    vi.stubEnv('META_B2C_BOT_DESTINATION_KEY', 'b2c_bot_sandbox');
    vi.stubEnv('META_B2C_BOT_ACCESS_TOKEN', 'secret-b2c-token');
    vi.stubEnv('META_B2C_BOT_TEST_EVENT_CODE', 'TEST46105');
    const { MetaCapiService } = await import('./metaCapi.service.js');
    const eventId = 'crm-lead-test:b2c_bot_sandbox:1779727000';

    await new MetaCapiService().trackB2CBotDatasetEvent(null, 'Lead', {
      entityType: 'salesdrive_status',
      entityId: 'test',
      eventId
    });

    expect(prismaMock.integrationEventLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        companyId: null,
        integration: 'META_B2C_BOT',
        status: 'SUCCESS',
        idempotencyKey: eventId
      })
    }));
  });
});
