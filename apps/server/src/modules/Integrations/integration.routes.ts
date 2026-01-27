/**
 * Integration Routes - Third-party integration management
 */

import { Router } from 'express';
import { IntegrationService } from './integration.service.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { companyContext } from '../../middleware/companyContext.js';

const router = Router();
const integrationService = new IntegrationService();

// All routes require authentication
router.use(authenticateToken);
router.use(companyContext);

import mtprotoRoutes from './mtproto/mtproto.routes.js';
router.use('/mtproto', mtprotoRoutes as any);

/**
 * GET /api/integrations
 * Get all integrations for company
 */
router.get('/', async (req: any, res) => {
    try {
        const integrations = await integrationService.getAll(req.companyId);
        res.json(integrations);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/integrations/:type
 * Get specific integration config (ADMIN+ only)
 */
router.get('/:type', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const integration = await integrationService.getByType(req.companyId, req.params.type.toUpperCase());

        if (!integration) {
            return res.status(404).json({ error: 'Integration not found' });
        }

        res.json(integration);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * PUT /api/integrations/:type
 * Create or update integration (ADMIN+ only)
 */
router.put('/:type', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { config, isActive } = req.body;

        if (!config) {
            return res.status(400).json({ error: 'Config is required' });
        }

        const integration = await integrationService.upsert(req.companyId, {
            type: req.params.type.toUpperCase(),
            config,
            isActive
        });

        res.json(integration);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * DELETE /api/integrations/:type
 * Delete integration (OWNER only)
 */
router.delete('/:type', requireRole('OWNER'), async (req: any, res) => {
    try {
        await integrationService.delete(req.companyId, req.params.type.toUpperCase());
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * POST /api/integrations/:type/toggle
 * Toggle integration active status (ADMIN+ only)
 */
router.post('/:type/toggle', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return res.status(400).json({ error: 'isActive must be boolean' });
        }

        const integration = await integrationService.toggle(req.companyId, req.params.type.toUpperCase(), isActive);
        res.json(integration);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * POST /api/integrations/:type/test
 * Test integration connection (ADMIN+ only)
 */
router.post('/:type/test', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { config } = req.body;
        const type = req.params.type.toUpperCase();

        if (!config) {
            return res.status(400).json({ error: 'Config is required for testing' });
        }

        let testResult;

        // Meta Pixel Test
        if (type === 'META_PIXEL') {
            const { testMetaConnection } = await import('./meta.service.js');
            const { pixelId, accessToken, testCode } = config;

            if (!pixelId || !accessToken) {
                return res.status(400).json({ error: 'pixelId and accessToken are required' });
            }

            testResult = await testMetaConnection(pixelId, accessToken, testCode);
        }
        // SendPulse Test
        else if (type === 'SENDPULSE') {
            const { testSendPulseConnection } = await import('./sendpulse/sendpulse.service.js');
            const { apiUserId, apiSecret } = config;

            if (!apiUserId || !apiSecret) {
                return res.status(400).json({ error: 'apiUserId and apiSecret are required' });
            }

            testResult = await testSendPulseConnection(apiUserId, apiSecret);
        }
        // Webhook Test
        else if (type === 'WEBHOOK') {
            const { url } = config;

            if (!url) {
                return res.status(400).json({ error: 'url is required' });
            }

            const axios = (await import('axios')).default;
            try {
                await axios.post(url, { test: true, timestamp: Date.now() }, { timeout: 5000 });
                testResult = { success: true };
            } catch (e: any) {
                testResult = { success: false, error: e.message };
            }
        }
        else {
            return res.status(400).json({ error: 'Test not supported for this integration type' });
        }

        res.json(testResult);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/integrations/webhook/trigger
 * Manually trigger webhook for testing (ADMIN+ only)
 */
router.post('/webhook/trigger', requireRole('OWNER', 'ADMIN'), async (req: any, res) => {
    try {
        const { event, payload } = req.body;

        if (!event) {
            return res.status(400).json({ error: 'Event is required' });
        }

        const results = await integrationService.triggerWebhook(req.companyId, event, payload || {});
        res.json(results);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
