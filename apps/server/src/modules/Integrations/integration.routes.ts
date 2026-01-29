/**
 * Integration Routes - Third-party integration management
 */

import { Router } from 'express';
import { IntegrationService } from './integration.service.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { companyContext } from '../../middleware/companyContext.js';
import { errorResponse } from '../../utils/errorResponse.js';

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
        return errorResponse(res, 500, e.message || 'Integration error', 'INTEGRATION_ERROR');
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
            return errorResponse(res, 404, 'Integration not found', 'INTEGRATION_NOT_FOUND');
        }

        res.json(integration);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration error', 'INTEGRATION_ERROR');
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
            return errorResponse(res, 400, 'Config is required', 'INTEGRATION_VALIDATION');
        }

        const integration = await integrationService.upsert(req.companyId, {
            type: req.params.type.toUpperCase(),
            config,
            isActive
        });

        res.json(integration);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Integration error', 'INTEGRATION_ERROR');
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
        return errorResponse(res, 400, e.message || 'Integration error', 'INTEGRATION_ERROR');
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
            return errorResponse(res, 400, 'isActive must be boolean', 'INTEGRATION_VALIDATION');
        }

        const integration = await integrationService.toggle(req.companyId, req.params.type.toUpperCase(), isActive);
        res.json(integration);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Integration error', 'INTEGRATION_ERROR');
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
            return errorResponse(res, 400, 'Config is required for testing', 'INTEGRATION_VALIDATION');
        }

        let testResult;

        // Meta Pixel Test
        if (type === 'META_PIXEL') {
            const { testMetaConnection } = await import('./meta.service.js');
            const { pixelId, accessToken, testCode } = config;

            if (!pixelId || !accessToken) {
                return errorResponse(res, 400, 'pixelId and accessToken are required', 'INTEGRATION_VALIDATION');
            }

            testResult = await testMetaConnection(pixelId, accessToken, testCode);
        }
        // SendPulse Test
        else if (type === 'SENDPULSE') {
            const { testSendPulseConnection } = await import('./sendpulse/sendpulse.service.js');
            const { apiUserId, apiSecret } = config;

            if (!apiUserId || !apiSecret) {
                return errorResponse(res, 400, 'apiUserId and apiSecret are required', 'INTEGRATION_VALIDATION');
            }

            testResult = await testSendPulseConnection(apiUserId, apiSecret);
        }
        // Webhook Test
        else if (type === 'WEBHOOK') {
            const { url } = config;

            if (!url) {
                return errorResponse(res, 400, 'url is required', 'INTEGRATION_VALIDATION');
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
            return errorResponse(res, 400, 'Test not supported for this integration type', 'INTEGRATION_VALIDATION');
        }

        res.json(testResult);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration error', 'INTEGRATION_ERROR');
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
            return errorResponse(res, 400, 'Event is required', 'INTEGRATION_VALIDATION');
        }

        const results = await integrationService.triggerWebhook(req.companyId, event, payload || {});
        res.json(results);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration error', 'INTEGRATION_ERROR');
    }
});

export default router;
