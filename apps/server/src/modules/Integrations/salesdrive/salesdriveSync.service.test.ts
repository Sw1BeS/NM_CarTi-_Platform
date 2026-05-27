import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueSalesDriveRequestSync, processSalesDriveRequestSyncQueue, salesDriveOrderInputFromRequest } from './salesdriveSync.service.js';
vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    integrationEventLog: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    b2bRequest: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    lead: {
      update: vi.fn()
    },
    leadIdentity: {
      upsert: vi.fn()
    }
  }
}));

import { prisma } from '../../../services/prisma.js';
import { randomUUID } from 'crypto';

describe('SalesDrive Sync Service', () => {
  describe('salesDriveOrderInputFromRequest (Mapper)', () => {
    it('should map a B2B request properly', () => {
      const mockRequest = {
        id: 'req_123',
        publicId: 'REQ-001',
        title: 'Toyota Camry 2022',
        budgetMax: 20000,
        description: 'Need a black car',
        requesterPartnerId: 'partner_abc',
        lead: {
          clientName: 'Dealer Joe',
          phone: '+1234567890'
        },
        payload: {
          tracking: {
            utm_campaign: 'b2b_promo'
          }
        }
      };

      const result = salesDriveOrderInputFromRequest(mockRequest);
      expect(result.externalId).toBe('REQ-001');
      expect(result.name).toBe('Dealer Joe');
      expect(result.phone).toBe('+1234567890');
      expect(result.comment).toContain('Тип: B2B');
      expect(result.comment).toContain('Авто: Toyota Camry 2022');
      expect(result.comment).toContain('Бюджет: 20000');
      expect(result.comment).toContain('UTM: b2b_promo');
      expect(result.products[0].costPerItem).toBe(20000);
      expect(result.products[0].name).toBe('Toyota Camry 2022');
    });

    it('should map a MiniApp lead request properly', () => {
      const mockRequest = {
        id: 'req_456',
        publicId: 'REQ-002',
        title: 'Honda Civic',
        lead: {
          clientName: 'Alice',
          payload: {
            telegramUsername: 'alice123'
          }
        },
        payload: {
          phone: '+9876543210',
          source: 'miniapp_intent',
          tracking: {
            utm_source: 'fb'
          }
        }
      };

      const result = salesDriveOrderInputFromRequest(mockRequest);
      expect(result.comment).toContain('Тип: Mini App');
      expect(result.comment).toContain('Telegram: @alice123');
      expect(result.name).toBe('Alice');
      expect(result.phone).toBe('+9876543210');
      expect(result.utm?.source).toBe('fb');
    });

    it('maps B2C bot requests with explicit sector source and request metadata in comment', () => {
      const mockRequest = {
        id: 'req_b2c',
        publicId: 'RQ-B2C-9',
        title: 'Підбір авто',
        budgetMax: 25000,
        requesterPartnerId: null,
        lead: {
          clientName: 'Client B2C',
          phone: '+380635055252',
          payload: {
            source: 'b2c_bot'
          }
        },
        payload: {
          direction: 'B2C',
          source: 'b2c_bot',
          surface: 'telegram_bot',
          request_type: 'client_auto_selection',
          destination_key: 'b2c_bot_sandbox',
          cartie_request_id: 'RQ-B2C-9',
          attribution: {
            token: 'AbC_token_123456',
            destination: 'b2c_bot_sandbox',
            query: {
              utm_source: 'meta',
              utm_campaign: 'spring'
            },
            identifiers: {
              fbp: 'fb.1.1779865200000.123456789',
              fbc: 'fb.1.1779865200000.ClickId'
            },
            event_source_url: 'https://cartie.test/r/bot?fbclid=ClickId',
            created_at: '2026-05-27T07:00:00.000Z',
            expires_at: '2026-06-26T07:00:00.000Z'
          },
          tracking: {
            utm_source: 'telegram'
          }
        }
      };

      const result = salesDriveOrderInputFromRequest(mockRequest);

      expect(result.name).toBe('Client B2C');
      expect(result.phone).toBe('+380635055252');
      expect(result.comment).toContain('CarTié B2C');
      expect(result.comment).toContain('source=b2c_bot');
      expect(result.comment).toContain('request_type=client_auto_selection');
      expect(result.comment).toContain('cartie_request_id=RQ-B2C-9');
      expect(result.comment).toContain('Attribution: token_prefix=AbC_toke campaign=spring source=meta has_fbc=true has_fbp=true');
      expect(result.utm?.source).toBe('meta');
      expect(result.utm?.campaign).toBe('spring');
      expect(result.site).toBe('https://cartie.test/r/bot?fbclid=ClickId');
    });

    it('should fall back to LeadBot when source is not MiniApp and not B2B', () => {
      const mockRequest = {
        id: 'req_789',
        publicId: 'REQ-003',
        lead: {
          payload: {
            telegramUserId: '88888888'
          }
        },
        payload: {}
      };

      const result = salesDriveOrderInputFromRequest(mockRequest);
      expect(result.comment).toContain('Тип: LeadBot');
      expect(result.comment).toContain('Telegram: 88888888');
    });
  });

  describe('enqueueSalesDriveRequestSync', () => {
    let companyId = 'test-company-123';

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should successfully queue an event and handle idempotency', async () => {
      const requestId = 'req_' + randomUUID().slice(0, 8);

      // Mock DB for first enqueue (no existing log)
      vi.mocked(prisma.integrationEventLog.create).mockResolvedValueOnce({
        id: 'log-1',
        action: 'REQUEST_SYNC_QUEUED',
        status: 'OK'
      } as any);

      const config = {
        configured: true,
        syncEnabled: true,
        writeEnabled: true,
        baseUrl: 'https://test.salesdrive.me',
        missing: []
      };

      // 1. Enqueue should succeed
      const res1 = await enqueueSalesDriveRequestSync({ companyId, requestId }, config as any);
      expect(res1.queued).toBe(true);
      expect(prisma.integrationEventLog.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          action: 'REQUEST_SYNC_QUEUED',
          idempotencyKey: `salesdrive:sync:request:${requestId}`
        })
      }));

      // 2. Second enqueue simulates Prisma throwing a Unique Constraint Error
      vi.mocked(prisma.integrationEventLog.create).mockRejectedValueOnce({
        code: 'P2002',
        meta: { target: ['idempotencyKey'] }
      });

      const res2 = await enqueueSalesDriveRequestSync({ companyId, requestId }, config as any);
      expect(res2.queued).toBe(false);
      expect(res2.duplicate).toBe(true);
    });
  });

  describe('processSalesDriveRequestSyncQueue', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('stores SalesDrive order id on the synced B2C request and lead payload after successful send', async () => {
      const config = {
        baseUrl: 'https://test.salesdrive.me',
        apiKey: 'form-key',
        orderCreatePath: '/handler/',
        orderListPath: '/api/order/list/',
        statusesPath: '/api/statuses/',
        syncEnabled: true,
        writeEnabled: true,
        timeoutMs: 8000,
        missing: []
      };
      vi.mocked(prisma.integrationEventLog.findMany).mockResolvedValueOnce([{
        id: 'log_1',
        companyId: 'company_1',
        entityType: 'request',
        entityId: 'req_b2c',
        meta: {}
      }] as any);
      vi.mocked(prisma.b2bRequest.findUnique).mockResolvedValueOnce({
        id: 'req_b2c',
        publicId: 'RQ-B2C-9',
        companyId: 'company_1',
        leadId: 'lead_1',
        title: 'Підбір авто',
        requesterPartnerId: null,
        payload: {
          direction: 'B2C',
          source: 'b2c_bot',
          destination_key: 'b2c_bot_sandbox',
          attribution: {
            token: 'AbC_token_123456',
            destination: 'b2c_bot_sandbox',
            query: {},
            identifiers: {},
            created_at: '2026-05-27T07:00:00.000Z',
            expires_at: '2026-06-26T07:00:00.000Z'
          }
        },
        lead: {
          id: 'lead_1',
          clientName: 'Client B2C',
          phone: '+380635055252',
          payload: {
            source: 'b2c_bot'
          }
        }
      } as any);
      vi.mocked(prisma.integrationEventLog.update).mockResolvedValue({ id: 'log_1' } as any);
      vi.mocked(prisma.b2bRequest.update).mockResolvedValue({ id: 'req_b2c' } as any);
      vi.mocked(prisma.lead.update).mockResolvedValue({ id: 'lead_1' } as any);
      vi.mocked(prisma.leadIdentity.upsert).mockResolvedValue({ id: 'identity_1' } as any);
      const fetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: { orderId: 37193, userId: 24 } })
      });

      const result = await processSalesDriveRequestSyncQueue({ companyId: 'company_1', requestId: 'req_b2c' }, config, fetcher);

      expect(result).toMatchObject({ processed: 1, sent: 1, failed: 0 });
      expect(prisma.b2bRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'req_b2c' },
        data: {
          payload: expect.objectContaining({
            source: 'b2c_bot',
            salesdrive_order_id: '37193',
            salesdrive_sync_status: 'sent'
          })
        }
      }));
      expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'lead_1' },
        data: {
          payload: expect.objectContaining({
            source: 'b2c_bot',
            salesdrive_order_id: '37193',
            salesdrive_sync_status: 'sent'
          })
        }
      }));
      expect(prisma.leadIdentity.upsert).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          companyId_provider_externalId: {
            companyId: 'company_1',
            provider: 'SALESDRIVE',
            externalId: '37193'
          }
        },
        create: expect.objectContaining({
          payload: expect.objectContaining({
            attributionToken: 'AbC_token_123456'
          })
        })
      }));
    });
  });
});
