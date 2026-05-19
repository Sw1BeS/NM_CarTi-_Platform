import { describe, expect, it, vi } from 'vitest';
import {
  buildSalesDriveImportPreview,
  buildSalesDriveOrderAddPayload,
  checkSalesDriveHealth,
  createSalesDriveOrder,
  fetchSalesDriveOrderList,
  readSalesDriveConfig,
  salesDriveHeaders,
  toSafeSalesDriveConfig
} from './salesdrive.connector.js';

const okResponse = (body: unknown, status = 200) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  statusText: status >= 200 && status < 300 ? 'OK' : 'ERROR',
  text: async () => JSON.stringify(body)
});

describe('SalesDrive connector', () => {
  it('reads safe env config with write sync disabled by default', () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me/',
      SALESDRIVE_API_KEY: 'secret-key'
    });

    expect(config.baseUrl).toBe('https://demo.salesdrive.me');
    expect(config.orderListPath).toBe('/api/order/list/');
    expect(config.orderCreatePath).toBe('/handler/');
    expect(config.statusesPath).toBe('/api/statuses/');
    expect(config.syncEnabled).toBe(false);
    expect(config.writeEnabled).toBe(false);
    expect(salesDriveHeaders(config)).toMatchObject({ 'Form-Api-Key': 'secret-key' });
    expect(toSafeSalesDriveConfig(config)).toMatchObject({
      configured: true,
      apiKeyConfigured: true,
      syncEnabled: false,
      writeEnabled: false
    });
    expect(toSafeSalesDriveConfig(config)).not.toHaveProperty('apiKey');
  });

  it('returns config-missing health without calling SalesDrive', async () => {
    const fetcher = vi.fn();
    const health = await checkSalesDriveHealth(readSalesDriveConfig({}), fetcher);

    expect(health).toMatchObject({
      configured: false,
      status: 'CONFIG_MISSING'
    });
    expect(health.config.apiKeyConfigured).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks health through the read-only statuses endpoint', async () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key'
    });
    const fetcher = vi.fn().mockResolvedValue(await okResponse({ success: true }));

    const health = await checkSalesDriveHealth(config, fetcher);

    expect(health.status).toBe('OK');
    expect(fetcher).toHaveBeenCalledWith(
      'https://demo.salesdrive.me/api/statuses/',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'Form-Api-Key': 'secret-key' })
      })
    );
  });

  it('fetches order list with official SalesDrive read-list params', async () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key'
    });
    const fetcher = vi.fn().mockResolvedValue(await okResponse({
      data: [{ id: 123, phone: '0635055252', fName: 'Ivan' }]
    }));

    const result = await fetchSalesDriveOrderList({
      page: 2,
      limit: 25,
      updateAtFrom: '2026-05-01 00:00:00',
      statusId: 3
    }, config, fetcher);

    expect(result.rows).toHaveLength(1);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/order/list/');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('filter[updateAt][from]')).toBe('2026-05-01 00:00:00');
    expect(url.searchParams.get('filter[statusId]')).toBe('3');
  });

  it('builds SalesDrive add-order payload without leaking empty fields', () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key'
    });

    const payload = buildSalesDriveOrderAddPayload({
      externalId: 'REQ-123',
      name: 'Ivan Client',
      phone: '+380635055252',
      title: 'Запит: Hyundai Ioniq 5',
      comment: 'Source: LeadBot',
      utm: {
        source: 'facebook',
        campaign: 'spring'
      },
      products: [
        { id: 'car_1', name: 'Hyundai Ioniq 5', costPerItem: 16000, amount: 1 }
      ]
    }, config);

    expect(payload).toMatchObject({
      form: 'secret-key',
      getResultData: 1,
      externalId: 'REQ-123',
      fName: 'Ivan',
      lName: 'Client',
      phone: '+380635055252',
      comment: expect.stringContaining('Source: LeadBot'),
      prodex24source: 'facebook',
      prodex24campaign: 'spring',
      products: [
        expect.objectContaining({
          id: 'car_1',
          name: 'Hyundai Ioniq 5',
          costPerItem: 16000,
          amount: 1
        })
      ]
    });
    expect(payload).not.toHaveProperty('email');
  });

  it('posts add-order payload only when SalesDrive sync and writes are enabled', async () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key',
      SALESDRIVE_SYNC_ENABLED: 'true',
      SALESDRIVE_WRITE_ENABLED: 'true'
    });
    const fetcher = vi.fn().mockResolvedValue(await okResponse({
      success: true,
      data: { orderId: 37193, userId: 8 }
    }));

    const result = await createSalesDriveOrder({
      externalId: 'REQ-123',
      name: 'Ivan Client',
      phone: '+380635055252',
      title: 'Запит: Hyundai Ioniq 5'
    }, config, fetcher);

    expect(result).toMatchObject({
      success: true,
      orderId: 37193,
      userId: 8,
      externalId: 'REQ-123'
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://demo.salesdrive.me/handler/',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"externalId":"REQ-123"')
      })
    );
  });

  it('blocks SalesDrive add-order calls when write flag is disabled', async () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key',
      SALESDRIVE_SYNC_ENABLED: 'true',
      SALESDRIVE_WRITE_ENABLED: 'false'
    });
    const fetcher = vi.fn();

    await expect(createSalesDriveOrder({
      externalId: 'REQ-123',
      phone: '+380635055252'
    }, config, fetcher)).rejects.toThrow('SalesDrive writes are disabled');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('builds dry-run import preview candidates without writing data', () => {
    const preview = buildSalesDriveImportPreview([
      {
        id: 123,
        fName: 'Ivan',
        lName: 'Client',
        phone: '063 505 52 52',
        email: 'client@example.com',
        statusName: 'New',
        orderTime: '2026-05-18 10:00:00',
        products: [{ id: 'car_1', name: 'Hyundai Ioniq 5', costPerItem: 16000 }]
      }
    ]);

    expect(preview).toEqual([
      expect.objectContaining({
        source: 'SALESDRIVE',
        externalId: '123',
        idempotencyKey: 'salesdrive:order:123',
        contactCandidate: expect.objectContaining({
          name: 'Ivan Client',
          phone: '+380635055252',
          email: 'client@example.com',
          salesDriveExternalId: '123'
        }),
        requestCandidate: expect.objectContaining({
          source: 'SALESDRIVE',
          title: 'Hyundai Ioniq 5',
          status: 'New',
          external: { salesDriveOrderId: '123' }
        }),
        warnings: []
      })
    ]);
  });

  it('redacts key and phone from health errors', async () => {
    const config = readSalesDriveConfig({
      SALESDRIVE_API_BASE_URL: 'https://demo.salesdrive.me',
      SALESDRIVE_API_KEY: 'secret-key'
    });
    const fetcher = vi.fn().mockResolvedValue(await okResponse({
      error: 'secret-key invalid for +380635055252'
    }, 403));

    const health = await checkSalesDriveHealth(config, fetcher);

    expect(health.status).toBe('ERROR');
    expect(health.message).toContain('[redacted-salesdrive-key]');
    expect(health.message).toContain('[redacted-phone]');
  });
});
