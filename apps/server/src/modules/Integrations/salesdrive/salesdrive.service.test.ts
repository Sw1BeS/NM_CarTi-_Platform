import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildSalesDriveImportPreviewMock,
  fetchSalesDriveOrderListMock,
  logIntegrationEventMock,
  leadIdentityFindManyMock
} = vi.hoisted(() => ({
  buildSalesDriveImportPreviewMock: vi.fn(),
  fetchSalesDriveOrderListMock: vi.fn(),
  logIntegrationEventMock: vi.fn(),
  leadIdentityFindManyMock: vi.fn()
}));

vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    leadIdentity: {
      findMany: leadIdentityFindManyMock
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
});
