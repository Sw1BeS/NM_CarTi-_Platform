import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import axios from 'axios';
import { requireRole } from '../middleware/auth.js';
import { IntegrationService } from '../modules/Integrations/integration.service.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();
const integrationService = new IntegrationService();

router.get('/campaigns', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const campaigns = await prisma.campaign.findMany({
            where: companyId ? { bot: { companyId } } : {},
            orderBy: { createdAt: 'desc' }
        });

        const mapped = campaigns.map(c => {
            const content = (c.content as any) || {};
            const stats = (c.stats as any) || {};
            return {
                id: c.id,
                name: c.name,
                botId: c.botId,
                contentId: content.contentId,
                destinationIds: content.destinationIds || [],
                status: c.status,
                scheduledAt: c.scheduledAt,
                createdAt: c.createdAt,
                progress: {
                    sent: stats.sent || 0,
                    failed: stats.failed || 0,
                    total: stats.total || (content.destinationIds || []).length
                },
                logs: stats.logs || []
            };
        });

        res.json(mapped);
    } catch (e: any) {
        logger.error('[Campaigns] List error:', e.message || e);
        errorResponse(res, 500, 'Failed to list campaigns');
    }
});

router.post('/campaigns', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof (req.body || {}).companyId === 'string' ? (req.body || {}).companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const { name, botId, contentId, destinationIds, message } = req.body || {};
        if (!name || !botId) return errorResponse(res, 400, 'name and botId are required');
        if (!Array.isArray(destinationIds) || destinationIds.length === 0) {
            return errorResponse(res, 400, 'destinationIds must be a non-empty array');
        }

        const bot = await prisma.botConfig.findUnique({ where: { id: String(botId) } });
        if (!bot?.token) return errorResponse(res, 400, 'Bot not found or token missing');
        if (!isSuperadmin && bot.companyId !== companyId) return errorResponse(res, 403, 'Forbidden');

        let contentText = typeof message === 'string' ? message : '';
        if (!contentText && contentId) {
            const record = await prisma.entityRecord.findFirst({
                where: {
                    entity: { slug: 'tg_content' },
                    data: { path: ['id'], equals: String(contentId) }
                }
            });
            if (record?.data && typeof record.data === 'object') {
                const data = record.data as any;
                contentText = String(data.body || data.text || '');
            }
        }
        if (!contentText) return errorResponse(res, 400, 'content text not found');

        const total = destinationIds.length;
        const initialStats = { sent: 0, failed: 0, total, logs: [] };
        const campaign = await prisma.campaign.create({
            data: {
                name: String(name),
                botId: bot.id,
                content: {
                    contentId: contentId || null,
                    destinationIds,
                    message: contentText
                } as any,
                status: 'RUNNING',
                stats: initialStats as any
            }
        });

        const responsePayload = {
            id: campaign.id,
            name: campaign.name,
            botId: campaign.botId,
            contentId: contentId || null,
            destinationIds,
            status: campaign.status,
            createdAt: campaign.createdAt,
            progress: initialStats,
            logs: []
        };

        res.json(responsePayload);

        // Async worker-like send
        setImmediate(async () => {
            let sent = 0;
            let failed = 0;
            const logs: any[] = [];
            for (const dest of destinationIds) {
                const destination = String(dest);
                try {
                    const result = await integrationService.publishTelegramChannelPost({
                        companyId: String(companyId || bot.companyId || ''),
                        botToken: bot.token,
                        botId: bot.id,
                        destination,
                        text: contentText
                    });
                    sent += 1;
                    logs.push({
                        destinationId: destination,
                        status: 'SUCCESS',
                        sentAt: new Date().toISOString(),
                        messageId: (result?.result as any)?.message_id || (result as any)?.message_id || undefined
                    });
                } catch (e: any) {
                    failed += 1;
                    logs.push({
                        destinationId: destination,
                        status: 'FAILED',
                        sentAt: new Date().toISOString(),
                        error: e.message || 'Send failed'
                    });
                }
            }
            const finalStatus = failed && !sent ? 'FAILED' : 'COMPLETED';
            await prisma.campaign.update({
                where: { id: campaign.id },
                data: {
                    status: finalStatus,
                    stats: { sent, failed, total, logs } as any
                }
            });
        });
    } catch (e: any) {
        logger.error('[Campaigns] Create error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to create campaign');
    }
});

router.get('/destinations', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;

        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const bots = await prisma.botConfig.findMany({
            where: {
                isEnabled: true,
                ...(companyId ? { companyId } : {})
            }
        });

        const rows = await prisma.botMessage.findMany({
            where: {
                ...(companyId ? { bot: { companyId } } : {})
            },
            select: { chatId: true, payload: true, botId: true },
            orderBy: { createdAt: 'desc' },
            take: 500
        });

        const destMap = new Map<string, any>();

        bots.forEach(bot => {
            if (bot.channelId) {
                const identifier = String(bot.channelId);
                destMap.set(identifier, {
                    id: `dest_${identifier}`,
                    identifier,
                    name: bot.name ? `${bot.name} Channel` : 'Channel',
                    type: 'CHANNEL',
                    tags: ['bot-channel'],
                    verified: true,
                    botId: bot.id
                });
            }
            if (bot.adminChatId) {
                const identifier = String(bot.adminChatId);
                destMap.set(identifier, {
                    id: `dest_${identifier}`,
                    identifier,
                    name: bot.name ? `${bot.name} Admin` : 'Admin Chat',
                    type: 'USER',
                    tags: ['bot-admin'],
                    verified: true,
                    botId: bot.id
                });
            }
        });

        rows.forEach(row => {
            const payload: any = (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload))
                ? row.payload
                : {};
            const chat = payload.chat || {};
            const from = payload.from || {};
            const identifier = row.chatId ? String(row.chatId) : '';
            if (!identifier || destMap.has(identifier)) return;

            const chatType = String(chat.type || 'private');
            const name = chat.title || from.first_name || from.username || identifier;
            const type = chatType.includes('channel')
                ? 'CHANNEL'
                : chatType.includes('group')
                    ? 'GROUP'
                    : 'USER';

            destMap.set(identifier, {
                id: `dest_${identifier}`,
                identifier,
                name,
                type,
                tags: ['bot-user'],
                verified: true,
                botId: row.botId
            });
        });

        const destDef = await prisma.entityDefinition.findFirst({
            where: { slug: 'tg_destination', status: 'ACTIVE' },
            select: { id: true }
        });

        if (destDef) {
            const records = await prisma.entityRecord.findMany({
                where: { entityId: destDef.id },
                orderBy: { updatedAt: 'desc' },
                take: 500
            });

            records.forEach(record => {
                const data = (record as any).data || {};
                const recordCompanyId = data.companyId || data.workspaceId;
                if (companyId && recordCompanyId && String(recordCompanyId) !== String(companyId)) return;
                if (companyId && !recordCompanyId && !isSuperadmin) return;
                const identifier = data.identifier || data.chatId || data.id;
                if (!identifier || destMap.has(identifier)) return;

                const typeRaw = String(data.type || '').toUpperCase();
                const type = typeRaw === 'CHANNEL' || typeRaw === 'GROUP' ? typeRaw : 'USER';
                destMap.set(identifier, {
                    id: data.id || `dest_${identifier}`,
                    identifier: String(identifier),
                    name: data.name || data.title || String(identifier),
                    type,
                    tags: Array.isArray(data.tags) ? data.tags : [],
                    verified: data.verified !== false,
                    botId: data.botId
                });
            });
        }

        res.json(Array.from(destMap.values()));
    } catch (e: any) {
        logger.error('[Destinations] Error:', e.message || e);
        errorResponse(res, 500, 'Failed to fetch destinations');
    }
});

router.get('/proxy', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const target = req.query.url;
        if (!target || typeof target !== 'string') {
            return errorResponse(res, 400, 'url is required');
        }
        const parsed = new URL(target);
        const allowedHosts = new Set([
            'auto.ria.com',
            'www.auto.ria.com',
            'olx.ua',
            'www.olx.ua',
            'rst.ua',
            'www.rst.ua',
            'autoplus.ua',
            'www.autoplus.ua',
            'autotrader.com',
            'www.autotrader.com',
            'cars.com',
            'www.cars.com',
            'cargurus.com',
            'www.cargurus.com',
            'carsforsale.com',
            'www.carsforsale.com',
            'copart.com',
            'www.copart.com',
            'iaai.com',
            'www.iaai.com',
            'autotempest.com',
            'www.autotempest.com'
        ]);
        if (!allowedHosts.has(parsed.hostname)) {
            return errorResponse(res, 400, 'Host not allowed');
        }

        const response = await axios.get(target, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; CartieBot/1.0; +https://cartie.ai)'
            }
        });
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(response.data);
    } catch (e: any) {
        logger.error('[Proxy] Error:', e.message || e);
        errorResponse(res, 500, 'Failed to fetch target URL');
    }
});

export default router;
