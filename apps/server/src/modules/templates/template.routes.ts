/**
 * Template Routes - Marketplace API
 */

import { Router } from 'express';
import { TemplateService } from './template.service.js';
import { companyMiddleware, optionalCompanyMiddleware } from '../../middleware/company.middleware.js';

const router = Router();
const templateService = new TemplateService();

/**
 * GET /api/templates/marketplace
 * Browse public templates (no auth required)
 */
router.get('/marketplace', optionalCompanyMiddleware, async (req: any, res) => {
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
 * GET /api/templates/:id
 * Get template details
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

/**
 * GET /api/templates/installed/list
 * Get installed templates for current company
 */
router.get('/installed/list', companyMiddleware, async (req: any, res) => {
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
router.post('/:id/install', companyMiddleware, async (req: any, res) => {
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
router.delete('/:id/uninstall', companyMiddleware, async (req: any, res) => {
    try {
        await templateService.uninstallTemplate(req.companyId, req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

export default router;
