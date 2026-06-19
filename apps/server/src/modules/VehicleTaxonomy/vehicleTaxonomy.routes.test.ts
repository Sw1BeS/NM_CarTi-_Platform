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
  collectObservedInventoryCandidates: vi.fn(),
  listCandidates: vi.fn(),
  reviewCandidate: vi.fn()
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

  it('passes full import sync options from admin API to the sync service', async () => {
    syncServiceMock.startSync.mockResolvedValue({
      id: 'sync_full',
      status: 'DRY_RUN',
      dryRun: true,
      counts: { makes: 2 }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/vehicle-taxonomy/sync')
      .set('authorization', 'Bearer test')
      .send({
        sources: 'AUTO_RIA,KATOTTG',
        dryRun: true,
        countryCode: 'ua',
        allModels: true,
        modelMakeOffset: 25,
        modelFetchConcurrency: 4,
        skipAutoriaSpecs: true,
        skipAutoriaPlaces: true,
        includeSettlements: true,
        categoryId: 1,
        vehicleType: 'car'
      });

    expect(res.status).toBe(200);
    expect(syncServiceMock.startSync).toHaveBeenCalledWith({
      sources: ['AUTO_RIA', 'KATOTTG'],
      dryRun: true,
      countryCode: 'ua',
      modelMakeLimit: null,
      modelMakeOffset: 25,
      modelFetchConcurrency: 4,
      skipAutoriaSpecOptions: true,
      skipAutoriaPlaces: true,
      categoryId: 1,
      vehicleType: 'car',
      includeSettlements: true
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

  it('lists candidate queue behind auth with filters', async () => {
    candidateServiceMock.listCandidates.mockResolvedValue([
      { id: 'candidate_1', kind: 'city', label: 'Київ обл', status: 'NEW' }
    ]);
    const app = await buildApp();

    const res = await request(app)
      .get('/api/vehicle-taxonomy/candidates?kind=city&status=NEW&limit=20')
      .set('authorization', 'Bearer test');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      candidates: [{ id: 'candidate_1', kind: 'city', status: 'NEW' }]
    });
    expect(candidateServiceMock.listCandidates).toHaveBeenCalledWith({
      kind: 'city',
      status: 'NEW',
      limit: 20
    });
  });

  it('reviews candidates and can approve them as normalization aliases', async () => {
    candidateServiceMock.reviewCandidate.mockResolvedValue({
      candidate: { id: 'candidate_1', status: 'APPROVED', reviewedAt: new Date('2026-06-19T10:00:00.000Z') },
      alias: { id: 'alias_1', alias: 'Тесла', canonical: 'Tesla' }
    });
    const app = await buildApp();

    const res = await request(app)
      .post('/api/vehicle-taxonomy/candidates/candidate_1/review')
      .set('authorization', 'Bearer test')
      .send({ status: 'APPROVED', canonicalLabel: 'Tesla' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      candidate: { id: 'candidate_1', status: 'APPROVED' },
      alias: { id: 'alias_1', canonical: 'Tesla' }
    });
    expect(candidateServiceMock.reviewCandidate).toHaveBeenCalledWith({
      id: 'candidate_1',
      status: 'APPROVED',
      canonicalLabel: 'Tesla',
      companyId: 'company_1'
    });
  });

  it('rejects invalid candidate review status', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/vehicle-taxonomy/candidates/candidate_1/review')
      .set('authorization', 'Bearer test')
      .send({ status: 'maybe' });

    expect(res.status).toBe(400);
    expect(candidateServiceMock.reviewCandidate).not.toHaveBeenCalled();
  });
});
