import { Router } from 'express';
import { requireRole } from '../../../middleware/auth.js';
import { errorResponse } from '../../../utils/errorResponse.js';
import { salesDriveService } from './salesdrive.service.js';

const router = Router();
const roles = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'];

const parsePositiveInt = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, Math.trunc(parsed)));
};

const readOptions = (source: Record<string, any>) => ({
  page: parsePositiveInt(source.page, 1, 100000),
  limit: parsePositiveInt(source.limit, 50, 100),
  orderTimeFrom: typeof source.orderTimeFrom === 'string' ? source.orderTimeFrom : undefined,
  updateAtFrom: typeof source.updateAtFrom === 'string' ? source.updateAtFrom : undefined,
  statusId: typeof source.statusId === 'string' || typeof source.statusId === 'number' ? source.statusId : undefined
});

router.get('/config', requireRole(roles), async (_req: any, res) => {
  res.json(salesDriveService.getConfig());
});

router.get('/health', requireRole(roles), async (req: any, res) => {
  try {
    const health = await salesDriveService.health(req.companyId);
    res.json(health);
  } catch (e: any) {
    return errorResponse(res, 500, e.message || 'SalesDrive health error', 'SALESDRIVE_HEALTH');
  }
});

router.get('/preview', requireRole(roles), async (req: any, res) => {
  try {
    const result = await salesDriveService.previewImport(req.companyId, readOptions(req.query || {}));
    res.json(result);
  } catch (e: any) {
    return errorResponse(res, 400, e.message || 'SalesDrive preview error', 'SALESDRIVE_PREVIEW');
  }
});

router.post('/preview', requireRole(roles), async (req: any, res) => {
  try {
    const result = await salesDriveService.previewImport(req.companyId, readOptions(req.body || {}));
    res.json(result);
  } catch (e: any) {
    return errorResponse(res, 400, e.message || 'SalesDrive preview error', 'SALESDRIVE_PREVIEW');
  }
});

export default router;
