import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  trackB2CBotCrmLifecycleEventMock
} = vi.hoisted(() => ({
  prismaMock: {
    integrationEventLog: {
      create: vi.fn(),
      findUnique: vi.fn()
    },
    leadIdentity: {
      findFirst: vi.fn()
    },
    b2bRequest: {
      findFirst: vi.fn()
    }
  },
  trackB2CBotCrmLifecycleEventMock: vi.fn()
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: prismaMock
}));

vi.mock('../meta/metaCapi.service.js', () => ({
  MetaCapiService: class {
    trackB2CBotCrmLifecycleEvent = trackB2CBotCrmLifecycleEventMock;
  }
}));

describe('SalesDrive inbound webhook service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SALESDRIVE_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('META_B2C_BOT_DESTINATION_KEY', 'b2c_bot_sandbox');
    prismaMock.integrationEventLog.create.mockResolvedValue({ id: 'log_1' });
    prismaMock.integrationEventLog.findUnique.mockResolvedValue(null);
    prismaMock.leadIdentity.findFirst.mockResolvedValue(null);
    prismaMock.b2bRequest.findFirst.mockResolvedValue(null);
    trackB2CBotCrmLifecycleEventMock.mockResolvedValue({ success: true });
  });

  it('validates SalesDrive webhook secret from headers without exposing configured secret', async () => {
    const { validateSalesDriveWebhookSecret } = await import('./salesdriveWebhook.service.js');

    expect(validateSalesDriveWebhookSecret({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {}
    })).toMatchObject({ ok: true });
    expect(validateSalesDriveWebhookSecret({
      headers: { 'x-salesdrive-webhook-secret': 'wrong' },
      query: {},
      body: {}
    })).toMatchObject({ ok: false, reason: 'INVALID_SECRET' });
  });

  it('sanitizes phone email and token-like fields before payload logging', async () => {
    const { sanitizeSalesDriveWebhookPayload } = await import('./salesdriveWebhook.service.js');

    const result = sanitizeSalesDriveWebhookPayload({
      phone: '+380635055252',
      email: 'CLIENT@EXAMPLE.COM',
      token: 'secret',
      nested: {
        clientPhone: '+1 555 555 0100',
        clientEmail: 'nested@example.com'
      }
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('+380635055252');
    expect(serialized).not.toContain('CLIENT@EXAMPLE.COM');
    expect(serialized).not.toContain('secret');
    expect(serialized).toContain('[redacted-phone]');
    expect(serialized).toContain('[redacted-email]');
    expect(serialized).toContain('[redacted-credential]');
  });

  it('skips unmapped SalesDrive statuses and logs the rule decision', async () => {
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37193',
        status_id: 1,
        status_name: '1️⃣ Новий лід',
        updated_at: '2026-05-25T10:00:00Z',
        comment: 'CarTié B2C | source=b2c_bot | request_type=client_auto_selection | cartie_request_id=RQ-1'
      },
      companyId: 'company_1'
    });

    expect(result).toMatchObject({ ok: true, sent: false, reason: 'status_skipped' });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();
    expect(prismaMock.integrationEventLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        integration: 'SALESDRIVE',
        action: 'WEBHOOK_RULE_SKIPPED',
        status: 'OK',
        meta: expect.objectContaining({
          reason: 'status_skipped',
          statusId: '1',
          destinationKey: 'b2c_bot_sandbox'
        })
      })
    }));
  });

  it('maps contacted SalesDrive status to B2C bot Contacted CRM stage with destination-aware dedup key', async () => {
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37193',
        status_id: 13,
        status_name: '📞 Контакт встановлено',
        updated_at: '2026-05-25T10:00:00Z',
        phone: '+38 (063) 505-52-52',
        comment: 'CarTié B2C | source=b2c_bot | request_type=client_auto_selection | cartie_request_id=RQ-1'
      },
      companyId: 'company_1'
    });

    const statusTime = String(Math.floor(new Date('2026-05-25T10:00:00Z').getTime() / 1000));
    const eventId = `salesdrive:37193:Contacted:13:${statusTime}:b2c_bot_sandbox`;
    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Contacted', eventId });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith('company_1', 'Contacted', expect.objectContaining({
      eventId,
      entityType: 'salesdrive_status',
      entityId: '37193',
      phone: '+38 (063) 505-52-52',
      externalId: 'salesdrive:37193',
      customData: expect.objectContaining({
        crm_status: 'contacted',
        status_id: '13',
        status_name: '📞 Контакт встановлено',
        destination_key: 'b2c_bot_sandbox'
      })
    }));
  });

  it('uses the matched CarTié company from SalesDrive identity when the public webhook has no company context', async () => {
    prismaMock.leadIdentity.findFirst.mockResolvedValueOnce({
      id: 'identity_1',
      companyId: 'company_from_identity',
      lead: {
        companyId: 'company_from_identity',
        payload: {
          source: 'b2c_bot',
          destination_key: 'b2c_bot_sandbox'
        }
      }
    });
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37193',
        status_id: 13,
        status_name: '📞 Контакт встановлено',
        updated_at: '2026-05-25T10:00:00Z'
      }
    });

    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith(
      'company_from_identity',
      'Contacted',
      expect.objectContaining({ entityId: '37193' })
    );
  });

  it('does not invent a fake company id for B2C comment-only connectivity webhooks', async () => {
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: 'connectivity-test',
        status_id: 13,
        status_name: '📞 Контакт встановлено',
        updated_at: '2026-05-25T10:00:00Z',
        comment: 'CarTié B2C | source=b2c_bot | request_type=client_auto_selection'
      }
    });

    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith(
      null,
      'Contacted',
      expect.objectContaining({ entityId: 'connectivity-test' })
    );
  });

  it('does not send candidate QualifiedLead statuses until confirmed', async () => {
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37193',
        status_id: 2,
        status_name: '🎯 Опрацювання ліда / Дожим',
        updated_at: '2026-05-25T10:00:00Z',
        comment: 'CarTié B2C | source=b2c_bot'
      },
      companyId: 'company_1'
    });

    expect(result).toMatchObject({ ok: true, sent: false, reason: 'qualified_lead_unconfirmed' });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();
  });

  it('keeps Purchase disabled by default', async () => {
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37193',
        status_id: 5,
        status_name: '🔥  Авто куплено',
        updated_at: '2026-05-25T10:00:00Z',
        value: 16000,
        currency: 'USD',
        comment: 'CarTié B2C | source=b2c_bot'
      },
      companyId: 'company_1'
    });

    expect(result).toMatchObject({ ok: true, sent: false, reason: 'purchase_disabled' });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();
  });

  it('does not resend an already successful destination-aware SalesDrive event', async () => {
    const statusTime = String(Math.floor(new Date('2026-05-25T10:00:00Z').getTime() / 1000));
    const eventId = `salesdrive:37193:Contacted:13:${statusTime}:b2c_bot_sandbox`;
    prismaMock.integrationEventLog.findUnique.mockResolvedValueOnce({
      id: 'existing_success',
      status: 'SUCCESS',
      idempotencyKey: eventId
    });
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37193',
        status_id: 13,
        status_name: '📞 Контакт встановлено',
        updated_at: '2026-05-25T10:00:00Z',
        comment: 'CarTié B2C | source=b2c_bot'
      },
      companyId: 'company_1'
    });

    expect(result).toMatchObject({ ok: true, sent: false, duplicate: true, eventId });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();
  });
});
