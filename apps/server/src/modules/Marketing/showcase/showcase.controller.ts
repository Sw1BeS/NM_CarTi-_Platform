import { Router } from 'express';
import { ShowcaseService } from './showcase.service.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { mapInventoryOutput } from '../../../services/dto.js';

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
            return res.status(404).json({ error: 'Showcase not found' });
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
        if (e.message === 'Showcase not found') return res.status(404).json({ error: 'Showcase not found' });
        console.error('[Showcase Public API Error]:', e);
        res.status(500).json({ error: 'Internal Server Error' });
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
        if (e.code === 'P2002') return res.status(400).json({ error: 'Slug already exists' });
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', async (req, res) => {
    const item = await service.getShowcaseById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (item.workspaceId !== (req as any).user.workspaceId) return res.status(403).json({ error: 'Forbidden' });
    res.json(item);
});

router.put('/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const id = req.params.id;
        const user = (req as any).user;

        const existing = await service.getShowcaseById(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });
        if (existing.workspaceId !== user.workspaceId) return res.status(403).json({ error: 'Forbidden' });

        const updated = await service.updateShowcase(id, req.body);
        res.json(updated);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const id = req.params.id;
        const user = (req as any).user;

        const existing = await service.getShowcaseById(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });
        if (existing.workspaceId !== user.workspaceId) return res.status(403).json({ error: 'Forbidden' });

        await service.deleteShowcase(id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
