
import { Router } from 'express';
// @ts-ignore
import { prisma } from '../../../services/prisma.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { mapInventoryInput, mapInventoryOutput } from '../../../services/dto.js';
import { CarRepository } from '../../../repositories/index.js';

const router = Router();
const carRepo = new CarRepository(prisma);

// --- Inventory (CarListing) ---

router.use(authenticateToken);

router.get('/', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const search = req.query.search as string;
    const status = req.query.status as string;

    // Range Filters
    const priceMin = req.query.priceMin ? Number(req.query.priceMin) : undefined;
    const priceMax = req.query.priceMax ? Number(req.query.priceMax) : undefined;
    const yearMin = req.query.yearMin ? Number(req.query.yearMin) : undefined;
    const yearMax = req.query.yearMax ? Number(req.query.yearMax) : undefined;

    const where: any = {};

    if (status && status !== 'ALL') where.status = status;

    if (priceMin !== undefined || priceMax !== undefined) {
        where.price = {};
        if (priceMin !== undefined) where.price.gte = priceMin;
        if (priceMax !== undefined) where.price.lte = priceMax;
    }

    if (yearMin !== undefined || yearMax !== undefined) {
        where.year = {};
        if (yearMin !== undefined) where.year.gte = yearMin;
        if (yearMax !== undefined) where.year.lte = yearMax;
    }

    if (search) {
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { location: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } }
        ];
    }

    const { items, total } = await carRepo.findCars({
        status,
        priceMin,
        priceMax,
        yearMin,
        yearMax,
        search,
        skip,
        take: limit,
        companyId: (req as any).user?.companyId
    });

    res.json({
        items: items.map(mapInventoryOutput),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    });
});

router.post('/', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const mapped = mapInventoryInput(req.body || {});
        const car = await carRepo.createCar({
            ...mapped,
            companyId: (req as any).user?.companyId
        });
        res.json(mapInventoryOutput(car));
    } catch (e: any) {
        console.error('[Inventory POST Error]:', e);
        res.status(500).json({ error: 'Failed to create car: ' + e.message });
    }
});

router.put('/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const id = req.params.id;
        const { id: _id, createdAt, updatedAt, ...raw } = req.body;
        const updateData = mapInventoryInput(raw);

        const car = await carRepo.updateCar(id, updateData);
        res.json(mapInventoryOutput(car));
    } catch (e: any) {
        console.error('[Inventory PUT Error]:', e);
        res.status(500).json({ error: 'Failed to update car: ' + e.message });
    }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const id = req.params.id;
        await carRepo.deleteCar(id);
        res.json({ success: true });
    } catch (e: any) {
        console.error('[Inventory DELETE Error]:', e);
        res.status(500).json({ error: 'Failed to delete car: ' + e.message });
    }
});

export default router;
