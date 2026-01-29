import { Router } from 'express';
import { ShowcaseService } from './showcase.service.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { mapInventoryOutput } from '../../../services/dto.js';
import { logger } from '../../../utils/logger.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();
const service = new ShowcaseService();

// Public API
router.get('/public/:slug/inventory', async (req, res) => {
    try {
        const slug = req.params.slug;
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 20;

        // Parse Filters
        const search = req.query.search as string | undefined;
        const minPrice = req.query.minPrice ? Number(req.query.minPrice) : undefined;
        const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : undefined;
        const minYear = req.query.minYear ? Number(req.query.minYear) : undefined;
        const maxYear = req.query.maxYear ? Number(req.query.maxYear) : undefined;

        const { showcase, items, total } = await service.getInventoryForShowcase(slug, {
            page,
            limit,
            search,
            minPrice,
            maxPrice,
            minYear,
            maxYear
        });

        if (!showcase.isPublic) {
            return errorResponse(res, 404, 'Showcase not found');
        }

        res.json({
            showcase: {
                name: showcase.name,
                description: 'Filtered Inventory',
                botId: showcase.botId
            },
            items: items.map(mapInventoryOutput),
            total,
            page,
            limit
        });
    } catch (e: any) {
        if (e.message === 'Showcase not found') return errorResponse(res, 404, 'Showcase not found');
        logger.error('[Showcase Public API Error]:', e);
        errorResponse(res, 500, 'Internal Server Error');
    }
});

// Admin API
router.use(authenticateToken);

router.get('/', async (req, res) => {
    const user = (req as any).user;
    const items = await service.getShowcases(user.workspaceId);
    res.json(items);
});

router.post('/', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const user = (req as any).user;
        const { name, slug, rules, botId, isPublic } = req.body;

        // Basic slug generation if not provided
        const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(Math.random() * 1000);

        const item = await service.createShowcase({
            workspaceId: user.workspaceId,
            name,
            slug: finalSlug,
            rules: rules || { mode: 'FILTER', filters: {} },
            botId,
            isPublic
        });
        res.json(item);
    } catch (e: any) {
        if (e.code === 'P2002') return errorResponse(res, 400, 'Slug already exists');
        errorResponse(res, 500, e.message);
    }
});

router.get('/:id', async (req, res) => {
    const item = await service.getShowcaseById(req.params.id);
    if (!item) return errorResponse(res, 404, 'Not found');
    if (item.workspaceId !== (req as any).user.workspaceId) return errorResponse(res, 403, 'Forbidden');
    res.json(item);
});

router.put('/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const id = req.params.id;
        const user = (req as any).user;

        const existing = await service.getShowcaseById(id);
        if (!existing) return errorResponse(res, 404, 'Not found');
        if (existing.workspaceId !== user.workspaceId) return errorResponse(res, 403, 'Forbidden');

        const updated = await service.updateShowcase(id, req.body);
        res.json(updated);
    } catch (e: any) {
        errorResponse(res, 500, e.message);
    }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const id = req.params.id;
        const user = (req as any).user;

        const existing = await service.getShowcaseById(id);
        if (!existing) return errorResponse(res, 404, 'Not found');
        if (existing.workspaceId !== user.workspaceId) return errorResponse(res, 403, 'Forbidden');

        await service.deleteShowcase(id);
        res.json({ success: true });
    } catch (e: any) {
        errorResponse(res, 500, e.message);
    }
});

export default router;
