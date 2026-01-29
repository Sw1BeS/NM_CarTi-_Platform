
import { Router } from 'express';
// @ts-ignore
import { prisma } from '../../../services/prisma.js';
import { authenticateToken, requireRole } from '../../../middleware/auth.js';
import { generatePublicId, mapRequestInput, mapRequestOutput, mapVariantInput, mapVariantOutput, mapRequestStatusFilter } from '../../../services/dto.js';
import { RequestRepository } from '../../../repositories/index.js';
import { renderRequestCard, managerActionsKeyboard } from '../../../services/cardRenderer.js';
import { telegramOutbox } from '../../Communication/telegram/messaging/outbox/telegramOutbox.js';
import { generateRequestLink } from '../../../utils/deeplink.utils.js';

import { validate } from '../../../middleware/validation.js';
import { createRequestSchema } from '../../../validation/schemas.js';
import { logger } from '../../../utils/logger.js';
import { errorResponse } from '../../../utils/errorResponse.js';

const router = Router();
const requestRepo = new RequestRepository(prisma);

// --- B2B Requests CRUD ---
router.get('/', authenticateToken, async (req, res) => {
    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
    if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const status = req.query.status as string;
    const search = req.query.search as string;

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (status && status !== 'ALL') {
        const mappedStatus = mapRequestStatusFilter(status);
        if (mappedStatus) where.status = mappedStatus;
    }
    if (search) {
        where.OR = [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { publicId: { contains: search, mode: 'insensitive' } }
        ];
    }

    try {
        const { items, total } = await requestRepo.findAllRequests({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip
        });

        res.json({
            items: items.map(mapRequestOutput),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to fetch requests');
    }
});


// Create Request
router.post('/', authenticateToken, requireRole(['ADMIN', 'MANAGER']), validate(createRequestSchema), async (req, res) => {
    try {
        const data = req.body;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof (data || {}).companyId === 'string' ? (data || {}).companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const request = await requestRepo.createRequest({
            title: data.title || 'New Request',
            ...data,
            companyId
        });

        // Meta CAPI Event (preserved)
        if (companyId) {
            import('../../Integrations/meta/meta.service.js').then(({ MetaService }) => {
                MetaService.getInstance().sendEvent('SubmitApplication', {
                    user: { id: (req as any).user.id },
                }, { requestId: request.publicId }).catch(logger.error);
            });
        }
        res.json(mapRequestOutput(request));
    } catch (e: any) {
        errorResponse(res, 500, e.message);
    }
});

router.put('/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id: _id, variants, ...raw } = req.body;
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const existing = await requestRepo.findById(id);
        if (!existing) return errorResponse(res, 404, 'Request not found');
        if (!isSuperadmin) {
            if (existing.companyId && existing.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!existing.companyId && userCompanyId !== 'company_system') return errorResponse(res, 403, 'Forbidden');
        }

        // Update main request
        const data = mapRequestInput(raw);
        const request = await requestRepo.updateRequest(id, data);

        if (data.status === 'WON' && (existing.companyId || userCompanyId)) {
            import('../../Integrations/meta/meta.service.js').then(({ MetaService }) => {
                MetaService.getInstance().sendEvent('Purchase', {
                    user: { id: (req as any).user.id },
                }, { requestId: request.publicId, value: request.budgetMax, currency: 'USD' }).catch(logger.error);
            });
        }

        res.json(mapRequestOutput(request));
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to update request');
    }
});

router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const existing = await requestRepo.findById(id);
        if (!existing) return errorResponse(res, 404, 'Request not found');
        if (!isSuperadmin) {
            if (existing.companyId && existing.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!existing.companyId && userCompanyId !== 'company_system') return errorResponse(res, 403, 'Forbidden');
        }
        await requestRepo.deleteRequest(id);
        res.json({ success: true });
    } catch (e: any) { errorResponse(res, 500, 'Failed to delete request'); }
});

// --- Variant Management Sub-Routes ---
router.post('/:id/variants', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    const { id } = req.params;
    const variantData = mapVariantInput(req.body || {});
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const request = await requestRepo.findById(id);
        if (!request) return errorResponse(res, 404, 'Request not found');
        if (!isSuperadmin) {
            if (request.companyId && request.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!request.companyId && userCompanyId !== 'company_system') return errorResponse(res, 403, 'Forbidden');
        }

        const variant = await requestRepo.addVariant(id, variantData);
        res.json(mapVariantOutput(variant));
    } catch (e: any) {
        errorResponse(res, 500, 'Failed to add variant');
    }
});

// --- Channel publish/update/close ---
const resolveBot = async (companyId: string | null, botId?: string) => {
    if (botId) {
        const bot = await prisma.botConfig.findUnique({ where: { id: botId } });
        if (!bot?.token) return null;
        if (companyId && bot.companyId !== companyId) return null;
        return bot;
    }
    return prisma.botConfig.findFirst({
        where: {
            isEnabled: true,
            ...(companyId ? { companyId } : {})
        },
        orderBy: { createdAt: 'asc' }
    });
};

const buildChannelText = (req: any, template?: string) => {
    const card = renderRequestCard(req);
    if (!template || template === 'RAW') return card;
    if (template === 'IN_STOCK') {
        return [
            `🚗 <b>${req.title}</b>`,
            req.budgetMax ? `💰 до ${req.budgetMax.toLocaleString()} USD` : null,
            req.city ? `📍 ${req.city}` : null,
            req.yearMin ? `📅 ${req.yearMin}+` : null,
            `✅ В наявності`,
            '',
            card
        ].filter(Boolean).join('\n');
    }
    if (template === 'IN_TRANSIT') {
        return [
            `🚢 <b>${req.title}</b>`,
            req.budgetMax ? `💰 до ${req.budgetMax.toLocaleString()} USD` : null,
            req.city ? `📍 ${req.city}` : null,
            req.yearMin ? `📅 ${req.yearMin}+` : null,
            `📦 В дорозі`,
            '',
            card
        ].filter(Boolean).join('\n');
    }
    return card;
};

router.post('/:id/publish-channel', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { botId, channelId, text, template } = req.body || {};
        const request = await requestRepo.findById(id);
        if (!request) return errorResponse(res, 404, 'Request not found');
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');
        if (!isSuperadmin) {
            if (request.companyId && request.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!request.companyId && userCompanyId !== 'company_system') return errorResponse(res, 403, 'Forbidden');
        }

        const effectiveCompanyId = request.companyId || userCompanyId || null;
        const bot = await resolveBot(effectiveCompanyId, botId ? String(botId) : undefined);
        if (!bot?.token) return errorResponse(res, 400, 'Bot not found');
        const destination = channelId || bot.channelId;
        if (!destination) return errorResponse(res, 400, 'ChannelId required');

        const reqCard = buildChannelText(request, template);
        const botUsername = bot.config ? (bot.config as any).username : undefined;
        const dl = botUsername && (request.publicId || request.id)
            ? generateRequestLink(botUsername, request.publicId || request.id)
            : undefined;
        const keyboard = dl ? { inline_keyboard: [[{ text: '🚗 Є авто', url: dl }]] } : undefined;

        const sent = await telegramOutbox.sendMessage({
            botId: bot.id,
            token: bot.token,
            chatId: destination,
            text: text || reqCard,
            replyMarkup: keyboard,
            companyId: bot.companyId || null
        });
        const messageId = (sent as any)?.message_id;

        const channelPost = await requestRepo.createChannelPost({
            requestId: id,
            botId: bot.id,
            channelId: destination,
            messageId,
            status: 'ACTIVE',
            payload: { text: text || reqCard }
        });

        await requestRepo.logMessage({
            requestId: id,
            botId: bot.id,
            chatId: destination,
            direction: 'OUTGOING',
            text: text || reqCard,
            payload: { type: 'CHANNEL_PUBLISH', messageId }
        }).catch((e: any) => {
            logger.error('[CHANNEL_PUBLISH] MessageLog failed:', e.message || e);
        });

        res.json({ ok: true, channelPost });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to publish');
    }
});

router.put('/:id/channel-post', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { text, channelId } = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const request = await requestRepo.findById(id);
        if (!request) return errorResponse(res, 404, 'Request not found');
        if (!isSuperadmin) {
            if (request.companyId && request.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!request.companyId && userCompanyId !== 'company_system') return errorResponse(res, 403, 'Forbidden');
        }

        const cp = await requestRepo.findChannelPost(id, channelId);
        if (!cp) return errorResponse(res, 404, 'ChannelPost not found');
        const effectiveCompanyId = request.companyId || userCompanyId || null;
        const bot = cp.botId
            ? await resolveBot(effectiveCompanyId, String(cp.botId))
            : await resolveBot(effectiveCompanyId, undefined);
        if (!bot?.token) return errorResponse(res, 400, 'Bot not found');
        const payload = (cp.payload as any) || {};
        const nextText = text || payload.text || 'Updated';
        await telegramOutbox.editMessageText({
            botId: bot.id,
            token: bot.token,
            chatId: cp.channelId,
            messageId: cp.messageId,
            text: nextText,
            companyId: bot.companyId || null
        });
        const updated = await requestRepo.updateChannelPost(cp.id, {
            status: 'UPDATED',
            payload: { ...(payload || {}), text: nextText }
        });
        await requestRepo.logMessage({
            requestId: id,
            botId: bot.id,
            chatId: cp.channelId,
            direction: 'OUTGOING',
            text: nextText,
            payload: { type: 'CHANNEL_UPDATE', messageId: cp.messageId }
        }).catch((e: any) => {
            logger.error('[CHANNEL_UPDATE] MessageLog failed:', e.message || e);
        });
        res.json({ ok: true, channelPost: updated });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to update post');
    }
});

router.post('/:id/close-channel', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { channelId } = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required', 'COMPANY_REQUIRED');

        const request = await requestRepo.findById(id);
        if (!request) return errorResponse(res, 404, 'Request not found');
        if (!isSuperadmin) {
            if (request.companyId && request.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');
            if (!request.companyId && userCompanyId !== 'company_system') return errorResponse(res, 403, 'Forbidden');
        }

        const cp = await requestRepo.findChannelPost(id, channelId);
        if (!cp) return errorResponse(res, 404, 'ChannelPost not found');
        const effectiveCompanyId = request.companyId || userCompanyId || null;
        const bot = cp.botId
            ? await resolveBot(effectiveCompanyId, String(cp.botId))
            : await resolveBot(effectiveCompanyId, undefined);
        if (!bot?.token) return errorResponse(res, 400, 'Bot not found');
        const payload = (cp.payload as any) || {};
        const closedText = `${payload.text || ''}\n\n🚫 Запит закрито`;
        await telegramOutbox.editMessageText({
            botId: bot.id,
            token: bot.token,
            chatId: cp.channelId,
            messageId: cp.messageId,
            text: closedText,
            replyMarkup: { inline_keyboard: [] },
            companyId: bot.companyId || null
        });
        const updated = await requestRepo.updateChannelPost(cp.id, {
            status: 'CLOSED',
            payload: { ...(payload || {}), closed: true, text: closedText }
        });
        await requestRepo.logMessage({
            requestId: id,
            botId: bot.id,
            chatId: cp.channelId,
            direction: 'OUTGOING',
            text: closedText,
            payload: { type: 'CHANNEL_CLOSE', messageId: cp.messageId }
        }).catch((e: any) => {
            logger.error('[CHANNEL_CLOSE] MessageLog failed:', e.message || e);
        });
        res.json({ ok: true, channelPost: updated });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to close post');
    }
});

export default router;
