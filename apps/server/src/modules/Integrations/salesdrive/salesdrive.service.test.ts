import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildSalesDriveImportPreviewMock,
  fetchSalesDriveOrderListMock,
  logIntegrationEventMock,
  leadIdentityFindManyMock,
  integrationEventLogFindManyMock
} = vi.hoisted(() => ({
  buildSalesDriveImportPreviewMock: vi.fn(),
  fetchSalesDriveOrderListMock: vi.fn(),
  logIntegrationEventMock: vi.fn(),
  leadIdentityFindManyMock: vi.fn(),
  integrationEventLogFindManyMock: vi.fn()
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    leadIdentity: {
      findMany: leadIdentityFindManyMock
    },
    integrationEventLog: {
      findMany: integrationEventLogFindManyMock
    }
  }
}));

vi.mock('../../../services/integrationEventLog.service.js', () => ({
  logIntegrationEvent: logIntegrationEventMock
}));

vi.mock('./salesdrive.connector.js', () => ({
  SALESDRIVE_INTEGRATION: 'SALESDRIVE',
  buildSalesDriveImportPreview: buildSalesDriveImportPreviewMock,
  checkSalesDriveHealth: vi.fn(),
  fetchSalesDriveOrderList: fetchSalesDriveOrderListMock,
  readSalesDriveConfig: vi.fn(() => ({
    baseUrl: 'https://demo.salesdrive.me',
    apiKey: 'secret-key',
    orderCreatePath: '/handler/',
    orderListPath: '/api/order/list/',
    statusesPath: '/api/statuses/',
    syncEnabled: false,
    writeEnabled: false,
    timeoutMs: 8000,
    missing: []
  })),
  toSafeSalesDriveConfig: vi.fn((config) => ({
    baseUrl: config.baseUrl,
    orderCreatePath: config.orderCreatePath,
    orderListPath: config.orderListPath,
    statusesPath: config.statusesPath,
    syncEnabled: config.syncEnabled,
    writeEnabled: config.writeEnabled,
    timeoutMs: config.timeoutMs,
    missing: config.missing,
    configured: config.missing.length === 0,
    apiKeyConfigured: Boolean(config.apiKey)
  }))
}));

import { SalesDriveService } from './salesdrive.service.js';

describe('SalesDriveService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchSalesDriveOrderListMock.mockResolvedValue({
      page: 1,
      limit: 10,
      rows: [{ id: 123 }],
      raw: {}
    });
    buildSalesDriveImportPreviewMock.mockReturnValue([
      {
        source: 'SALESDRIVE',
        externalId: '123',
        idempotencyKey: 'salesdrive:order:123',
        contactCandidate: {
          salesDriveExternalId: '123'
        },
        requestCandidate: {
          source: 'SALESDRIVE',
          external: { salesDriveOrderId: '123' },
          criteria: {}
        },
        warnings: []
      }
    ]);
    leadIdentityFindManyMock.mockResolvedValue([]);
    integrationEventLogFindManyMock.mockResolvedValue([]);
    logIntegrationEventMock.mockResolvedValue(undefined);
  });

  it('annotates import preview items that already have a SalesDrive lead identity', async () => {
    leadIdentityFindManyMock.mockResolvedValueOnce([
      {
        externalId: '123',
        leadId: 'lead_1'
      }
    ]);

    const result = await new SalesDriveService().previewImport('company_1', { limit: 10 });

    expect(leadIdentityFindManyMock).toHaveBeenCalledWith({
      where: {
        companyId: 'company_1',
        provider: 'SALESDRIVE',
        externalId: { in: ['123'] }
      },
      select: { externalId: true, leadId: true }
    });
    expect(result.items[0]).toMatchObject({
      externalId: '123',
      duplicate: {
        provider: 'SALESDRIVE',
        leadId: 'lead_1'
      },
      warnings: ['existing_salesdrive_identity']
    });
    expect(logIntegrationEventMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'IMPORT_PREVIEW',
      meta: expect.objectContaining({
        dryRun: true,
        duplicateCount: 1
      })
    }));
  });

  it('returns a safe read-only request sync status summary', async () => {
    const now = new Date('2026-05-19T11:00:00.000Z');
    integrationEventLogFindManyMock.mockResolvedValueOnce([
      {
        action: 'REQUEST_SYNC_QUEUED',
        status: 'OK',
        entityId: 'request_queued',
        message: 'SalesDrive request sync queued',
        createdAt: now,
        meta: { requestPublicId: 'REQ-1', attempts: 0 }
      },
      {
        action: 'REQUEST_SYNC_SENT',
        status: 'OK',
        entityId: 'request_sent',
        message: 'SalesDrive request sync sent',
        createdAt: now,
        meta: { requestPublicId: 'REQ-2', salesDriveOrderId: '37193' }
      },
      {
        action: 'REQUEST_SYNC_QUEUED',
        status: 'ERROR',
        entityId: 'request_failed',
        message: 'Failed for [redacted-phone] and secret-key',
        createdAt: now,
        meta: { requestPublicId: 'REQ-3', attempts: 2, lastErrorAt: now.toISOString() }
      },
      {
        action: 'REQUEST_SYNC_SKIPPED',
        status: 'WARN',
        entityId: 'request_skipped',
        message: 'SalesDrive request sync skipped: WRITE_DISABLED',
        createdAt: now,
        meta: { requestPublicId: 'REQ-4', reason: 'WRITE_DISABLED' }
      }
    ]);

    const result = await new SalesDriveService().syncStatus('company_1');

    expect(integrationEventLogFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId: 'company_1',
        integration: 'SALESDRIVE',
        action: {
          in: ['REQUEST_SYNC_QUEUED', 'REQUEST_SYNC_SENT', 'REQUEST_SYNC_SKIPPED']
        }
      },
      take: 100
    }));
    expect(result.counts).toEqual({
      queued: 1,
      sent: 1,
      failed: 1,
      skipped: 1
    });
    expect(result.lastSent).toMatchObject({ requestId: 'request_sent', requestPublicId: 'REQ-2' });
    expect(result.lastError).toMatchObject({ requestId: 'request_failed', attempts: 2 });
    expect(JSON.stringify(result)).not.toContain('secret-key');
  });
});
