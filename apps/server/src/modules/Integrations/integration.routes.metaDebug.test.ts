import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  integrationEventLogFindFirstMock,
  integrationEventLogGroupByMock
} = vi.hoisted(() => ({
  integrationEventLogFindFirstMock: vi.fn(),
  integrationEventLogGroupByMock: vi.fn()
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: {
    integrationEventLog: {
      findFirst: integrationEventLogFindFirstMock,
      groupBy: integrationEventLogGroupByMock
    }
  }
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'user_1',
      role: 'ADMIN',
      companyId: 'company_1',
      workspaceId: 'company_1'
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next()
}));

vi.mock('../../middleware/companyContext.js', () => ({
  companyContext: (req: any, _res: any, next: any) => {
    req.companyId = req.user?.companyId || 'company_1';
    req.workspaceId = req.user?.workspaceId || 'company_1';
    next();
  }
}));

const buildApp = async () => {
  const { default: integrationRoutes } = await import('./integration.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/integrations', integrationRoutes);
  return app;
};

describe('integration routes Meta debug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('META_CAPI_ENABLED', 'false');
    integrationEventLogFindFirstMock
      .mockResolvedValueOnce({
        action: 'Lead',
        status: 'SUCCESS',
        entityType: 'miniapp_event',
        entityId: 'event_1',
        idempotencyKey: 'meta:company_1:Lead:miniapp_event:event_1:LeadSubmit',
        message: 'Meta CAPI event Lead sent',
        meta: {
          eventId: 'event_1',
          hasPhone: true,
          hasEmail: false,
          accessToken: 'must-not-leak',
          phone: '+380635055252'
        },
        createdAt: new Date('2026-05-19T06:00:00Z')
      })
      .mockResolvedValueOnce({
        action: 'miniapp.tracking_bound',
        status: 'SUCCESS',
        entityType: 'request',
        entityId: 'req_1',
        idempotencyKey: 'miniapp-tracking-bound:company_1:req_1:submit_1',
        message: 'MiniApp tracking bound to finalized request',
        meta: {
          trackingEventId: 'event_1',
          requestId: 'req_1',
          requestPublicId: 'REQ-1',
          leadId: 'lead_1',
          submitId: 'submit_1',
          hasFbp: true,
          hasFbc: true,
          phone: '+380635055252'
        },
        createdAt: new Date('2026-05-19T06:02:00Z')
      })
      .mockResolvedValueOnce({
        action: 'Lead',
        status: 'ERROR',
        entityType: 'miniapp_event',
        entityId: 'event_2',
        idempotencyKey: 'meta:company_1:Lead:miniapp_event:event_2:LeadSubmit',
        message: 'Bad token [redacted-token] for [redacted-phone]',
        meta: {
          eventId: 'event_2',
          rawPhone: '+380635055252'
        },
        createdAt: new Date('2026-05-19T06:05:00Z')
      });
    integrationEventLogGroupByMock
      .mockResolvedValueOnce([
        { status: 'SUCCESS', _count: { _all: 3 } },
        { status: 'ERROR', _count: { _all: 1 } }
      ])
      .mockResolvedValueOnce([
        { action: 'Lead', _count: { _all: 2 } },
        { action: 'ViewContent', _count: { _all: 2 } },
        { action: 'miniapp.tracking_bound', _count: { _all: 1 } }
      ])
      .mockResolvedValueOnce([
        { entityType: 'request', _count: { _all: 2 } },
        { entityType: 'miniapp_event', _count: { _all: 2 } },
        { entityType: 'lead', _count: { _all: 1 } }
      ]);
  });

  it('returns safe Meta tracking debug summary without secrets or raw PII', async () => {
    const app = await buildApp();

    const res = await request(app)
      .get('/api/integrations/meta/debug')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(integrationEventLogFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId: 'company_1',
        integration: 'META_PIXEL',
        status: 'SUCCESS',
        action: { not: 'miniapp.tracking_bound' }
      }
    }));
    expect(integrationEventLogFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        companyId: 'company_1',
        integration: 'META_PIXEL',
        status: 'SUCCESS',
        action: 'miniapp.tracking_bound'
      }
    }));
    expect(integrationEventLogGroupByMock).toHaveBeenCalledWith(expect.objectContaining({
      by: ['status'],
      where: { companyId: 'company_1', integration: 'META_PIXEL' }
    }));
    expect(res.body).toMatchObject({
      integration: 'META_PIXEL',
      capiEnabled: false,
      counts: {
        byStatus: { SUCCESS: 3, ERROR: 1 },
        byAction: { Lead: 2, ViewContent: 2, 'miniapp.tracking_bound': 1 }
      },
      binding: {
        byEntityType: { request: 2, miniapp_event: 2, lead: 1 },
        requestBound: 2,
        leadBound: 1,
        miniappEventUnbound: 2,
        trackingBound: 1
      },
      lastSent: {
        action: 'Lead',
        status: 'SUCCESS',
        meta: {
          eventId: 'event_1',
          hasPhone: true,
          hasEmail: false
        }
      },
      lastBinding: {
        action: 'miniapp.tracking_bound',
        status: 'SUCCESS',
        entityType: 'request',
        entityId: 'req_1',
        meta: {
          trackingEventId: 'event_1',
          requestId: 'req_1',
          requestPublicId: 'REQ-1',
          leadId: 'lead_1',
          submitId: 'submit_1',
          hasFbp: true,
          hasFbc: true
        }
      },
      lastError: {
        status: 'ERROR',
        message: 'Bad token [redacted-token] for [redacted-phone]',
        meta: {
          eventId: 'event_2'
        }
      }
    });
    expect(JSON.stringify(res.body)).not.toContain('must-not-leak');
    expect(JSON.stringify(res.body)).not.toContain('+380635055252');
  });
});
