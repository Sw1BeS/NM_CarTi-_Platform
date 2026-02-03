import { Router } from 'express';
import { TelegramRegistryService } from './telegramRegistry.service.js';
import { requireRole } from '../../../middleware/auth.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();
const registryService = new TelegramRegistryService();
const registryRoles = ['OWNER', 'ADMIN', 'MANAGER'];

router.get('/registry', requireRole(registryRoles), async (req: any, res) => {
    try {
        const items = await registryService.list(req.companyId);
        res.json(items);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Registry error', 'TG_REGISTRY_ERROR');
    }
});

router.post('/registry', requireRole(registryRoles), async (req: any, res) => {
    try {
        const created = await registryService.create(req.companyId, req.body || {});
        res.json(created);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Registry validation error', 'TG_REGISTRY_VALIDATION');
    }
});

router.put('/registry/:id', requireRole(registryRoles), async (req: any, res) => {
    try {
        const updated = await registryService.update(req.companyId, req.params.id, req.body || {});
        res.json(updated);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Registry update error', 'TG_REGISTRY_ERROR');
    }
});

router.post('/registry/:id/pause', requireRole(registryRoles), async (req: any, res) => {
    try {
        const updated = await registryService.setStatus(req.companyId, req.params.id, 'PAUSED');
        res.json(updated);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Registry pause error', 'TG_REGISTRY_ERROR');
    }
});

router.post('/registry/:id/resume', requireRole(registryRoles), async (req: any, res) => {
    try {
        const updated = await registryService.setStatus(req.companyId, req.params.id, 'ACTIVE');
        res.json(updated);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Registry resume error', 'TG_REGISTRY_ERROR');
    }
});

router.post('/registry/:id/sync', requireRole(registryRoles), async (req: any, res) => {
    try {
        const result = await registryService.syncNow(req.companyId, req.params.id);
        res.json(result);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Sync error', 'TG_REGISTRY_SYNC');
    }
});

router.get('/registry/:id/logs', requireRole(registryRoles), async (req: any, res) => {
    try {
        const logs = await registryService.getLogs(req.companyId, req.params.id);
        res.json(logs);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Logs error', 'TG_REGISTRY_LOGS');
    }
});

router.delete('/registry/:id', requireRole(registryRoles), async (req: any, res) => {
    try {
        await registryService.remove(req.companyId, req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Delete error', 'TG_REGISTRY_DELETE');
    }
});

export default router;
