import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authenticateTokenMock,
  handleSalesDriveWebhookMock
} = vi.hoisted(() => ({
  authenticateTokenMock: vi.fn(),
  handleSalesDriveWebhookMock: vi.fn()
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: authenticateTokenMock,
  requireRole: () => (_req: any, _res: any, next: any) => next()
}));

vi.mock('../../middleware/companyContext.js', () => ({
  companyContext: (_req: any, _res: any, next: any) => next()
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: {
    integrationEventLog: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn()
    }
  }
}));

vi.mock('./salesdrive/salesdriveWebhook.service.js', () => ({
  handleSalesDriveWebhook: handleSalesDriveWebhookMock
}));

const buildApp = async () => {
  const { default: integrationRoutes } = await import('./integration.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/integrations', integrationRoutes);
  return app;
};

describe('integration routes SalesDrive webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateTokenMock.mockImplementation((_req: any, res: any) => res.status(418).json({ error: 'auth-called' }));
  });

  it('accepts SalesDrive webhook without admin JWT and delegates to the webhook service', async () => {
    handleSalesDriveWebhookMock.mockResolvedValueOnce({ ok: true, sent: false, reason: 'status_skipped' });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/integrations/salesdrive/webhook')
      .set('x-salesdrive-webhook-secret', 'webhook-secret')
      .send({ order_id: '37193', status_id: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, sent: false, reason: 'status_skipped' });
    expect(authenticateTokenMock).not.toHaveBeenCalled();
    expect(handleSalesDriveWebhookMock).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ 'x-salesdrive-webhook-secret': 'webhook-secret' }),
      body: expect.objectContaining({ order_id: '37193', status_id: 1 })
    }));
  });

  it('returns webhook service rejection status for invalid secrets', async () => {
    handleSalesDriveWebhookMock.mockResolvedValueOnce({ ok: false, statusCode: 401, reason: 'INVALID_SECRET' });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/integrations/salesdrive/webhook')
      .set('x-salesdrive-webhook-secret', 'wrong')
      .send({ order_id: '37193', status_id: 13 });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ ok: false, reason: 'INVALID_SECRET' });
    expect(authenticateTokenMock).not.toHaveBeenCalled();
  });
});
