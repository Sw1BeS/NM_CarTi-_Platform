import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { mapLeadCreateInput, mapLeadOutput, mapLeadStatusFilter, mapLeadUpdateInput } from '../services/dto.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();

router.get('/leads', requireRole(['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
    if (!companyId && !isSuperadmin) {
        return errorResponse(res, 400, 'Company context required');
    }

    const status = req.query.status as string;
    const source = req.query.source as string;
    const search = req.query.search as string;

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (status && status !== 'ALL') {
        const dbStatus = mapLeadStatusFilter(status);
        if (dbStatus) where.status = dbStatus;
    }
    if (source) where.source = source;
    if (search) {
        where.OR = [
            { clientName: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { leadCode: { contains: search, mode: 'insensitive' } }
        ];
    }

    const [total, items] = await Promise.all([
        prisma.lead.count({ where }),
        prisma.lead.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip
        })
    ]);

    res.json({
        items: items.map(mapLeadOutput),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    });
});

router.post('/leads', requireRole(['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof (req.body || {}).companyId === 'string' ? (req.body || {}).companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId) return errorResponse(res, 400, 'Company context required');

        const { id, ...raw } = req.body || {};
        const mapped = mapLeadCreateInput(raw);
        if (mapped.error) return errorResponse(res, 400, mapped.error);
        const botId = (req.body || {}).botId ? String((req.body || {}).botId) : undefined;
        if (botId) {
            const bot = await prisma.botConfig.findUnique({ where: { id: botId }, select: { companyId: true } });
            if (!bot) return errorResponse(res, 400, 'Invalid botId');
            if (!isSuperadmin && bot.companyId !== companyId) return errorResponse(res, 403, 'Forbidden');
        }

        const lead = await prisma.lead.create({
            data: {
                ...mapped.data,
                companyId,
                ...(botId ? { botId } : {})
            }
        });
        res.json(mapLeadOutput(lead));
    } catch (e) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to create lead');
    }
});

router.put('/leads/:id', requireRole(['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;

        const { id: _, ...raw } = req.body || {};
        const { id } = req.params;
        const existing = await prisma.lead.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Lead not found');
        if (!isSuperadmin && userCompanyId && existing.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }
        const mapped = mapLeadUpdateInput(raw, existing.payload);
        const lead = await prisma.lead.update({ where: { id }, data: mapped.data });
        res.json(mapLeadOutput(lead));
    } catch (e) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to update lead');
    }
});

router.post('/leads/merge', requireRole(['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { primaryId, duplicateId } = req.body || {};
        if (!primaryId || !duplicateId) return errorResponse(res, 400, 'primaryId and duplicateId are required');
        if (primaryId === duplicateId) return errorResponse(res, 400, 'primaryId and duplicateId must differ');

        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;

        const [primary, duplicate] = await Promise.all([
            prisma.lead.findUnique({ where: { id: String(primaryId) } }),
            prisma.lead.findUnique({ where: { id: String(duplicateId) } })
        ]);

        if (!primary || !duplicate) return errorResponse(res, 404, 'Lead not found');
        if (!isSuperadmin && userCompanyId) {
            if (primary.companyId !== userCompanyId || duplicate.companyId !== userCompanyId) {
                return errorResponse(res, 403, 'Forbidden');
            }
        }

        const mergedPayload = {
            ...(duplicate.payload as any || {}),
            ...(primary.payload as any || {}),
            mergedFrom: Array.from(new Set([...(primary.payload as any)?.mergedFrom || [], duplicate.id])),
            mergedAt: new Date().toISOString()
        };

        const updated = await prisma.lead.update({
            where: { id: primary.id },
            data: {
                clientName: primary.clientName || duplicate.clientName,
                phone: primary.phone || duplicate.phone,
                userTgId: primary.userTgId || duplicate.userTgId,
                payload: mergedPayload
            }
        });

        await prisma.lead.update({
            where: { id: duplicate.id },
            data: {
                status: 'LOST',
                payload: {
                    ...(duplicate.payload as any || {}),
                    mergedInto: primary.id,
                    mergedAt: new Date().toISOString()
                }
            }
        });

        await prisma.leadActivity.create({
            data: {
                leadId: primary.id,
                type: 'DUPLICATE_MERGED',
                payload: { duplicateId: duplicate.id }
            }
        }).catch(() => null);

        res.json(mapLeadOutput(updated));
    } catch (e: any) {
        logger.error('[Leads] Merge error:', e.message || e);
        errorResponse(res, 500, 'Failed to merge leads');
    }
});

router.delete('/leads/:id', requireRole(['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;

        if (!isSuperadmin && userCompanyId) {
            const existing = await prisma.lead.findUnique({ where: { id }, select: { companyId: true } });
            if (!existing) return errorResponse(res, 404, 'Lead not found');
            if (existing.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
        }
        await prisma.lead.delete({ where: { id } });
        res.json({ success: true });
    } catch {
        errorResponse(res, 500, 'Failed to delete lead');
    }
});

export default router;
