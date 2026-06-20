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
    },
    attributionSession: {
      findUnique: vi.fn(),
      update: vi.fn()
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
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv('SALESDRIVE_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('META_B2C_BOT_DESTINATION_KEY', 'b2c_bot_sandbox');
    prismaMock.integrationEventLog.create.mockResolvedValue({ id: 'log_1' });
    prismaMock.integrationEventLog.findUnique.mockResolvedValue(null);
    prismaMock.leadIdentity.findFirst.mockResolvedValue(null);
    prismaMock.b2bRequest.findFirst.mockResolvedValue(null);
    prismaMock.attributionSession.findUnique.mockResolvedValue(null);
    prismaMock.attributionSession.update.mockResolvedValue(null);
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
      updateAt: '09.06.2026 15:52:32',
      comment: 'IP: 95.46.141.82',
      nested: {
        clientPhone: '+1 555 555 0100',
        clientEmail: 'nested@example.com'
      }
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('+380635055252');
    expect(serialized).not.toContain('CLIENT@EXAMPLE.COM');
    expect(serialized).not.toContain('95.46.141.82');
    expect(serialized).not.toContain('secret');
    expect(serialized).toContain('[redacted-phone]');
    expect(serialized).toContain('[redacted-email]');
    expect(serialized).toContain('[redacted-ip]');
    expect(serialized).toContain('[redacted-credential]');
    expect(serialized).toContain('09.06.2026 15:52:32');
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
      eventTime: statusTime,
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
          destination_key: 'b2c_bot_sandbox',
          attribution: {
            token: 'AbC_token_123456',
            destination: 'b2c_bot_sandbox',
            query: { utm_source: 'meta' },
            identifiers: {
              fbp: 'fb.1.1779865200000.123456789',
              fbc: 'fb.1.1779865200000.ClickId',
              client_ip_address: '203.0.113.10',
              client_user_agent: 'Mozilla/5.0'
            },
            event_source_url: 'https://cartie.test/r/bot?fbclid=ClickId',
            created_at: '2026-05-27T07:00:00.000Z',
            expires_at: '2026-06-26T07:00:00.000Z'
          }
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
      expect.objectContaining({
        entityId: '37193',
        fbp: 'fb.1.1779865200000.123456789',
        fbc: 'fb.1.1779865200000.ClickId',
        clientIpAddress: '203.0.113.10',
        clientUserAgent: 'Mozilla/5.0',
        eventSourceUrl: 'https://cartie.test/r/bot?fbclid=ClickId'
      })
    );
  });

  it('still enriches allowlisted AdsQuiz webhooks from linked Cartie request payloads', async () => {
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST', 'cartie');
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST', '1');
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['13'], eventName: 'Contacted', crmStatus: 'contacted' }
    ]));
    prismaMock.leadIdentity.findFirst.mockResolvedValueOnce({
      id: 'identity_1',
      companyId: 'company_from_identity',
      payload: { requestId: 'request_1' },
      lead: {
        companyId: 'company_from_identity',
        clientName: 'Fallback Lead',
        phone: '+380500000000',
        userTgId: '777',
        payload: {
          source: 'b2c_bot'
        }
      }
    });
    prismaMock.b2bRequest.findFirst.mockResolvedValueOnce({
      id: 'request_1',
      publicId: 'REQ-123',
      companyId: 'company_from_request',
      requesterPartnerId: null,
      payload: {
        source: 'b2c_bot',
        destination_key: 'b2c_bot_sandbox',
        name: 'Linked Request',
        city: 'Kyiv',
        country: 'UA',
        telegram_user_id: '1001',
        fbp: 'fb.1.1779865200000.123456789',
        fbc: 'fb.1.1779865200000.ClickId',
        client_ip_address: '203.0.113.10',
        client_user_agent: 'Mozilla/5.0',
        event_source_url: 'https://cartie.test/r/bot?fbclid=ClickId',
        tracking: {
          utm_source: 'meta',
          utm_campaign: 'spring'
        }
      }
    });
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        data: {
          id: 4088,
          formId: 1,
          statusId: 13,
          updateAt: '2026-06-09 15:52:32',
          contacts: [{ phone: '+38 (063) 505-52-52' }]
        },
        info: {
          account: 'cartie',
          webhookType: 'order',
          webhookEvent: 'status_change'
        },
        meta: {
          fields: {
            statusId: {
              options: [{ text: '📞 Контакт встановлено', value: 13 }]
            }
          }
        }
      }
    });

    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Contacted' });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith(
      'company_from_identity',
      'Contacted',
      expect.objectContaining({
        phone: '+38 (063) 505-52-52',
        name: 'Linked Request',
        city: 'Kyiv',
        country: 'UA',
        fbp: 'fb.1.1779865200000.123456789',
        fbc: 'fb.1.1779865200000.ClickId',
        clientIpAddress: '203.0.113.10',
        clientUserAgent: 'Mozilla/5.0',
        eventSourceUrl: 'https://cartie.test/r/bot?fbclid=ClickId',
        externalIds: ['salesdrive:4088', 'telegram:1001'],
        customData: expect.objectContaining({
          utm_source: 'meta',
          utm_campaign: 'spring'
        })
      })
    );
  });

  it('enriches direct AdsQuiz SalesDrive webhooks from a Cartie attribution token in standard utm_term', async () => {
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST', 'cartie');
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST', '1');
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['13'], eventName: 'Contacted', crmStatus: 'contacted' }
    ]));
    prismaMock.attributionSession.findUnique.mockResolvedValueOnce({
      id: 'attr_1',
      token: 'quizTOKEN_1234567890',
      companyId: null,
      botId: null,
      destination: 'adsquiz_usa',
      source: 'meta',
      query: {
        utm_source: 'meta',
        utm_medium: 'cpc',
        utm_campaign: 'TOF|Quiz'
      },
      identifiers: {
        fbclid: 'QuizClick',
        fbp: 'fb.1.1779865200000.123456789',
        fbc: 'fb.1.1779865200000.QuizClick',
        client_ip_address: '203.0.113.42',
        client_user_agent: 'Mozilla/5.0 AdsQuiz'
      },
      requestMeta: {
        eventSourceUrl: 'https://cartie2.umanoff-analytics.space/r/quiz?destination=adsquiz_usa&fbclid=QuizClick'
      },
      expiresAt: new Date('2026-06-26T07:00:00.000Z'),
      consumedAt: null,
      createdAt: new Date('2026-06-16T07:00:00.000Z'),
      updatedAt: new Date('2026-06-16T07:00:00.000Z')
    });
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        data: {
          id: 4090,
          formId: 1,
          statusId: 13,
          updateAt: '2026-06-16T10:00:00Z',
          utm_term: 'cartie_token_quizTOKEN_1234567890',
          contacts: [{
            phone: '+38 (063) 505-52-52',
            email: 'client@example.com',
            fName: 'Lead',
            lName: 'Token'
          }]
        },
        info: {
          account: 'cartie',
          webhookEvent: 'status_change'
        }
      }
    });

    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Contacted' });
    expect(prismaMock.attributionSession.update).not.toHaveBeenCalled();
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith(
      null,
      'Contacted',
      expect.objectContaining({
        entityId: '4090',
        phone: '+38 (063) 505-52-52',
        email: 'client@example.com',
        firstName: 'Lead',
        lastName: 'Token',
        fbp: 'fb.1.1779865200000.123456789',
        fbc: 'fb.1.1779865200000.QuizClick',
        clientIpAddress: '203.0.113.42',
        clientUserAgent: 'Mozilla/5.0 AdsQuiz',
        eventSourceUrl: 'https://cartie2.umanoff-analytics.space/r/quiz?destination=adsquiz_usa&fbclid=QuizClick',
        customData: expect.objectContaining({
          utm_source: 'meta',
          utm_medium: 'cpc',
          utm_campaign: 'TOF|Quiz'
        })
      })
    );
  });

  it('does not send B2C comment-only connectivity webhooks without match identifiers', async () => {
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
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

    expect(result).toMatchObject({ ok: true, sent: false, reason: 'missing_match_identifiers' });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();
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

  it('uses configured SalesDrive status map for QualifiedLead CRM events', async () => {
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['2', '9'], eventName: 'QualifiedLead', crmStatus: 'qualified_lead' }
    ]));
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37193',
        status_id: 2,
        status_name: '🎯 Опрацювання ліда / Дожим',
        updated_at: '2026-05-25T10:00:00Z',
        phone: '+38 (063) 505-52-52',
        comment: 'CarTié B2C | source=b2c_bot'
      },
      companyId: 'company_1'
    });

    const statusTime = String(Math.floor(new Date('2026-05-25T10:00:00Z').getTime() / 1000));
    const eventId = `salesdrive:37193:QualifiedLead:2:${statusTime}:b2c_bot_sandbox`;
    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'QualifiedLead', eventId });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith('company_1', 'QualifiedLead', expect.objectContaining({
      eventId,
      eventTime: statusTime,
      customData: expect.objectContaining({
        crm_status: 'qualified_lead',
        status_id: '2'
      })
    }));
  });

  it('skips B2C CRM events that have no usable match identifiers beyond SalesDrive id', async () => {
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST', 'cartie');
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST', '1');
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['1'], eventName: 'Lead', crmStatus: 'new_lead' }
    ]));
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        data: {
          id: 28487,
          formId: 1,
          statusId: 1,
          updateAt: '2026-06-12 10:03:20'
        },
        info: {
          account: 'cartie',
          webhookEvent: 'new_order'
        },
        meta: {
          fields: {
            statusId: {
              options: [{ text: '1️⃣ Новий лід', value: 1 }]
            }
          }
        }
      }
    });

    expect(result).toMatchObject({ ok: true, sent: false, reason: 'missing_match_identifiers' });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();
  });

  it('treats configured SalesDrive status map as authoritative for legacy status 13', async () => {
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['2'], eventName: 'QualifiedLead', crmStatus: 'qualified_lead' }
    ]));
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
        comment: 'CarTié B2C | source=b2c_bot'
      },
      companyId: 'company_1'
    });

    expect(result).toMatchObject({ ok: true, sent: false, reason: 'status_skipped' });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();
  });

  it('fails closed instead of falling back to legacy sends when the configured status map is invalid', async () => {
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', '{not valid json');
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
        comment: 'CarTié B2C | source=b2c_bot'
      },
      companyId: 'company_1'
    });

    expect(result).toMatchObject({ ok: true, sent: false, reason: 'status_map_invalid' });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();
  });

  it('uses configured status-name rules for optional Schedule events', async () => {
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusNames: ['запис', 'бронь', 'консультац'], eventName: 'Schedule', crmStatus: 'scheduled' }
    ]));
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37194',
        status_id: 7,
        status_name: 'Запис на консультацію',
        updated_at: '2026-05-25T11:00:00Z',
        phone: '+38 (063) 505-52-52',
        comment: 'CarTié B2C | source=b2c_bot'
      },
      companyId: 'company_1'
    });

    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Schedule' });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith('company_1', 'Schedule', expect.objectContaining({
      customData: expect.objectContaining({
        crm_status: 'scheduled',
        status_name: 'Запис на консультацію'
      })
    }));
  });

  it('requires the purchase flag before configured Purchase events can send', async () => {
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['5', '11'], eventName: 'Purchase', crmStatus: 'purchase', requireValue: true, requireCurrency: true }
    ]));
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const baseRequest = {
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        order_id: '37195',
        status_id: 5,
        status_name: '🔥  Авто куплено',
        updated_at: '2026-05-25T12:00:00Z',
        phone: '+38 (063) 505-52-52',
        value: 16000,
        currency: 'USD',
        comment: 'CarTié B2C | source=b2c_bot'
      },
      companyId: 'company_1'
    };

    await expect(handleSalesDriveWebhook(baseRequest)).resolves.toMatchObject({
      ok: true,
      sent: false,
      reason: 'purchase_disabled'
    });
    expect(trackB2CBotCrmLifecycleEventMock).not.toHaveBeenCalled();

    vi.stubEnv('META_B2C_BOT_PURCHASE_ENABLED', 'true');
    const result = await handleSalesDriveWebhook(baseRequest);

    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Purchase' });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith('company_1', 'Purchase', expect.objectContaining({
      value: 16000,
      currency: 'USD',
      customData: expect.objectContaining({ crm_status: 'purchase' })
    }));
  });

  it('parses SalesDrive data payloads for B2C source, value and currency', async () => {
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['5'], eventName: 'Purchase', crmStatus: 'purchase', requireValue: true, requireCurrency: true }
    ]));
    vi.stubEnv('META_B2C_BOT_PURCHASE_ENABLED', 'true');
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        data: {
          id: '37196',
          statusId: 5,
          statusName: '🔥  Авто куплено',
          updatedAt: '2026-05-25T13:00:00Z',
          phone: '+38 (063) 505-52-52',
          amount: 17500,
          currency: 'USD',
          source: 'CarTié B2C | source=b2c_bot'
        }
      },
      companyId: 'company_1'
    });

    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Purchase' });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith('company_1', 'Purchase', expect.objectContaining({
      entityId: '37196',
      value: 17500,
      currency: 'USD',
      customData: expect.objectContaining({
        crm_status: 'purchase',
        status_id: '5',
        status_name: '🔥  Авто куплено'
      })
    }));
  });

  it('accepts real SalesDrive full-info webhooks from the configured AdsQuiz account and form', async () => {
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST', 'cartie');
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST', '1');
    vi.stubEnv('SALESDRIVE_WEBHOOK_TIMEZONE_OFFSET_MINUTES', '180');
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['13'], eventName: 'Contacted', crmStatus: 'contacted' }
    ]));
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        data: {
          id: 4088,
          formId: 1,
          statusId: 13,
          updateAt: '2026-06-09 15:52:32',
          comment: [
            'IP: 95.46.141.82',
            'Quiz:',
            ' Domain: cartieua.adsquiz.io',
            'UTM:',
            ' utm_source: meta;',
            ' utm_medium: cpc;',
            ' utm_campaign: TOF|Quiz;',
            ' utm_content: AUDI-A6-Hook'
          ].join('\n'),
          fbclid: 'ClickId',
          contacts: [{
            phone: '+38 (063) 505-52-52',
            email: 'client@example.com',
            fName: 'Lyudmila',
            lName: 'Test'
          }]
        },
        info: {
          account: 'cartie',
          webhookType: 'order',
          webhookEvent: 'status_change'
        },
        meta: {
          fields: {
            statusId: {
              options: [{
                text: '📞 Контакт встановлено',
                value: 13
              }]
            }
          }
        }
      }
    });

    const statusTime = String(Math.floor(new Date('2026-06-09T12:52:32Z').getTime() / 1000));
    const eventId = `salesdrive:4088:Contacted:13:${statusTime}:b2c_bot_sandbox`;
    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Contacted', eventId });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith(null, 'Contacted', expect.objectContaining({
      eventId,
      entityId: '4088',
      phone: '+38 (063) 505-52-52',
      email: 'client@example.com',
      name: 'Lyudmila Test',
      firstName: 'Lyudmila',
      lastName: 'Test',
      clientIpAddress: '95.46.141.82',
      fbc: `fb.1.${Number(statusTime) * 1000}.ClickId`,
      eventSourceUrl: 'https://cartieua.adsquiz.io/',
      eventTime: statusTime,
      customData: expect.objectContaining({
        crm_status: 'contacted',
        salesdrive_account: 'cartie',
        salesdrive_form_id: '1',
        status_id: '13',
        status_name: '📞 Контакт встановлено',
        utm_source: 'meta',
        utm_medium: 'cpc',
        utm_campaign: 'TOF|Quiz',
        utm_content: 'AUDI-A6-Hook',
        event_source_url: 'https://cartieua.adsquiz.io/'
      })
    }));
  });

  it('uses SalesDrive contact con_iPN as Meta clientIpAddress when no comment IP exists', async () => {
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST', 'cartie');
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST', '1');
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['13'], eventName: 'Contacted', crmStatus: 'contacted' }
    ]));
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        data: {
          id: 4091,
          formId: 1,
          statusId: 13,
          updateAt: '2026-06-16T10:00:00Z',
          contacts: [{
            phone: '+38 (063) 505-52-52',
            email: 'client@example.com',
            fName: 'Contact',
            lName: 'Ip',
            con_iPN: '203.0.113.24'
          }]
        },
        info: {
          account: 'cartie',
          webhookEvent: 'status_change'
        }
      }
    });

    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Contacted' });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith(null, 'Contacted', expect.objectContaining({
      entityId: '4091',
      phone: '+38 (063) 505-52-52',
      email: 'client@example.com',
      firstName: 'Contact',
      lastName: 'Ip',
      clientIpAddress: '203.0.113.24'
    }));
  });

  it('uses SalesDrive monetary fields and default currency for configured Purchase webhooks', async () => {
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST', 'cartie');
    vi.stubEnv('SALESDRIVE_DEFAULT_CURRENCY', 'USD');
    vi.stubEnv('META_B2C_BOT_PURCHASE_ENABLED', 'true');
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', JSON.stringify([
      { statusIds: ['5'], eventName: 'Purchase', crmStatus: 'purchase', requireValue: true, requireCurrency: true }
    ]));
    const { handleSalesDriveWebhook } = await import('./salesdriveWebhook.service.js');

    const result = await handleSalesDriveWebhook({
      headers: { 'x-salesdrive-webhook-secret': 'webhook-secret' },
      query: {},
      body: {
        data: {
          id: 4089,
          formId: 1,
          statusId: 5,
          updateAt: '2026-05-25T13:00:00Z',
          contacts: [{ phone: '+38 (063) 505-52-52' }],
          paymentAmount: '19 950'
        },
        info: {
          account: 'cartie',
          webhookEvent: 'status_change'
        },
        meta: {
          fields: {
            statusId: {
              options: [{
                text: '🔥  Авто куплено',
                value: 5
              }]
            }
          }
        }
      }
    });

    expect(result).toMatchObject({ ok: true, sent: true, eventName: 'Purchase' });
    expect(trackB2CBotCrmLifecycleEventMock).toHaveBeenCalledWith(null, 'Purchase', expect.objectContaining({
      entityId: '4089',
      value: 19950,
      currency: 'USD',
      customData: expect.objectContaining({
        crm_status: 'purchase',
        salesdrive_account: 'cartie',
        status_id: '5',
        status_name: '🔥  Авто куплено'
      })
    }));
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
