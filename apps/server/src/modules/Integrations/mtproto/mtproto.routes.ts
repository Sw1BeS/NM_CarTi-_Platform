
import { Router } from 'express';
import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from './mtproto.service.js';
import { requireRole } from '../../../middleware/auth.js';
import { logger } from '../../../utils/logger.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();

// GET /api/integrations/mtproto/connectors
router.get('/connectors', async (req: any, res) => {
    try {
        const connectors = await prisma.mTProtoConnector.findMany({
            where: { companyId: req.companyId },
            orderBy: { createdAt: 'desc' }
        });
        // Sanitize session strings
        const safeConnectors = connectors.map(c => ({
            ...c,
            sessionString: c.sessionString ? '***' : null
        }));
        res.json(safeConnectors);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// GET /api/integrations/mtproto/stats
router.get('/stats', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const stats = await MTProtoService.getStats();
        res.json(stats);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Stats error', 'MTPROTO_ERROR');
    }
});

// POST /api/integrations/mtproto/connectors
// Create a new connector
router.post('/connectors', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
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
router.delete('/connectors/:id', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        await MTProtoService.disconnect(req.params.id);
        await prisma.mTProtoConnector.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// POST /api/integrations/mtproto/auth/send-code
router.post('/auth/send-code', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { connectorId, phone } = req.body;
        const { phoneCodeHash, isCodeViaApp } = await MTProtoService.sendCode(connectorId, phone);
        res.json({ phoneCodeHash, isCodeViaApp });
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'MTProto validation error', 'MTPROTO_VALIDATION');
    }
});

// POST /api/integrations/mtproto/auth/sign-in
router.post('/auth/sign-in', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { connectorId, phone, code, phoneCodeHash, password } = req.body;
        await MTProtoService.signIn(connectorId, phone, code, phoneCodeHash, password);
        res.json({ success: true });
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'MTProto validation error', 'MTPROTO_VALIDATION');
    }
});

// --- Channel Sources ---

// GET /api/integrations/mtproto/:connectorId/channels
router.get('/:connectorId/channels', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const channels = await MTProtoService.getChannelSources(req.params.connectorId);
        res.json(channels);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// GET /api/integrations/mtproto/:connectorId/resolve
router.get('/:connectorId/resolve', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
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
router.post('/:connectorId/channels', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
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
router.put('/:connectorId/channels/:sourceId', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
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
router.post('/:connectorId/channels/:sourceId/sync', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
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

// POST /api/integrations/mtproto/:connectorId/sync
router.post('/:connectorId/sync', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        // Trigger generic backfill (or could target specific connector if refactored)
        // For now, running the global worker cycle is safe enough or we make it targeted

        // Let's just trigger the global worker 
        if (mtprotoWorker) {
            mtprotoWorker.runBackfill().catch((err: any) => logger.error(err));
        }

        res.json({ success: true, message: 'Sync started' });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

// DELETE /api/integrations/mtproto/channels/:id
router.delete('/channels/:id', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        await MTProtoService.deleteChannelSource(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'MTProto error', 'MTPROTO_ERROR');
    }
});

export default router;
