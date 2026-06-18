import { Router } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { errorResponse } from '../../utils/errorResponse.js';
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
    const syncRun = await vehicleTaxonomySyncService.startSync({
      sources: readSources(req.body?.sources),
      dryRun: req.body?.dryRun !== false,
      countryCode: readString(req.body?.countryCode)
    });
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

export default router;
