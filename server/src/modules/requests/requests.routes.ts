
import { Router } from 'express';
// @ts-ignore
import { prisma } from '../../services/prisma.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { generatePublicId, mapRequestInput, mapRequestOutput, mapVariantInput, mapVariantOutput } from '../../services/dto.js';

const router = Router();

// --- B2B Requests CRUD ---
router.get('/', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const status = req.query.status as string;
    const search = req.query.search as string;

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { publicId: { contains: search, mode: 'insensitive' } }
        ];
    }

    try {
        const [total, items] = await Promise.all([
            prisma.b2bRequest.count({ where }),
            prisma.b2bRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip,
                include: { variants: true } // Include nested variants
            })
        ]);

        res.json({
            items: items.map(mapRequestOutput),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

router.post('/', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id, variants, ...raw } = req.body;
        const createData: any = mapRequestInput(raw);
        if (!createData.title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (!createData.publicId) createData.publicId = generatePublicId();

        // Handle nested creation provided via `variants` array
        if (variants && Array.isArray(variants)) {
            createData.variants = {
                create: variants.map((v: any) => mapVariantInput(v))
            };
        }

        const request = await prisma.b2bRequest.create({
            data: createData,
            include: { variants: true }
        });
        res.json(mapRequestOutput(request));
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create request' });
    }
});

router.put('/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id: _id, variants, ...raw } = req.body;
        const { id } = req.params;

        // Update main request
        const data = mapRequestInput(raw);
        const request = await prisma.b2bRequest.update({
            where: { id },
            data,
            include: { variants: true }
        });

        // Sync Variants logic would go here if we want to full-sync, 
        // but typically variants are managed via specific endpoint or separate calls.

        res.json(mapRequestOutput(request));
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update request' });
    }
});

router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.b2bRequest.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'Failed to delete request' }); }
});

// --- Variant Management Sub-Routes ---
router.post('/:id/variants', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    const { id } = req.params;
    const variantData = mapVariantInput(req.body || {});
    try {
        const variant = await prisma.requestVariant.create({
            data: {
                ...variantData,
                requestId: id
            }
        });
        res.json(mapVariantOutput(variant));
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to add variant' });
    }
});

export default router;
