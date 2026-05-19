import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  b2bRequestFindUniqueMock,
  integrationEventLogCreateMock,
  integrationEventLogFindManyMock,
  integrationEventLogUpdateMock
} = vi.hoisted(() => ({
  b2bRequestFindUniqueMock: vi.fn(),
  integrationEventLogCreateMock: vi.fn(),
  integrationEventLogFindManyMock: vi.fn(),
  integrationEventLogUpdateMock: vi.fn()
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    b2bRequest: {
      findUnique: b2bRequestFindUniqueMock
    },
    integrationEventLog: {
      create: integrationEventLogCreateMock,
      findMany: integrationEventLogFindManyMock,
      update: integrationEventLogUpdateMock
    }
  }
}));

import { enqueueSalesDriveRequestSync, processSalesDriveRequestSyncQueue } from './salesdriveSync.service.js';
import { readSalesDriveConfig } from './salesdrive.connector.js';

describe('salesdriveSync.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    integrationEventLogCreateMock.mockResolvedValue({ id: 'log_1' });
    integrationEventLogFindManyMock.mockResolvedValue([]);
    integrationEventLogUpdateMock.mockResolvedValue({});
  });

  it('logs a safe skipped sync intent when SalesDrive is not configured', async () => {
    const result = await enqueueSalesDriveRequestSync({
      companyId: 'company_1',
      requestId: 'request_1',
      requestPublicId: 'REQ-1',
      leadId: 'lead_1',
      botId: 'bot_1',
      source: 'miniapp'
    }, readSalesDriveConfig({}));

    expect(result).toMatchObject({ queued: false, reason: 'CONFIG_MISSING' });
    expect(integrationEventLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company_1',
        integration: 'SALESDRIVE',
        action: 'REQUEST_SYNC_SKIPPED',
        status: 'WARN',
        entityType: 'request',
        entityId: 'request_1',
        idempotencyKey: 'salesdrive:sync:request:request_1',
        meta: expect.objectContaining({
          requestPublicId: 'REQ-1',
          leadId: 'lead_1',
          botId: 'bot_1',
          reason: 'CONFIG_MISSING',
          configured: false,
          syncEnabled: false,
          writeEnabled: false,
          missing: ['SALESDRIVE_API_BASE_URL', 'SALESDRIVE_API_KEY']
        })
      })
    });
    expect(JSON.stringify(integrationEventLogCreateMock.mock.calls[0][0])).not.toContain('secret-key');
  });

  it('queues an idempotent request sync intent only when sync and writes are explicitly enabled', async () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key',
      SALESDRIVE_SYNC_ENABLED: 'true',
      SALESDRIVE_WRITE_ENABLED: 'true'
    });

    const result = await enqueueSalesDriveRequestSync({
      companyId: 'company_1',
      requestId: 'request_2',
      requestPublicId: 'REQ-2',
      source: 'leadbot'
    }, config);

    expect(result).toMatchObject({ queued: true, reason: 'QUEUED' });
    expect(integrationEventLogCreateMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        integration: 'SALESDRIVE',
        action: 'REQUEST_SYNC_QUEUED',
        status: 'OK',
        entityType: 'request',
        entityId: 'request_2',
        idempotencyKey: 'salesdrive:sync:request:request_2',
        meta: expect.objectContaining({
          requestPublicId: 'REQ-2',
          source: 'leadbot',
          reason: 'QUEUED',
          configured: true,
          syncEnabled: true,
          writeEnabled: true
        })
      })
    });
  });

  it('treats repeated enqueue attempts as idempotent duplicates', async () => {
    integrationEventLogCreateMock.mockRejectedValueOnce({ code: 'P2002' });
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key',
      SALESDRIVE_SYNC_ENABLED: 'true',
      SALESDRIVE_WRITE_ENABLED: 'true'
    });

    const result = await enqueueSalesDriveRequestSync({
      companyId: 'company_1',
      requestId: 'request_2'
    }, config);

    expect(result).toMatchObject({ queued: false, duplicate: true, reason: 'DUPLICATE' });
  });

  it('processes queued request sync intents through SalesDrive add-order API', async () => {
    integrationEventLogFindManyMock.mockResolvedValueOnce([
      {
        id: 'log_queued_1',
        companyId: 'company_1',
        entityId: 'request_1',
        meta: {
          requestPublicId: 'REQ-1',
          source: 'miniapp_request'
        }
      }
    ]);
    b2bRequestFindUniqueMock.mockResolvedValueOnce({
      id: 'request_1',
      publicId: 'REQ-1',
      title: 'Запит: Hyundai Ioniq 5',
      description: 'Коментар: цікавить авто',
      budgetMax: 16000,
      payload: {
        tracking: {
          utm_source: 'facebook',
          utm_campaign: 'spring'
        }
      },
      lead: {
        id: 'lead_1',
        clientName: 'Ivan Client',
        phone: '+380635055252',
        payload: {}
      }
    });
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key',
      SALESDRIVE_SYNC_ENABLED: 'true',
      SALESDRIVE_WRITE_ENABLED: 'true'
    });
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({ success: true, data: { orderId: 37193 } })
    });

    const result = await processSalesDriveRequestSyncQueue({ companyId: 'company_1' }, config, fetcher);

    expect(result).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    expect(fetcher).toHaveBeenCalledWith(
      'https://demo.salesdrive.me/handler/',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"externalId":"REQ-1"')
      })
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body).toMatchObject({
      form: 'secret-key',
      phone: '+380635055252',
      fName: 'Ivan',
      lName: 'Client',
      externalId: 'REQ-1',
      prodex24source: 'facebook',
      prodex24campaign: 'spring'
    });
    expect(integrationEventLogUpdateMock).toHaveBeenCalledWith({
      where: { id: 'log_queued_1' },
      data: expect.objectContaining({
        action: 'REQUEST_SYNC_SENT',
        status: 'OK',
        message: 'SalesDrive request sync sent'
      })
    });
    expect(JSON.stringify(integrationEventLogUpdateMock.mock.calls[0][0])).not.toContain('secret-key');
    expect(JSON.stringify(integrationEventLogUpdateMock.mock.calls[0][0])).not.toContain('+380635055252');
  });

  it('does not process queued request sync intents when write flag is disabled', async () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key',
      SALESDRIVE_SYNC_ENABLED: 'true',
      SALESDRIVE_WRITE_ENABLED: 'false'
    });
    const fetcher = vi.fn();

    const result = await processSalesDriveRequestSyncQueue({ companyId: 'company_1' }, config, fetcher);

    expect(result).toMatchObject({ processed: 0, sent: 0, failed: 0, reason: 'WRITE_DISABLED' });
    expect(integrationEventLogFindManyMock).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
