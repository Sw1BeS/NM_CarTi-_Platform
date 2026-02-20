import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { importDraft } from '../modules/Inventory/inventory/inventory.service.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();

router.post('/drafts/import', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    const payload = req.body || {};
    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
    const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
    if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

    const requestedBotId = payload.botId ? String(payload.botId) : undefined;
    const bot = requestedBotId
        ? await prisma.botConfig.findUnique({ where: { id: requestedBotId }, select: { id: true, companyId: true, isEnabled: true } })
        : await prisma.botConfig.findFirst({
            where: {
                isEnabled: true,
                ...(companyId ? { companyId } : {})
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true, companyId: true, isEnabled: true }
        });

    if (!bot) return errorResponse(res, 400, 'Active bot required');
    if (!isSuperadmin && companyId && bot.companyId !== companyId) return errorResponse(res, 403, 'Forbidden');

    const success = await importDraft(payload, bot.id);
    res.json({ success });
});

router.get('/drafts', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
    if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

    const where: any = {};
    if (companyId) {
        const bots = await prisma.botConfig.findMany({ where: { companyId }, select: { id: true } });
        const botIds = bots.map(b => b.id);
        where.OR = [{ botId: { in: botIds } }];
    }

    const drafts = await prisma.draft.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(drafts);
});

router.post('/drafts', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const botId = payload.botId ? String(payload.botId) : null;
        if (!botId) return errorResponse(res, 400, 'botId is required');
        const bot = await prisma.botConfig.findUnique({ where: { id: botId }, select: { companyId: true } });
        if (!bot) return errorResponse(res, 400, 'Invalid botId');
        if (!isSuperadmin && companyId && bot.companyId !== companyId) return errorResponse(res, 403, 'Forbidden');

        const draft = await prisma.draft.create({
            data: {
                source: payload.source || 'MANUAL',
                title: payload.title || 'Untitled',
                price: payload.price ?? null,
                url: payload.url ?? payload.imageUrl ?? null,
                description: payload.description ?? payload.text ?? null,
                status: payload.status || 'DRAFT',
                destination: payload.destination ?? null,
                botId,
                scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
                postedAt: payload.postedAt ? new Date(payload.postedAt) : null,
                metadata: payload.metadata ?? null
            }
        });
        res.json(draft);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to create draft');
    }
});

router.put('/drafts/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const existing = await prisma.draft.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Draft not found');
        if (!isSuperadmin) {
            if (!existing.botId) return errorResponse(res, 403, 'Forbidden');
            if (existing.botId) {
                const bot = await prisma.botConfig.findUnique({ where: { id: existing.botId }, select: { companyId: true } });
                if (!bot || bot.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            }
        }

        if (payload.botId !== undefined && payload.botId !== null) {
            const nextBotId = String(payload.botId);
            const bot = await prisma.botConfig.findUnique({ where: { id: nextBotId }, select: { companyId: true } });
            if (!bot) return errorResponse(res, 400, 'Invalid botId');
            if (!isSuperadmin && userCompanyId && bot.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
        }

        const draft = await prisma.draft.update({
            where: { id },
            data: {
                title: payload.title ?? undefined,
                price: payload.price ?? undefined,
                url: payload.url ?? payload.imageUrl ?? undefined,
                description: payload.description ?? payload.text ?? undefined,
                status: payload.status ?? undefined,
                destination: payload.destination ?? undefined,
                botId: payload.botId ?? undefined,
                scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : undefined,
                postedAt: payload.postedAt ? new Date(payload.postedAt) : undefined,
                metadata: payload.metadata ?? undefined
            }
        });
        res.json(draft);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to update draft');
    }
});

router.delete('/drafts/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const existing = await prisma.draft.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Draft not found');
        if (!isSuperadmin) {
            if (!existing.botId) return errorResponse(res, 403, 'Forbidden');
            if (existing.botId) {
                const bot = await prisma.botConfig.findUnique({ where: { id: existing.botId }, select: { companyId: true } });
                if (!bot || bot.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            }
        }

        await prisma.draft.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to delete draft');
    }
});

export default router;
