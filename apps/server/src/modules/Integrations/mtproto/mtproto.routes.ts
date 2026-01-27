
import { Router } from 'express';
import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from './mtproto.service.js';
import { requireRole } from '../../../middleware/auth.js';

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
        res.status(500).json({ error: e.message });
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
        res.status(400).json({ error: e.message });
    }
});

// DELETE /api/integrations/mtproto/connectors/:id
router.delete('/connectors/:id', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        await MTProtoService.disconnect(req.params.id);
        await prisma.mTProtoConnector.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/integrations/mtproto/auth/send-code
router.post('/auth/send-code', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { connectorId, phone } = req.body;
        const { phoneCodeHash, isCodeViaApp } = await MTProtoService.sendCode(connectorId, phone);
        res.json({ phoneCodeHash, isCodeViaApp });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// POST /api/integrations/mtproto/auth/sign-in
router.post('/auth/sign-in', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { connectorId, phone, code, phoneCodeHash, password } = req.body;
        await MTProtoService.signIn(connectorId, phone, code, phoneCodeHash, password);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// --- Channel Sources ---

// GET /api/integrations/mtproto/:connectorId/channels
router.get('/:connectorId/channels', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const channels = await MTProtoService.getChannelSources(req.params.connectorId);
        res.json(channels);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
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
        res.status(400).json({ error: e.message });
    }
});

// POST /api/integrations/mtproto/:connectorId/channels
router.post('/:connectorId/channels', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { channel, importRules } = req.body;
        const result = await MTProtoService.addChannelSource(req.params.connectorId, channel, importRules);
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

import { mtprotoWorker } from './mtproto.worker.js';

// ... (existing imports)

// POST /api/integrations/mtproto/:connectorId/sync
router.post('/:connectorId/sync', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        // Trigger generic backfill (or could target specific connector if refactored)
        // For now, running the global worker cycle is safe enough or we make it targeted

        // Let's just trigger the global worker 
        mtprotoWorker.runBackfill().catch(err => console.error(err));

        res.json({ success: true, message: 'Sync started' });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/integrations/mtproto/channels/:id
router.delete('/channels/:id', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        await MTProtoService.deleteChannelSource(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
