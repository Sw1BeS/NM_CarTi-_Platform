import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();

router.get('/scenarios/templates', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (_req, res) => {
    try {
        const templates = await prisma.scenarioTemplate.findMany({
            where: { isPublic: true },
            orderBy: { updatedAt: 'desc' }
        });

        const mapped = templates.map(t => {
            const structure = (t.structure as any) || {};
            const nodes = Array.isArray(structure.nodes) ? structure.nodes : [];
            const entryNodeId = structure.entryNodeId || (nodes[0]?.id || '');
            return {
                id: t.id,
                name: t.name,
                description: t.description,
                category: t.category,
                triggerCommand: structure.triggerCommand || t.name?.toLowerCase()?.replace(/\s+/g, '_'),
                keywords: Array.isArray(structure.keywords) ? structure.keywords : [],
                isActive: false,
                nodes,
                entryNodeId,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt
            };
        });

        res.json(mapped);
    } catch (e) {
        logger.error('[Templates] List error:', e);
        res.json([]);
    }
});

router.get('/scenarios', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        const botId = typeof req.query.botId === 'string' ? req.query.botId : undefined;
        const includeGlobal = String(req.query.includeGlobal || '').trim() === '1'
            || String(process.env.TELEGRAM_SCENARIO_SCOPE_FALLBACK || 'false').toLowerCase() === 'true';

        const where: any = {};
        if (companyId) where.companyId = companyId;
        if (botId) {
            if (includeGlobal) {
                where.OR = [{ botId }, { botId: null }];
            } else {
                where.botId = botId;
            }
        }

        const scenarios = await prisma.scenario.findMany({
            where,
            orderBy: { updatedAt: 'desc' }
        });
        res.json(scenarios);
    } catch (e: any) {
        logger.error('[Scenarios] List error:', e);
        errorResponse(res, 500, 'Failed to list scenarios');
    }
});

router.post('/scenarios', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id, _recordId, ...data } = req.body || {};
        const companyId = (req as any).user?.companyId;

        if (!companyId) return errorResponse(res, 400, 'Company context required');
        if (!data.name) return errorResponse(res, 400, 'Name is required');
        if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
            return errorResponse(res, 400, 'Scenario must contain at least one node');
        }
        if (!data.entryNodeId) {
            return errorResponse(res, 400, 'Entry node is required');
        }
        let resolvedBotId: string | null | undefined = undefined;
        if ('botId' in data) {
            const requestedBotId = data.botId ? String(data.botId) : null;
            if (requestedBotId) {
                const bot = await prisma.botConfig.findUnique({ where: { id: requestedBotId } });
                if (!bot || bot.companyId !== companyId) {
                    return errorResponse(res, 400, 'Invalid botId');
                }
                resolvedBotId = bot.id;
            } else {
                resolvedBotId = null;
            }
        }

        const ids = new Set((data.nodes || []).map((n: any) => n.id));
        if (!ids.has(data.entryNodeId)) {
            return errorResponse(res, 400, 'Entry node does not exist in nodes list');
        }
        for (const n of data.nodes) {
            if (!n.id) return errorResponse(res, 400, 'Each node must have an id');
            const refs: string[] = [];
            if (n.nextNodeId) refs.push(n.nextNodeId);
            if (n.content?.trueNodeId) refs.push(n.content.trueNodeId);
            if (n.content?.falseNodeId) refs.push(n.content.falseNodeId);
            if (Array.isArray(n.content?.choices)) {
                n.content.choices.forEach((c: any) => c.nextNodeId && refs.push(c.nextNodeId));
            }
            for (const r of refs) {
                if (r && !ids.has(r)) {
                    return errorResponse(res, 400, `Broken link from ${n.id} to ${r}`);
                }
            }
        }

        const rawId = typeof id === 'string' && id.trim() ? id.trim() : undefined;
        const existing = rawId ? await prisma.scenario.findUnique({ where: { id: rawId } }) : null;

        const status = String(data.status || 'PUBLISHED').toUpperCase();
        const trigger = data.triggerCommand ? String(data.triggerCommand).trim() : null;
        if (trigger && status === 'PUBLISHED') {
            const conflict = await prisma.scenario.findFirst({
                where: {
                    companyId,
                    status: 'PUBLISHED',
                    triggerCommand: { equals: trigger, mode: 'insensitive' },
                    ...(existing ? { id: { not: existing.id } } : {}),
                    ...(resolvedBotId !== undefined ? { botId: resolvedBotId } : {})
                }
            });
            if (conflict) {
                return errorResponse(res, 409, 'Trigger command already used by another published scenario');
            }
        }

        if (existing) {
            if (existing.companyId !== companyId) {
                return errorResponse(res, 403, 'Forbidden');
            }
            const updated = await prisma.scenario.update({
                where: { id: existing.id },
                data: {
                    name: data.name,
                    triggerCommand: data.triggerCommand || null,
                    keywords: data.keywords || [],
                    isActive: data.isActive ?? false,
                    status: status as any,
                    entryNodeId: data.entryNodeId,
                    nodes: data.nodes || [],
                    companyId,
                    ...(resolvedBotId !== undefined ? { botId: resolvedBotId } : {})
                }
            });
            res.json(updated);
        } else {
            const created = await prisma.scenario.create({
                data: {
                    ...(rawId ? { id: rawId } : {}),
                    name: data.name,
                    triggerCommand: data.triggerCommand || null,
                    keywords: data.keywords || [],
                    isActive: data.isActive ?? false,
                    status: status as any,
                    entryNodeId: data.entryNodeId,
                    nodes: data.nodes || [],
                    companyId,
                    botId: resolvedBotId ?? null
                }
            });
            res.json(created);
        }
    } catch (e: any) {
        logger.error('[Scenarios] Save error:', e);
        errorResponse(res, 500, 'Failed to save scenario');
    }
});

router.delete('/scenarios/:id', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = (req as any).user?.companyId;
        if (!companyId) return errorResponse(res, 400, 'Company context required');
        const deleted = await prisma.scenario.deleteMany({ where: { id, companyId } });
        if (!deleted.count) return errorResponse(res, 404, 'Scenario not found');
        res.json({ success: true });
    } catch (e: any) {
        logger.error('[Scenarios] Delete error:', e);
        errorResponse(res, 500, 'Failed to delete scenario');
    }
});

export default router;
