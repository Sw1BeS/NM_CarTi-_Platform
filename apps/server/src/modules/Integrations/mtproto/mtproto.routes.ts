
import { Router } from 'express';
import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from './mtproto.service.js';
import { MTProtoImportService } from './mtproto.import.service.js';
import { requireRole } from '../../../middleware/auth.js';
import { logger } from '../../../utils/logger.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();
const importService = new MTProtoImportService();
const mtprotoRoles = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'];

// GET /api/integrations/mtproto/connectors
router.get('/connectors', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const connectors = await prisma.mTProtoConnector.findMany({
            where: { companyId: req.companyId },
            orderBy: { createdAt: 'desc' }
        });
        // Sanitize session strings
        const safeConnectors = connectors.map(c => ({
            ...c,
            workspaceApiHash: c.workspaceApiHash ? '***' : null,
            sessionString: c.sessionString ? '***' : null,
            authSessionString: c.authSessionString ? '***' : null,
            authPhoneCodeHash: c.authPhoneCodeHash ? '***' : null,
            authApiHash: c.authApiHash ? '***' : null
        }));
        res.json(safeConnectors);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// GET /api/integrations/mtproto/stats
router.get('/stats', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const stats = await MTProtoService.getStats();
        res.json(stats);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Stats error', 'MTPROTO_ERROR');
    }
});

// POST /api/integrations/mtproto/connectors
// Create a new connector
router.post('/connectors', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const { name, apiId, apiHash } = req.body;

        // Check limits (e.g. 1 per company for now)

        const connector = await prisma.mTProtoConnector.create({
            data: {
                name: name || 'Telegram Account',
                companyId: req.companyId,
                workspaceApiId: apiId ? Number(apiId) : undefined,
                workspaceApiHash: apiHash || undefined
            }
        });

        res.json(connector);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'MTProto validation error', 'MTPROTO_VALIDATION');
    }
});

// DELETE /api/integrations/mtproto/connectors/:id
router.delete('/connectors/:id', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        await MTProtoService.disconnect(req.params.id);
        await prisma.mTProtoConnector.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// POST /api/integrations/mtproto/auth/send-code
router.post('/auth/send-code', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const { connectorId, phone, forceSms } = req.body;
        const result = await MTProtoService.sendCode(connectorId, phone, { forceSms: Boolean(forceSms) });
        res.json(result);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'MTProto validation error', 'MTPROTO_VALIDATION');
    }
});

// POST /api/integrations/mtproto/auth/sign-in
// POST /api/integrations/mtproto/auth/sign-in
router.post('/auth/sign-in', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const { connectorId, phone, code, phoneCodeHash, password } = req.body;
        await MTProtoService.signIn(connectorId, phone, code, phoneCodeHash, password);

        // UX: Fetch User Info for immediate feedback
        const client = await MTProtoService.getClient(connectorId);
        const me = await client.getMe() as any;

        // UX: Trigger background discovery
        MTProtoService.discoverDialogs(connectorId)
            .then(count => logger.info(`[MTProto] Discovered ${count} dialogs for ${connectorId}`))
            .catch(err => logger.error(`[MTProto] Discovery failed:`, err));

        res.json({
            success: true,
            user: {
                id: me.id.toString(),
                firstName: me.firstName,
                username: me.username,
                phone: me.phone
            }
        });
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'MTProto validation error', 'MTPROTO_VALIDATION');
    }
});

// --- Channel Sources ---

// GET /api/integrations/mtproto/:connectorId/channels
router.get('/:connectorId/channels', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const channels = await MTProtoService.getChannelSources(req.params.connectorId);
        res.json(channels);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// GET /api/integrations/mtproto/:connectorId/resolve
router.get('/:connectorId/resolve', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const { query } = req.query;
        if (!query) throw new Error('Query required');

        const channel = await MTProtoService.resolveChannel(req.params.connectorId, String(query));
        res.json(channel);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'MTProto validation error', 'MTPROTO_VALIDATION');
    }
});

// POST /api/integrations/mtproto/:connectorId/channels
router.post('/:connectorId/channels', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const { channel, importRules } = req.body;
        const result = await MTProtoService.addChannelSource(req.params.connectorId, channel, importRules);
        res.json(result);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

import { mtprotoWorker } from './mtproto.worker.js';

// ... (existing imports)

// Update Channel Parsing Rules
router.put('/:connectorId/channels/:sourceId', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const { sourceId } = req.params;
        const { importRules } = req.body;

        const channel = await MTProtoService.updateChannel(sourceId, { importRules });
        res.json(channel);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Failed to update channel', 'MTPROTO_ERROR');
    }
});

// POST /api/integrations/mtproto/:connectorId/channels/:sourceId/sync
router.post('/:connectorId/channels/:sourceId/sync', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const { connectorId, sourceId } = req.params;
        // Asynchronously start sync
        MTProtoService.syncChannel(connectorId, sourceId)
            .then(result => logger.info(`Manual sync finished for ${sourceId}: ${result.imported} items`))
            .catch(err => logger.error(`Manual sync failed for ${sourceId}:`, err));

        res.json({ success: true, message: 'Sync started in background' });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// POST /api/integrations/mtproto/:connectorId/channels/:sourceId/preview
router.post('/:connectorId/channels/:sourceId/preview', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const result = await importService.previewImport(req.params.connectorId, req.params.sourceId, req.body || {});
        res.json(result);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Preview error', 'MTPROTO_PREVIEW_ERROR');
    }
});

// POST /api/integrations/mtproto/:connectorId/channels/:sourceId/import
router.post('/:connectorId/channels/:sourceId/import', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const job = await importService.createImportJob(req.companyId, req.params.connectorId, req.params.sourceId, req.body || {});
        res.json(job);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Import error', 'MTPROTO_IMPORT_ERROR');
    }
});

// GET /api/integrations/mtproto/import-jobs
router.get('/import-jobs', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const sourceId = typeof req.query.sourceId === 'string' ? req.query.sourceId : undefined;
        const jobs = await importService.listJobs(req.companyId, sourceId);
        res.json(jobs);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Import jobs error', 'MTPROTO_IMPORT_ERROR');
    }
});

// POST /api/integrations/mtproto/:connectorId/sync
router.post('/:connectorId/sync', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        const useLegacy = String(req.query.legacy || '').toLowerCase() === '1' || String(req.query.legacy || '').toLowerCase() === 'true';
        if (mtprotoWorker) {
            if (useLegacy) {
                mtprotoWorker.runBackfill().catch((err: any) => logger.error(err));
            } else {
                mtprotoWorker.runImportJobs().catch((err: any) => logger.error(err));
            }
        }

        res.json({ success: true, mode: useLegacy ? 'legacy_backfill' : 'import_jobs', message: 'Sync started' });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// DELETE /api/integrations/mtproto/channels/:id
router.delete('/channels/:id', requireRole(mtprotoRoles), async (req: any, res) => {
    try {
        await MTProtoService.deleteChannelSource(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

export default router;
