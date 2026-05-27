import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  integrationEventLogFindFirstMock,
  integrationEventLogGroupByMock,
  integrationEventLogCountMock,
  attributionSessionCountMock
} = vi.hoisted(() => ({
  integrationEventLogFindFirstMock: vi.fn(),
  integrationEventLogGroupByMock: vi.fn(),
  integrationEventLogCountMock: vi.fn(),
  attributionSessionCountMock: vi.fn()
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: {
    integrationEventLog: {
      findFirst: integrationEventLogFindFirstMock,
      groupBy: integrationEventLogGroupByMock,
      count: integrationEventLogCountMock
    },
    attributionSession: {
      count: attributionSessionCountMock
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
    vi.stubEnv('META_B2C_BOT_CAPI_ENABLED', 'true');
    vi.stubEnv('META_B2C_BOT_TEST_MODE', 'true');
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
      })
      .mockResolvedValueOnce({
        action: 'Contacted',
        status: 'SUCCESS',
        entityType: 'salesdrive_status',
        entityId: '37193',
        idempotencyKey: 'salesdrive:37193:Contacted:13:1779703200:b2c_bot_sandbox',
        message: 'Meta B2C bot event Contacted sent',
        meta: {
          mode: 'CRM_CONVERSION_LEADS',
          eventId: 'salesdrive:37193:Contacted:13:1779703200:b2c_bot_sandbox',
          destinationKey: 'b2c_bot_sandbox',
          fbtrace_id: 'trace_b2c',
          hasPhone: true,
          hasFbp: true,
          hasFbc: true,
          token: 'must-not-leak'
        },
        createdAt: new Date('2026-05-19T06:07:00Z')
      })
      .mockResolvedValueOnce({
        action: 'Contacted',
        status: 'SKIPPED',
        entityType: 'salesdrive_status',
        entityId: '37193',
        idempotencyKey: 'salesdrive:37193:Contacted:duplicate',
        message: 'Meta B2C bot duplicate success skipped',
        meta: {
          eventId: 'salesdrive:37193:Contacted:13:1779703200:b2c_bot_sandbox',
          destinationKey: 'b2c_bot_sandbox',
          reason: 'duplicate_success'
        },
        createdAt: new Date('2026-05-19T06:08:00Z')
      })
      .mockResolvedValueOnce({
        action: 'Contacted',
        status: 'ERROR',
        entityType: 'salesdrive_status',
        entityId: '37194',
        idempotencyKey: 'salesdrive:37194:Contacted:error',
        message: 'Bad token [redacted-token]',
        meta: {
          eventId: 'salesdrive:37194:Contacted:13:1779703200:b2c_bot_sandbox',
          destinationKey: 'b2c_bot_sandbox',
          rawPhone: '+380635055252'
        },
        createdAt: new Date('2026-05-19T06:09:00Z')
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
      ])
      .mockResolvedValueOnce([
        { status: 'SUCCESS', _count: { _all: 4 } },
        { status: 'SKIPPED', _count: { _all: 2 } },
        { status: 'ERROR', _count: { _all: 1 } }
      ])
      .mockResolvedValueOnce([
        { action: 'Lead', _count: { _all: 1 } },
        { action: 'Contacted', _count: { _all: 6 } }
      ]);
    integrationEventLogCountMock.mockResolvedValue(2);
    attributionSessionCountMock
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(6);
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
      },
      b2cCrm: {
        integration: 'META_B2C_BOT',
        capiEnabled: true,
        testMode: true,
        counts: {
          byStatus: { SUCCESS: 4, SKIPPED: 2, ERROR: 1 },
          byAction: { Lead: 1, Contacted: 6 },
          missingIdentifiers: 2
        },
        lastSent: {
          action: 'Contacted',
          status: 'SUCCESS',
          meta: {
            mode: 'CRM_CONVERSION_LEADS',
            eventId: 'salesdrive:37193:Contacted:13:1779703200:b2c_bot_sandbox',
            destinationKey: 'b2c_bot_sandbox',
            fbtrace_id: 'trace_b2c',
            hasPhone: true,
            hasFbp: true,
            hasFbc: true
          }
        },
        lastSkipped: {
          status: 'SKIPPED',
          meta: {
            destinationKey: 'b2c_bot_sandbox'
          }
        }
      },
      attributionSessions: {
        created: 10,
        expired: 3,
        consumed: 6
      }
    });
    expect(JSON.stringify(res.body)).not.toContain('must-not-leak');
    expect(JSON.stringify(res.body)).not.toContain('+380635055252');
  });
});
