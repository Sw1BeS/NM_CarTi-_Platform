/**
 * Template Routes - Marketplace API
 */

import { Router } from 'express';
import { TemplateService } from './template.service.js';
import { authenticateToken, optionalAuthenticateToken } from '../../../middleware/auth.js';
import { companyContext } from '../../../middleware/companyContext.js';

const router = Router();
const templateService = new TemplateService();

/**
 * GET /api/templates/marketplace
 * Browse public templates (no auth required)
 */
router.get('/marketplace', optionalAuthenticateToken, async (req: any, res) => {
    try {
        const { category, search, isPremium } = req.query;

        const templates = await templateService.getMarketplace({
            category: category as string,
            search: search as string,
            isPremium: isPremium === 'true'
        });

        res.json(templates);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * GET /api/templates/installed/list
 * Get installed templates for current company
 */
router.get('/installed/list', authenticateToken, companyContext, async (req: any, res) => {
    try {
        const installed = await templateService.getInstalled(req.companyId);
        res.json(installed);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * POST /api/templates/:id/install
 * Install template to current company
 */
router.post('/:id/install', authenticateToken, companyContext, async (req: any, res) => {
    try {
        const scenario = await templateService.installTemplate(req.companyId, req.params.id);
        res.status(201).json(scenario);
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * DELETE /api/templates/:id/uninstall
 * Uninstall template from current company
 */
router.delete('/:id/uninstall', authenticateToken, companyContext, async (req: any, res) => {
    try {
        await templateService.uninstallTemplate(req.companyId, req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

/**
 * GET /api/templates/:id
 * Get template details
 *
 * IMPORTANT: Keep this param route AFTER more specific routes like /installed/list.
 */
router.get('/:id', async (req: any, res) => {
    try {
        const template = await templateService.getById(req.params.id);

        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }

        res.json(template);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
