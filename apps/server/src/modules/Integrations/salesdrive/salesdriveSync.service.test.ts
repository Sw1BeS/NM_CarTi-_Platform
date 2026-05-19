import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enqueueSalesDriveRequestSync, salesDriveOrderInputFromRequest } from './salesdriveSync.service.js';
vi.mock('../../../services/prisma.js', () => ({
  prisma: {
    integrationEventLog: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
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
});
