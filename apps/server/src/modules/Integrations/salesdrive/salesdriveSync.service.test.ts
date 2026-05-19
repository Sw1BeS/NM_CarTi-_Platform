import { beforeEach, describe, expect, it, vi } from 'vitest';

const { integrationEventLogCreateMock } = vi.hoisted(() => ({
  integrationEventLogCreateMock: vi.fn()
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    integrationEventLog: {
      create: integrationEventLogCreateMock
    }
  }
}));

import { enqueueSalesDriveRequestSync } from './salesdriveSync.service.js';
import { readSalesDriveConfig } from './salesdrive.connector.js';

describe('salesdriveSync.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    integrationEventLogCreateMock.mockResolvedValue({ id: 'log_1' });
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
});
