import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { mapRequestStatusFilter } from '../services/dto.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();

const resolveDateRange = (range?: string, fromRaw?: string, toRaw?: string) => {
    const from = fromRaw ? new Date(fromRaw) : undefined;
    const to = toRaw ? new Date(toRaw) : undefined;
    if (from && !Number.isNaN(from.getTime()) || to && !Number.isNaN(to.getTime())) {
        return {
            from: from && !Number.isNaN(from.getTime()) ? from : undefined,
            to: to && !Number.isNaN(to.getTime()) ? to : undefined
        };
    }
    const now = new Date();
    const normalized = String(range || '').toLowerCase();
    const days = normalized === '7d' ? 7 : normalized === '30d' ? 30 : normalized === '90d' ? 90 : null;
    if (!days) return { from: undefined, to: undefined };
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: start, to: now };
};

const buildDateFilter = (from?: Date, to?: Date) => {
    if (!from && !to) return undefined;
    const range: any = {};
    if (from) range.gte = from;
    if (to) range.lte = to;
    return range;
};

const isMissingTableError = (error: any, tableName: string) => {
    return error?.code === 'P2021'
        && typeof error?.meta?.table === 'string'
        && String(error.meta.table).includes(tableName);
};

router.get('/events', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const companyId = (req as any).user?.companyId;
        if (!companyId) return errorResponse(res, 400, 'Company context required');

        const botId = typeof req.query.botId === 'string' ? req.query.botId : undefined;
        const startDate = typeof req.query.startDate === 'string' ? new Date(req.query.startDate) : undefined;
        const endDate = typeof req.query.endDate === 'string' ? new Date(req.query.endDate) : undefined;
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));

        const where: any = { companyId };
        if (botId) where.botId = botId;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate && !Number.isNaN(startDate.getTime())) where.createdAt.gte = startDate;
            if (endDate && !Number.isNaN(endDate.getTime())) where.createdAt.lte = endDate;
        }

        const events = await prisma.platformEvent.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        res.json(events);
    } catch (e: any) {
        logger.error('[Events] Fetch error:', e.message || e);
        errorResponse(res, 500, 'Failed to fetch events');
    }
});

router.get('/metrics/dashboard', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const botId = typeof req.query.botId === 'string' && req.query.botId !== 'ALL' ? req.query.botId : undefined;
        const requestStatus = typeof req.query.requestStatus === 'string' ? req.query.requestStatus : undefined;
        const { from, to } = resolveDateRange(String(req.query.range || ''), typeof req.query.from === 'string' ? req.query.from : undefined, typeof req.query.to === 'string' ? req.query.to : undefined);
        const dateFilter = buildDateFilter(from, to);

        const bots = companyId ? await prisma.botConfig.findMany({ where: { companyId }, select: { id: true } }) : [];
        const botIds = bots.map(b => b.id);
        if (botId && companyId && !botIds.includes(botId)) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const leadWhere: any = {};
        if (companyId) leadWhere.companyId = companyId;
        if (botId) leadWhere.botId = botId;
        if (dateFilter) leadWhere.createdAt = dateFilter;

        const requestWhere: any = {};
        if (companyId) requestWhere.companyId = companyId;
        if (dateFilter) requestWhere.createdAt = dateFilter;
        if (requestStatus && requestStatus !== 'ALL') {
            const mapped = mapRequestStatusFilter(requestStatus);
            if (mapped) requestWhere.status = mapped;
        }

        const messageWhere: any = { direction: 'INCOMING' };
        if (dateFilter) messageWhere.createdAt = dateFilter;
        if (botId) messageWhere.botId = botId;
        else if (companyId && botIds.length) messageWhere.botId = { in: botIds };
        else if (companyId) messageWhere.bot = { companyId };

        const campaignWhere: any = { status: 'RUNNING' };
        if (dateFilter) campaignWhere.createdAt = dateFilter;
        if (botId) campaignWhere.botId = botId;
        else if (companyId && botIds.length) campaignWhere.botId = { in: botIds };

        const draftWhere: any = {};
        if (dateFilter) draftWhere.createdAt = dateFilter;
        if (botId) draftWhere.botId = botId;
        else if (companyId && botIds.length) draftWhere.botId = { in: botIds };

        const [leadsTotal, leadsToday, leadsInProgress, leadsWon, leadSources, messagesCount, campaignsActive] = await Promise.all([
            prisma.lead.count({ where: leadWhere }),
            prisma.lead.count({
                where: {
                    ...(leadWhere || {}),
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                }
            }),
            prisma.lead.count({ where: { ...leadWhere, status: { not: 'NEW' } } }),
            prisma.lead.count({ where: { ...leadWhere, status: 'WON' } }),
            prisma.lead.groupBy({
                by: ['source'],
                where: leadWhere,
                _count: { _all: true }
            }).catch(() => []),
            prisma.botMessage.count({ where: messageWhere }),
            prisma.campaign.count({ where: campaignWhere })
        ]);

        let orchestrationStats = {
            skillPacksFresh: 0,
            reviewQueuePending: 0,
            importsAwaitingReview: 0
        };
        try {
            orchestrationStats = {
                skillPacksFresh: await prisma.automationSkillPack.count({
                    where: {
                        companyId,
                        freshnessState: 'FRESH'
                    }
                }),
                reviewQueuePending: await prisma.automationReviewQueue.count({
                    where: {
                        companyId,
                        status: 'PENDING'
                    }
                }),
                importsAwaitingReview: await prisma.importBatch.count({
                    where: {
                        companyId,
                        status: 'REVIEW_REQUIRED'
                    }
                })
            };
        } catch (e: any) {
            if (
                isMissingTableError(e, 'AutomationSkillPack')
                || isMissingTableError(e, 'AutomationReviewQueue')
                || isMissingTableError(e, 'ImportBatch')
            ) {
                orchestrationStats = {
                    skillPacksFresh: 0,
                    reviewQueuePending: 0,
                    importsAwaitingReview: 0
                };
            } else {
                throw e;
            }
        }

        const requests = await prisma.b2bRequest.findMany({
            where: requestWhere,
            select: {
                id: true,
                status: true,
                updatedAt: true,
                createdAt: true,
                _count: { select: { variants: true } }
            }
        });

        const requestsProgress = requests.filter(r => !['WON', 'LOST', 'DRAFT'].includes(String(r.status))).length;
        const requestsWithOffers = requests.filter(r => (r as any)._count?.variants > 0);
        const offersFresh = requestsWithOffers.filter(r => {
            const updatedAt = r.updatedAt || r.createdAt;
            return Date.now() - new Date(updatedAt).getTime() < 1000 * 60 * 60 * 24;
        }).length;

        const inventoryWhere: any = {};
        if (companyId) inventoryWhere.companyId = companyId;
        const inventoryAgg = await prisma.carListing.aggregate({
            where: inventoryWhere,
            _count: { _all: true },
            _sum: { price: true }
        });

        const draftsScheduled = await prisma.draft.count({
            where: { ...draftWhere, status: 'SCHEDULED' }
        });
        const draftsPostedToday = await prisma.draft.count({
            where: {
                ...draftWhere,
                status: 'POSTED',
                postedAt: {
                    gte: new Date(new Date().setHours(0, 0, 0, 0))
                }
            }
        });

        let partnerActivity: any[] = [];
        if (isSuperadmin) {
            const companyCounts = await prisma.b2bRequest.groupBy({
                by: ['companyId'],
                where: dateFilter ? { createdAt: dateFilter } : {},
                _count: { _all: true }
            });
            const companyIds = companyCounts.map(c => c.companyId).filter(Boolean) as string[];
            const companies = companyIds.length ? await prisma.workspace.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } }) : [];
            const nameMap = new Map(companies.map(c => [c.id, c.name || c.id]));
            partnerActivity = companyCounts
                .map(c => {
                    const key = c.companyId || '';
                    return { name: nameMap.get(key) || c.companyId || 'Unknown', value: c._count?._all || 0 };
                })
                .sort((a, b) => b.value - a.value)
                .slice(0, 5);
        }

        let activity: any[] = [];
        try {
            const def = await prisma.entityDefinition.findFirst({ where: { slug: 'sys_activity', status: 'ACTIVE' }, select: { id: true } });
            if (def?.id) {
                const records = await prisma.entityRecord.findMany({ where: { entityId: def.id }, orderBy: { createdAt: 'desc' }, take: 10 });
                activity = records.map((r: any) => ({ id: r.id, ...(r.data || {}), timestamp: r.data?.timestamp || r.createdAt }));
            }
        } catch {
            activity = [];
        }

        res.json({
            range: {
                from: from ? from.toISOString() : null,
                to: to ? to.toISOString() : null
            },
            stats: {
                requestsNew: requests.length,
                requestsProgress,
                offersFresh,
                requestsWithOffers: requestsWithOffers.length,
                inventoryValue: inventoryAgg._sum.price || 0,
                inventoryCount: inventoryAgg._count._all || 0,
                inboxNew: messagesCount,
                campaignsActive,
                leadsToday,
                draftsScheduled,
                draftsPosted: draftsPostedToday,
                skillPacksFresh: orchestrationStats.skillPacksFresh,
                reviewQueuePending: orchestrationStats.reviewQueuePending,
                importsAwaitingReview: orchestrationStats.importsAwaitingReview
            },
            funnel: {
                incoming: messagesCount,
                leads: leadsTotal,
                inProgress: leadsInProgress,
                won: leadsWon
            },
            sources: (leadSources || []).map((s: any) => ({ name: s.source || 'Unknown', value: s._count?._all || 0 })),
            partnerActivity,
            activity
        });
    } catch (e: any) {
        logger.error('[Metrics] Dashboard error:', e.message || e);
        errorResponse(res, 500, 'Failed to load dashboard metrics');
    }
});

router.get('/metrics/telegram', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const botId = typeof req.query.botId === 'string' && req.query.botId !== 'ALL' ? req.query.botId : undefined;
        const { from, to } = resolveDateRange(String(req.query.range || ''), typeof req.query.from === 'string' ? req.query.from : undefined, typeof req.query.to === 'string' ? req.query.to : undefined);
        const dateFilter = buildDateFilter(from, to);

        const where: any = { integration: 'TELEGRAM' };
        if (companyId) where.companyId = companyId;
        if (dateFilter) where.createdAt = dateFilter;
        if (botId) {
            where.meta = { path: ['botId'], equals: botId };
        }

        const grouped = await prisma.integrationEventLog.groupBy({
            by: ['action', 'status'],
            where,
            _count: { _all: true }
        });

        const counts: Record<string, number> = {
            sent: 0,
            failed: 0,
            received: 0
        };

        grouped.forEach(g => {
            const count = g._count?._all || 0;
            if (g.action === 'message.sent') counts.sent += count;
            if (g.action === 'message.received') counts.received += count;
            if (g.action === 'message.failed') counts.failed += count;
        });

        res.json({
            range: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
            counts
        });
    } catch (e: any) {
        logger.error('[Metrics] Telegram error:', e.message || e);
        errorResponse(res, 500, 'Failed to load telegram metrics');
    }
});

router.post('/search/parse', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
        if (!url) return errorResponse(res, 400, 'url is required');

        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.body?.companyId === 'string' ? req.body.companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const job = await prisma.parsingJob.create({
            data: {
                url,
                companyId: companyId || null,
                status: 'PENDING'
            }
        });
        res.json(job);
    } catch (e: any) {
        logger.error('[ParsingJob] Create error:', e.message || e);
        errorResponse(res, 500, 'Failed to create parsing job');
    }
});

router.get('/search/jobs', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

        const where: any = {};
        if (companyId) where.companyId = companyId;
        if (status) where.status = status;

        const jobs = await prisma.parsingJob.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        res.json(jobs);
    } catch (e: any) {
        logger.error('[ParsingJob] Fetch error:', e.message || e);
        errorResponse(res, 500, 'Failed to fetch parsing jobs');
    }
});

export default router;
