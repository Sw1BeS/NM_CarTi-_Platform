import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const serviceMock = vi.hoisted(() => ({
  getPublicTaxonomy: vi.fn()
}));

const syncServiceMock = vi.hoisted(() => ({
  startSync: vi.fn(),
  getLatestRun: vi.fn()
}));

const candidateServiceMock = vi.hoisted(() => ({
  collectObservedInventoryCandidates: vi.fn()
}));

vi.mock('./vehicleTaxonomy.service.js', () => ({
  vehicleTaxonomyService: serviceMock
}));

vi.mock('./vehicleTaxonomy.sync.service.js', () => ({
  vehicleTaxonomySyncService: syncServiceMock
}));

vi.mock('./vehicleTaxonomy.candidates.js', () => ({
  vehicleTaxonomyCandidateService: candidateServiceMock
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    if (!req.get('authorization')) return res.status(401).json({ error: 'Unauthorized' });
    req.user = { role: 'ADMIN', companyId: 'company_1', workspaceId: 'company_1' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next()
}));

const buildApp = async () => {
  const { default: routes } = await import('./vehicleTaxonomy.routes.js');
  const app = express();
  app.use(express.json());
  app.use('/api/vehicle-taxonomy', routes);
  return app;
};

describe('vehicle taxonomy routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves public taxonomy without auth', async () => {
    serviceMock.getPublicTaxonomy.mockResolvedValue({
      version: 'test',
      source: 'LOCAL_SNAPSHOT',
      stale: false,
      brands: [],
      bodyTypes: [],
      fuels: [],
      transmissions: [],
      drives: [],
      cities: []
    });
    const app = await buildApp();

    const res = await request(app).get('/api/vehicle-taxonomy/public?countryCode=UA');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, version: 'test', source: 'LOCAL_SNAPSHOT' });
    expect(serviceMock.getPublicTaxonomy).toHaveBeenCalledWith({ countryCode: 'UA' });
  });

  it('requires auth for sync', async () => {
    const app = await buildApp();

    const res = await request(app).post('/api/vehicle-taxonomy/sync').send({ sources: ['NHTSA'] });

    expect(res.status).toBe(401);
    expect(syncServiceMock.startSync).not.toHaveBeenCalled();
  });

  it('starts an authenticated dry-run sync', async () => {
    syncServiceMock.startSync.mockResolvedValue({
      id: 'sync_1',
      status: 'SUCCESS',
      dryRun: true,
      counts: { makes: 1 }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/vehicle-taxonomy/sync')
      .set('authorization', 'Bearer test')
      .send({ sources: ['NHTSA'], dryRun: true, countryCode: 'UA' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, syncRun: { id: 'sync_1', dryRun: true } });
    expect(syncServiceMock.startSync).toHaveBeenCalledWith({
      sources: ['NHTSA'],
      dryRun: true,
      countryCode: 'UA'
    });
  });

  it('scans observed inventory into candidates behind auth', async () => {
    candidateServiceMock.collectObservedInventoryCandidates.mockResolvedValue({
      scanned: 1,
      rejectedModels: 1,
      recorded: 1
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/vehicle-taxonomy/candidates/scan-observed')
      .set('authorization', 'Bearer test')
      .send({ companyId: 'company_1', limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, result: { scanned: 1, recorded: 1 } });
    expect(candidateServiceMock.collectObservedInventoryCandidates).toHaveBeenCalledWith({
      companyId: 'company_1',
      limit: 10
    });
  });
});
