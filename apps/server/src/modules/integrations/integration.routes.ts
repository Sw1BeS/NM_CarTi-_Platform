/**
 * Integration Routes - Third-party integration management
 */

import { Router } from 'express';
import { IntegrationService } from './integration.service.js';
import { companyMiddleware, requireRole } from '../../middleware/company.middleware.js';

const router = Router();
const integrationService = new IntegrationService();

// All routes require authentication
router.use(companyMiddleware);

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
