
import { Router } from 'express';
// @ts-ignore
import { prisma } from '../../../services/prisma.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { mapInventoryInput, mapInventoryOutput } from '../../../services/dto.js';
import { CarRepository } from '../../../repositories/index.js';
import { errorResponse } from '../../../utils/errorResponse.js';
import { logger } from '../../../utils/logger.js';
import { telegramOutbox } from '../../Communication/telegram/messaging/outbox/telegramOutbox.js';
import { renderCarCardForBot } from '../../../services/carCardRenderer.v2.js';

const router = Router();
const carRepo = new CarRepository(prisma);

const readPartnerCompanyId = (source: any) => {
    const value = typeof source?.partnerCompanyId === 'string' ? source.partnerCompanyId.trim() : '';
    return value || undefined;
};

const readPartnerOwnerTgId = (source: any) => {
    const value = typeof source?.partnerOwnerTgId === 'string' ? source.partnerOwnerTgId.trim() : '';
    return value || undefined;
};

const ensurePartnerOwnerAccess = async (params: {
    companyId?: string | null;
    partnerCompanyId?: string;
    partnerOwnerTgId?: string;
}) => {
    if (!params.partnerCompanyId || !params.partnerOwnerTgId) return true;
    const partnerUser = await prisma.partnerUser.findFirst({
        where: {
            telegramId: params.partnerOwnerTgId,
            partnerId: params.partnerCompanyId,
            role: 'OWNER',
            ...(params.companyId ? { companyId: params.companyId } : {})
        },
        select: { id: true }
    });
    return Boolean(partnerUser);
};

const resolveBot = async (companyId: string | null, botId?: string) => {
    if (botId) {
        const bot = await prisma.botConfig.findUnique({ where: { id: botId } });
        if (!bot?.token) return null;
        if (companyId && bot.companyId !== companyId) return null;
        return bot;
    }

    return prisma.botConfig.findFirst({
        where: {
            ...(companyId ? { companyId } : {}),
            isEnabled: true
        },
        orderBy: { createdAt: 'asc' }
    });
};

const collectCarPhotos = (car: any) => {
    const raw = [car.thumbnail, ...(Array.isArray(car.mediaUrls) ? car.mediaUrls : [])]
        .map(v => String(v || '').trim())
        .filter(Boolean);
    return Array.from(new Set(raw)).slice(0, 10);
};

const sendCarCard = async (params: {
    bot: any;
    car: any;
    destination: string;
    companyId?: string | null;
    showcaseSlug?: string;
}) => {
    const caption = await renderCarCardForBot({
        car: params.car,
        companyId: params.companyId || null,
        botId: params.bot.id,
        showcaseSlug: params.showcaseSlug
    });

    const photos = collectCarPhotos(params.car);
    if (photos.length > 1) {
        return telegramOutbox.sendMediaGroup({
            botId: params.bot.id,
            token: params.bot.token,
            chatId: params.destination,
            media: photos.map((url, index) => ({
                type: 'photo',
                media: url,
                caption: index === 0 ? caption : undefined,
                parse_mode: 'HTML'
            })),
            companyId: params.companyId || null
        });
    }

    if (photos.length === 1) {
        return telegramOutbox.sendPhoto({
            botId: params.bot.id,
            token: params.bot.token,
            chatId: params.destination,
            photo: photos[0],
            caption,
            companyId: params.companyId || null
        });
    }

    return telegramOutbox.sendMessage({
        botId: params.bot.id,
        token: params.bot.token,
        chatId: params.destination,
        text: caption,
        companyId: params.companyId || null
    });
};

// --- Inventory (CarListing) ---

router.use(authenticateToken);

router.get('/', async (req, res) => {
    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
    if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const search = req.query.search as string;
    const status = req.query.status as string;
    const partnerCompanyId = readPartnerCompanyId(req.query);

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
        companyId: companyId || undefined,
        partnerCompanyId
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
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof (req.body || {}).companyId === 'string' ? (req.body || {}).companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const mapped = mapInventoryInput(req.body || {});
        const partnerCompanyId = readPartnerCompanyId(req.body || {});
        const partnerOwnerTgId = readPartnerOwnerTgId(req.body || {});
        if (partnerCompanyId) {
            const allowed = await ensurePartnerOwnerAccess({
                companyId: companyId || null,
                partnerCompanyId,
                partnerOwnerTgId
            });
            if (!allowed && partnerOwnerTgId) return errorResponse(res, 403, 'Partner owner access required');
        }
        const { id: _id, title, price, year, mileage, ...rest } = mapped;
        if (!title || price === undefined || year === undefined || mileage === undefined) {
            return errorResponse(res, 400, 'title, price, year, mileage are required', 'INVALID_INPUT');
        }
        const car = await carRepo.createCar({
            ...rest,
            title,
            price,
            year,
            mileage,
            companyId: companyId || undefined,
            ...(partnerCompanyId ? { partnerCompanyId } : {})
        });
        res.json(mapInventoryOutput(car));
    } catch (e: any) {
        logger.error('[Inventory POST Error]:', e);
        errorResponse(res, 500, `Failed to create car: ${e.message}`);
    }
});

router.post('/bulk', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof (req.body || {}).companyId === 'string' ? (req.body || {}).companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean).map(String) : [];
        if (!ids.length) return errorResponse(res, 400, 'ids[] is required', 'INVALID_INPUT');

        const updateData = mapInventoryInput((req.body || {}).updates || {});
        const partnerCompanyId = readPartnerCompanyId((req.body || {}).updates || req.body || {});
        const partnerOwnerTgId = readPartnerOwnerTgId(req.body || {});
        if (partnerCompanyId) {
            const allowed = await ensurePartnerOwnerAccess({
                companyId: companyId || null,
                partnerCompanyId,
                partnerOwnerTgId
            });
            if (!allowed && partnerOwnerTgId) return errorResponse(res, 403, 'Partner owner access required');
        }
        if (!Object.keys(updateData).length) {
            return errorResponse(res, 400, 'updates is required', 'INVALID_INPUT');
        }
        delete (updateData as any).id;
        if (partnerCompanyId) {
            (updateData as any).partnerCompanyId = partnerCompanyId;
        }

        const result = await prisma.carListing.updateMany({
            where: {
                id: { in: ids },
                ...(companyId ? { companyId } : {}),
                ...(partnerCompanyId ? { partnerCompanyId } : {})
            },
            data: updateData
        });

        res.json({ count: result.count });
    } catch (e: any) {
        logger.error('[Inventory BULK Error]:', e);
        errorResponse(res, 500, `Failed to update inventory: ${e.message}`);
    }
});

router.put('/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const id = req.params.id;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const existing = await carRepo.findById(id);
        if (!existing) return errorResponse(res, 404, 'Car not found');
        if (!isSuperadmin) {
            if (existing.companyId && existing.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!existing.companyId) return errorResponse(res, 403, 'Forbidden');
        }

        const { id: _id, createdAt, updatedAt, ...raw } = req.body;
        const updateData = mapInventoryInput(raw);
        const partnerCompanyId = readPartnerCompanyId(req.body || {});
        const partnerOwnerTgId = readPartnerOwnerTgId(req.body || {});
        const scopedPartnerCompanyId = existing.partnerCompanyId || partnerCompanyId;
        if (scopedPartnerCompanyId) {
            const allowed = await ensurePartnerOwnerAccess({
                companyId: existing.companyId || userCompanyId || null,
                partnerCompanyId: scopedPartnerCompanyId,
                partnerOwnerTgId
            });
            if (!allowed && partnerOwnerTgId) return errorResponse(res, 403, 'Partner owner access required');
        }
        if (partnerCompanyId) {
            (updateData as any).partnerCompanyId = partnerCompanyId;
        }

        const car = await carRepo.updateCar(id, updateData);
        res.json(mapInventoryOutput(car));
    } catch (e: any) {
        logger.error('[Inventory PUT Error]:', e);
        errorResponse(res, 500, `Failed to update car: ${e.message}`);
    }
});

router.post('/:carId/send-telegram', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { carId } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const car = await carRepo.findById(carId);
        if (!car) return errorResponse(res, 404, 'Car not found');
        if (!isSuperadmin) {
            if (car.companyId && car.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!car.companyId) return errorResponse(res, 403, 'Forbidden');
        }

        const chatId = String((req.body || {}).chatId || '').trim();
        if (!chatId) return errorResponse(res, 400, 'chatId is required', 'INVALID_INPUT');

        const bot = await resolveBot(car.companyId || userCompanyId || null, typeof (req.body || {}).botId === 'string' ? (req.body || {}).botId : undefined);
        if (!bot?.token) return errorResponse(res, 400, 'Bot not found', 'BOT_NOT_FOUND');

        const sent = await sendCarCard({
            bot,
            car,
            destination: chatId,
            companyId: bot.companyId,
            showcaseSlug: typeof (req.body || {}).showcaseSlug === 'string' ? (req.body || {}).showcaseSlug : undefined
        });

        return res.json({ ok: true, sent });
    } catch (e: any) {
        logger.error('[Inventory send-telegram Error]:', e);
        return errorResponse(res, 500, e?.message || 'Failed to send car card');
    }
});

router.post('/:carId/publish-telegram', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { carId } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const car = await carRepo.findById(carId);
        if (!car) return errorResponse(res, 404, 'Car not found');
        if (!isSuperadmin) {
            if (car.companyId && car.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!car.companyId) return errorResponse(res, 403, 'Forbidden');
        }

        const bot = await resolveBot(car.companyId || userCompanyId || null, typeof (req.body || {}).botId === 'string' ? (req.body || {}).botId : undefined);
        if (!bot?.token) return errorResponse(res, 400, 'Bot not found', 'BOT_NOT_FOUND');

        const channelId = String((req.body || {}).channelId || bot.channelId || '').trim();
        if (!channelId) return errorResponse(res, 400, 'channelId is required', 'INVALID_INPUT');

        const sent: any = await sendCarCard({
            bot,
            car,
            destination: channelId,
            companyId: bot.companyId,
            showcaseSlug: typeof (req.body || {}).showcaseSlug === 'string' ? (req.body || {}).showcaseSlug : undefined
        });

        const messageId = sent?.message_id || sent?.[0]?.message_id || null;
        let channelPost = null;
        if (messageId) {
            channelPost = await prisma.channelPost.create({
                data: {
                    carId: car.id,
                    botId: bot.id,
                    channelId,
                    messageId: Number(messageId),
                    status: 'ACTIVE',
                    payload: {
                        source: 'inventory_publish_telegram',
                        publishedAt: new Date().toISOString()
                    }
                }
            }).catch(() => null);
        }

        return res.json({ ok: true, sent, channelPost });
    } catch (e: any) {
        logger.error('[Inventory publish-telegram Error]:', e);
        return errorResponse(res, 500, e?.message || 'Failed to publish car card');
    }
});

router.delete('/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const id = req.params.id;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const existing = await carRepo.findById(id);
        if (!existing) return errorResponse(res, 404, 'Car not found');
        if (!isSuperadmin) {
            if (existing.companyId && existing.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!existing.companyId) return errorResponse(res, 403, 'Forbidden');
        }

        await carRepo.deleteCar(id);
        res.json({ success: true });
    } catch (e: any) {
        logger.error('[Inventory DELETE Error]:', e);
        errorResponse(res, 500, `Failed to delete car: ${e.message}`);
    }
});

export default router;
