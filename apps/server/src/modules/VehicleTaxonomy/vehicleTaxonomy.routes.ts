import { Router } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { errorResponse } from '../../utils/errorResponse.js';
import { vehicleTaxonomyCandidateService } from './vehicleTaxonomy.candidates.js';
import { vehicleTaxonomyService } from './vehicleTaxonomy.service.js';
import { vehicleTaxonomySyncService, type VehicleTaxonomySyncSource } from './vehicleTaxonomy.sync.service.js';

const router = Router();

const readString = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
};

const readSources = (value: unknown): VehicleTaxonomySyncSource[] | undefined => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => String(entry).split(',')).map((entry) => entry.trim()).filter(Boolean) as VehicleTaxonomySyncSource[];
  }
  if (typeof value === 'string') {
    return value.split(',').map((entry) => entry.trim()).filter(Boolean) as VehicleTaxonomySyncSource[];
  }
  return undefined;
};

const readNumber = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readCandidateStatus = (value: unknown) => {
  const status = readString(value)?.toUpperCase();
  return status === 'NEW' || status === 'APPROVED' || status === 'REJECTED' ? status : undefined;
};

const readCandidateKind = (value: unknown) => {
  const kind = readString(value);
  return kind === 'make' || kind === 'model' || kind === 'city' || kind === 'specOption' ? kind : undefined;
};

const readBoolean = (value: unknown) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;
  if (typeof raw !== 'string') return false;
  return ['1', 'true', 'yes', 'y'].includes(raw.trim().toLowerCase());
};

const readModelMakeLimit = (value: unknown, allModels: unknown) => {
  if (readBoolean(allModels)) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'string' && raw.trim().toLowerCase() === 'all') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

router.get('/public', async (req, res) => {
  try {
    const taxonomy = await vehicleTaxonomyService.getPublicTaxonomy({
      countryCode: readString(req.query.countryCode)
    });
    res.json({ ok: true, ...taxonomy });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load vehicle taxonomy';
    errorResponse(res, 500, message);
  }
});

router.post('/sync', authenticateToken, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const syncInput = {
      sources: readSources(req.body?.sources),
      dryRun: req.body?.dryRun !== false,
      countryCode: readString(req.body?.countryCode)
    } as {
      sources?: VehicleTaxonomySyncSource[];
      dryRun: boolean;
      countryCode?: string;
      modelMakeLimit?: number | null;
      modelMakeOffset?: number;
      modelFetchConcurrency?: number;
      categoryId?: number;
      vehicleType?: string;
      includeSettlements?: boolean;
    };
    const modelMakeLimit = readModelMakeLimit(req.body?.modelMakeLimit, req.body?.allModels);
    const modelMakeOffset = readNumber(req.body?.modelMakeOffset);
    const modelFetchConcurrency = readNumber(req.body?.modelFetchConcurrency);
    const categoryId = readNumber(req.body?.categoryId);
    const vehicleType = readString(req.body?.vehicleType);
    if (modelMakeLimit !== undefined) syncInput.modelMakeLimit = modelMakeLimit;
    if (modelMakeOffset !== undefined) syncInput.modelMakeOffset = modelMakeOffset;
    if (modelFetchConcurrency !== undefined) syncInput.modelFetchConcurrency = modelFetchConcurrency;
    if (categoryId !== undefined) syncInput.categoryId = categoryId;
    if (vehicleType !== undefined) syncInput.vehicleType = vehicleType;
    if (readBoolean(req.body?.includeSettlements)) syncInput.includeSettlements = true;

    const syncRun = await vehicleTaxonomySyncService.startSync(syncInput);
    res.json({ ok: true, syncRun });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start vehicle taxonomy sync';
    errorResponse(res, 400, message);
  }
});

router.get('/sync/status', authenticateToken, requireRole(['ADMIN', 'SUPER_ADMIN']), async (_req, res) => {
  try {
    const syncRun = await vehicleTaxonomySyncService.getLatestRun();
    res.json({ ok: true, syncRun });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load vehicle taxonomy sync status';
    errorResponse(res, 500, message);
  }
});

router.get('/candidates', authenticateToken, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const candidates = await vehicleTaxonomyCandidateService.listCandidates({
      kind: readCandidateKind(req.query.kind),
      status: readCandidateStatus(req.query.status),
      limit: readNumber(req.query.limit)
    });
    res.json({ ok: true, candidates });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load vehicle taxonomy candidates';
    errorResponse(res, 500, message);
  }
});

router.post('/candidates/scan-observed', authenticateToken, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await vehicleTaxonomyCandidateService.collectObservedInventoryCandidates({
      companyId: readString(req.body?.companyId) || user?.companyId || user?.workspaceId || null,
      limit: readNumber(req.body?.limit)
    });
    res.json({ ok: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to scan vehicle taxonomy candidates';
    errorResponse(res, 500, message);
  }
});

router.post('/candidates/:id/review', authenticateToken, requireRole(['ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const user = (req as any).user;
    const status = readCandidateStatus(req.body?.status);
    if (!status) return errorResponse(res, 400, 'status must be NEW, APPROVED, or REJECTED');

    const result = await vehicleTaxonomyCandidateService.reviewCandidate({
      id: req.params.id,
      status,
      canonicalLabel: readString(req.body?.canonicalLabel),
      companyId: readString(req.body?.companyId) || user?.companyId || user?.workspaceId || null
    });
    res.json({ ok: true, ...result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to review vehicle taxonomy candidate';
    errorResponse(res, 400, message);
  }
});

export default router;
