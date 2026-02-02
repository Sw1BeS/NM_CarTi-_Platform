
import { Router, Request, Response } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getWorkspaceById, getWorkspaceBySlug, getAllUsers } from '../services/v41/readService.js';
import { botManager } from '../modules/Communication/bots/bot.service.js';
import { searchAutoRia } from '../modules/Integrations/autoria.service.js';
import { sendMetaEvent } from '../modules/Integrations/meta.service.js';
import { importDraft } from '../modules/Inventory/inventory/inventory.service.js';
import { mapLeadCreateInput, mapLeadOutput, mapLeadStatusFilter, mapLeadUpdateInput } from '../services/dto.js';
import { previewTemplate, resolveTemplateBody, buildTemplateVariables, renderTemplateBody } from '../services/publication.service.js';
import { logIntegrationEvent } from '../services/integrationEventLog.service.js';
import { mapBotInput, mapBotOutput } from '../modules/Communication/bots/botDto.js';
import { IntegrationService } from '../modules/Integrations/integration.service.js';
import { setWebhookForBot, deleteWebhookForBot } from '../modules/Communication/telegram/core/telegramAdmin.service.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';
import { whatsAppRouter } from '../modules/Integrations/whatsapp/whatsapp.service.js';
import { viberRouter } from '../modules/Integrations/viber/viber.service.js';
import showcaseRouter from '../modules/Marketing/showcase/showcase.controller.js';
import parserRouter from '../modules/Parser/parser.controller.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const integrationService = new IntegrationService();

const router = Router();

router.use('/showcase', showcaseRouter);
router.use('/parser', parserRouter);

router.use(authenticateToken);

// Public Webhooks
const webhookRouter = Router();
webhookRouter.use('/whatsapp', whatsAppRouter);
webhookRouter.use('/viber', viberRouter);
// Note: Telegram webhook is handled in telegram.routes.ts and likely mounted in index.ts or separate root


const resolveCompanyId = async (requestedCompanyId?: string | null, userCompanyId?: string | null) => {
    if (requestedCompanyId) return requestedCompanyId;
    if (userCompanyId) return userCompanyId;

    const systemWorkspace = await getWorkspaceById('company_system') || await getWorkspaceBySlug('system');
    if (systemWorkspace) return systemWorkspace.id;

    logger.warn('[API] System workspace not found, falling back to ID literal "company_system"');
    return 'company_system';
};

// --- Bot Management (CRUD) ---
router.get('/bots', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;

    if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

    const bots = await prisma.botConfig.findMany({
        where: companyId ? { companyId } : {},
        orderBy: { id: 'asc' }
    });
    res.json(bots.map(mapBotOutput));
});

router.post('/bots', requireRole(['ADMIN']), async (req, res) => {
    const { data } = mapBotInput(req.body || {});
    if (!data.token) return errorResponse(res, 400, 'Token is required');

    // MIGRATION: Sanitize optional fields
    const cleanChannelId = data.channelId && String(data.channelId).trim() !== '' ? String(data.channelId).trim() : null;
    const cleanAdminChatId = data.adminChatId && String(data.adminChatId).trim() !== '' ? String(data.adminChatId).trim() : null;

    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId || null;
        const companyId = await resolveCompanyId(isSuperadmin ? data.companyId : null, userCompanyId);
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        // UX IMPROVEMENT: Auto-fetch details from Telegram
        let botName = data.name;
        let botUsername = '';

        // Auto-generation vars
        let finalSlug = data.defaultShowcaseSlug || 'system';
        let finalMiniAppConfig = data.miniAppConfig || {};
        let finalMenuConfig = data.menuConfig || {};

        try {
            const me = await callTelegram(data.token, 'getMe', {});
            if (me) {
                // Always act as authoritative source if we got a valid response
                // especially if the user just sent a fallback like "My New Bot" or "bot"
                if (!botName || botName === 'My New Bot' || botName === 'bot') {
                    botName = me.first_name;
                }
                botUsername = me.username || '';

                // If we have a username, we can generate a real slug and URL
                if (botUsername) {
                    finalSlug = botUsername; // Use username as the primary slug

                    const baseUrl = (data.config?.publicBaseUrl || '').replace(/\/$/, '');
                    // Construct the deep link if we have a base URL, otherwise we rely on t.me link
                    // standard deep link: https://t.me/SEARCH_ENGINE_BOT/app?startapp=SLUG
                    // but for our internal routing we want the app url: https://DOMAIN/p/app/USERNAME
                    const publicAppUrl = baseUrl ? `${baseUrl}/p/app/${botUsername}` : `https://t.me/${botUsername}/app`;

                    // Update Mini App Config
                    finalMiniAppConfig = {
                        ...finalMiniAppConfig,
                        url: publicAppUrl,
                        showcaseSlug: botUsername
                    };

                    // Update Menu Config (replace placeholder)
                    if (finalMenuConfig.buttons) {
                        finalMenuConfig.buttons = finalMenuConfig.buttons.map((btn: any) =>
                            btn.type === 'LINK' && (btn.value === '{{MINI_APP_URL}}' || btn.value.includes('/p/app/bot'))
                                ? { ...btn, value: publicAppUrl }
                                : btn
                        );
                    }
                }
            }
        } catch (tgError: any) {
            logger.warn(`Failed to fetch getMe for token: ${tgError.message}`);
            // If name is missing and TG failed, we can't create it properly unless we default something
            if (!botName) botName = 'My New Bot';
        }

        const newBot = await prisma.botConfig.create({
            data: {
                ...data,
                name: botName,
                companyId,
                token: data.token.trim(),
                channelId: cleanChannelId,
                adminChatId: cleanAdminChatId,
                isEnabled: data.isEnabled ?? true,
                defaultShowcaseSlug: finalSlug, // Update slug
                miniAppConfig: finalMiniAppConfig, // Update URLs
                menuConfig: finalMenuConfig, // Update Buttons
                config: {
                    ...(data.config || {}),
                    botUsername, // Save username for slug generation
                    autoDiscovered: true
                }
            }
        });

        // Fire and forget restart to avoid blocking the UI response
        botManager.restartBot(newBot.id).catch(e => logger.error("Async Bot Restart Failed:", e));

        // Return the enriched object so UI updates immediately
        const output = mapBotOutput(newBot);
        // @ts-ignore
        output.botUsername = botUsername;

        res.json(output);
    } catch (e) {
        logger.error("Create Bot Error:", e);
        errorResponse(res, 500, "Failed to create bot. Token might be duplicate or invalid.");
    }
});

router.put('/bots/:id', requireRole(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.botConfig.findUnique({ where: { id } });
    if (!existing) return errorResponse(res, 404, 'Bot not found');
    const user = (req as any).user || {};
    const isSuperadmin = user.role === 'SUPER_ADMIN';
    const userCompanyId = user.companyId || user.workspaceId;
    if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
    if (!isSuperadmin && existing.companyId !== userCompanyId) {
        return errorResponse(res, 403, 'Forbidden');
    }
    const { data } = mapBotInput(req.body || {}, existing.config);
    if ('token' in data && !data.token) return errorResponse(res, 400, 'Token is required');
    if (!isSuperadmin) delete data.companyId;

    // Sanitize optional fields
    const cleanChannelId = data.channelId && String(data.channelId).trim() !== '' ? String(data.channelId).trim() : null;
    const cleanAdminChatId = data.adminChatId && String(data.adminChatId).trim() !== '' ? String(data.adminChatId).trim() : null;

    try {
        const updated = await prisma.botConfig.update({
            where: { id },
            data: {
                ...data,
                ...(data.token ? { token: data.token.trim() } : {}),
                channelId: cleanChannelId,
                adminChatId: cleanAdminChatId
            }
        });

        // Fire and forget
        botManager.restartBot(id).catch(e => logger.error("Async Bot Update Failed:", e));

        res.json(mapBotOutput(updated));
    } catch (e) {
        logger.error("Update Bot Error:", e);
        errorResponse(res, 500, 'Failed to update bot');
    }
});

router.post('/bots/:id/webhook', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const bot = await prisma.botConfig.findUnique({ where: { id }, select: { companyId: true } });
        if (!bot) return errorResponse(res, 404, 'Bot not found');
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
        if (!isSuperadmin && bot.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }
        const { publicBaseUrl, secretToken } = req.body || {};

        // Production-friendly fallback: infer base URL from proxy headers when PUBLIC_BASE_URL isn't set.
        const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
        const forwardedHost = (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
        const host = forwardedHost || req.get('host');
        const proto = forwardedProto || req.protocol;
        const inferredBaseUrl = host ? `${proto}://${host}` : undefined;

        const result = await setWebhookForBot(id, { publicBaseUrl: publicBaseUrl || inferredBaseUrl, secretToken });
        botManager.restartBot(id).catch(e => logger.error('Async Bot Restart Failed:', e));
        res.json({ ok: true, ...result });
    } catch (e: any) {
        logger.error('[Webhook] Set error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to set webhook');
    }
});

router.delete('/bots/:id/webhook', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const bot = await prisma.botConfig.findUnique({ where: { id }, select: { companyId: true } });
        if (!bot) return errorResponse(res, 404, 'Bot not found');
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
        if (!isSuperadmin && bot.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }
        await deleteWebhookForBot(id);
        botManager.restartBot(id).catch(e => logger.error('Async Bot Restart Failed:', e));
        res.json({ ok: true });
    } catch (e: any) {
        logger.error('[Webhook] Delete error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to delete webhook');
    }
});

router.delete('/bots/:id', requireRole(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const bot = await prisma.botConfig.findUnique({ where: { id }, select: { companyId: true } });
        if (!bot) return errorResponse(res, 404, 'Bot not found');
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');
        if (!isSuperadmin && bot.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }
        await prisma.botConfig.delete({ where: { id } });
        botManager.restartBot(id).catch(e => logger.error("Async Bot Restart Failed:", e));
        res.json({ success: true });
    } catch (e) { errorResponse(res, 500, 'Failed to delete bot'); }
});

const TELEGRAM_METHODS = new Set([
    'getMe',
    'getWebhookInfo',
    'sendMessage',
    'sendPhoto',
    'sendDocument',
    'sendVideo',
    'sendAudio',
    'sendVoice',
    'sendAnimation',
    'sendSticker',
    'sendMediaGroup',
    'editMessageText',
    'sendChatAction',
    'answerCallbackQuery',
    'setMyCommands',
    'setChatMenuButton',
    'getFile',
    'getUpdates'
]);

const resolveBot = async (token?: string, botId?: string, companyId?: string | null) => {
    if (botId) {
        const bot = await prisma.botConfig.findUnique({ where: { id: botId } });
        return bot?.token ? { token: bot.token, botId: bot.id, bot } : null;
    }
    if (token) {
        const bot = await prisma.botConfig.findFirst({ where: { token } });
        return { token, botId: bot?.id, bot: bot || null };
    }
    const bot = await prisma.botConfig.findFirst({
        where: {
            isEnabled: true,
            ...(companyId ? { companyId } : {})
        }
    });
    return bot?.token ? { token: bot.token, botId: bot.id, bot } : null;
};

const callTelegram = async (token: string, method: string, params: Record<string, any>) => {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await axios.post(url, params, { timeout: 15000 });
    if (!response.data?.ok) {
        const message = response.data?.description || 'Telegram API error';
        throw new Error(message);
    }
    return response.data.result;
};

// --- Telegram Proxy (server-side) ---
router.post('/telegram/call', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { token, botId, method, params } = req.body || {};
        if (!method || !TELEGRAM_METHODS.has(method)) {
            return errorResponse(res, 400, 'Unsupported Telegram method');
        }
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = isSuperadmin
            ? (typeof (req.body || {}).companyId === 'string' ? (req.body || {}).companyId : (typeof req.query.companyId === 'string' ? req.query.companyId : undefined))
            : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const resolved = await resolveBot(token, botId, companyId);
        if (!resolved?.token) {
            return errorResponse(res, 400, 'Bot token not found');
        }
        if (resolved.bot?.companyId && companyId && resolved.bot.companyId !== companyId && !isSuperadmin) {
            return errorResponse(res, 403, 'Forbidden');
        }

        if (method === 'sendMessage') {
            if (!resolved.botId) return errorResponse(res, 400, 'Bot not registered');
            const chatId = String(params?.chat_id || params?.chatId || '');
            const text = String(params?.text || '');
            if (!chatId || !text) {
                return errorResponse(res, 400, 'chat_id and text are required');
            }
            const result = await telegramOutbox.sendMessage({
                botId: resolved.botId,
                token: resolved.token,
                chatId,
                text,
                replyMarkup: params?.reply_markup,
                companyId: resolved.bot?.companyId || null
            });
            return res.json({ ok: true, result });
        }

        if (method === 'sendPhoto') {
            if (!resolved.botId) return errorResponse(res, 400, 'Bot not registered');
            const chatId = String(params?.chat_id || params?.chatId || '');
            const photo = String(params?.photo || '');
            if (!chatId || !photo) {
                return errorResponse(res, 400, 'chat_id and photo are required');
            }
            const result = await telegramOutbox.sendPhoto({
                botId: resolved.botId,
                token: resolved.token,
                chatId,
                photo,
                caption: String(params?.caption || ''),
                replyMarkup: params?.reply_markup,
                companyId: resolved.bot?.companyId || null
            });
            return res.json({ ok: true, result });
        }

        const sendFileLike = async (kind: 'document' | 'video' | 'audio' | 'voice' | 'animation' | 'sticker') => {
            if (!resolved.botId) return errorResponse(res, 400, 'Bot not registered');
            const chatId = String(params?.chat_id || params?.chatId || '');
            const file = String(params?.document || params?.video || params?.audio || params?.voice || params?.animation || params?.sticker || params?.file || '');
            if (!chatId || !file) {
                return errorResponse(res, 400, 'chat_id and file are required');
            }
            const common = {
                botId: resolved.botId,
                token: resolved.token,
                chatId,
                file,
                caption: params?.caption || '',
                replyMarkup: params?.reply_markup,
                companyId: resolved.bot?.companyId || null
            };
            switch (kind) {
                case 'document': return res.json({ ok: true, result: await telegramOutbox.sendDocument(common) });
                case 'video': return res.json({ ok: true, result: await telegramOutbox.sendVideo(common) });
                case 'audio': return res.json({ ok: true, result: await telegramOutbox.sendAudio(common) });
                case 'voice': return res.json({ ok: true, result: await telegramOutbox.sendVoice(common) });
                case 'animation': return res.json({ ok: true, result: await telegramOutbox.sendAnimation(common) });
                case 'sticker': return res.json({ ok: true, result: await telegramOutbox.sendSticker(common) });
            }
        };

        if (method === 'sendDocument') return await sendFileLike('document');
        if (method === 'sendVideo') return await sendFileLike('video');
        if (method === 'sendAudio') return await sendFileLike('audio');
        if (method === 'sendVoice') return await sendFileLike('voice');
        if (method === 'sendAnimation') return await sendFileLike('animation');
        if (method === 'sendSticker') return await sendFileLike('sticker');

        if (method === 'sendMediaGroup') {
            if (!resolved.botId) return errorResponse(res, 400, 'Bot not registered');
            const chatId = String(params?.chat_id || params?.chatId || '');
            const media = params?.media;
            if (!chatId || !Array.isArray(media)) {
                return errorResponse(res, 400, 'chat_id and media array are required');
            }
            const result = await telegramOutbox.sendMediaGroup({
                botId: resolved.botId,
                token: resolved.token,
                chatId,
                media,
                companyId: resolved.bot?.companyId || null
            });
            return res.json({ ok: true, result });
        }

        if (method === 'editMessageText') {
            if (!resolved.botId) return errorResponse(res, 400, 'Bot not registered');
            const chatId = String(params?.chat_id || params?.chatId || '');
            const messageId = Number(params?.message_id || params?.messageId);
            const text = String(params?.text || '');
            if (!chatId || !messageId || !text) {
                return errorResponse(res, 400, 'chat_id, message_id, and text are required');
            }
            const result = await telegramOutbox.editMessageText({
                botId: resolved.botId,
                token: resolved.token,
                chatId,
                messageId,
                text,
                replyMarkup: params?.reply_markup,
                companyId: resolved.bot?.companyId || null
            });
            return res.json({ ok: true, result });
        }

        if (method === 'sendChatAction') {
            if (!resolved.botId) return errorResponse(res, 400, 'Bot not registered');
            const chatId = String(params?.chat_id || params?.chatId || '');
            const action = String(params?.action || 'typing');
            if (!chatId) {
                return errorResponse(res, 400, 'chat_id is required');
            }
            const result = await telegramOutbox.sendChatAction({
                botId: resolved.botId,
                token: resolved.token,
                chatId,
                action,
                companyId: resolved.bot?.companyId || null
            });
            return res.json({ ok: true, result });
        }

        if (method === 'answerCallbackQuery') {
            const callbackId = String(params?.callback_query_id || params?.callbackId || '');
            if (!callbackId) {
                return errorResponse(res, 400, 'callback_query_id is required');
            }
            const result = await telegramOutbox.answerCallback({
                token: resolved.token,
                callbackId,
                text: params?.text
            });
            return res.json({ ok: true, result });
        }
        const result = await callTelegram(resolved.token, method, params || {});
        res.json({ ok: true, result });
    } catch (e: any) {
        logger.error('[Telegram Proxy] Error:', e.message || e);
        errorResponse(res, 500, e.message || 'Telegram proxy failed');
    }
});

// --- Telegram Messages (Inbox) ---
router.get('/messages', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
        const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : undefined;
        const botId = typeof req.query.botId === 'string' ? req.query.botId : undefined;

        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;

        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        if (botId && companyId && !isSuperadmin) {
            const bot = await prisma.botConfig.findUnique({ where: { id: botId }, select: { companyId: true } });
            if (!bot) return errorResponse(res, 404, 'Bot not found');
            if (bot.companyId !== companyId) return errorResponse(res, 403, 'Forbidden');
        }

        const rows = await prisma.botMessage.findMany({
            where: {
                ...(chatId ? { chatId } : {}),
                ...(botId ? { botId } : {}),
                ...(companyId ? { bot: { companyId } } : {})
            },
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        const messages = rows.map(row => {
            const payload: any = (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload))
                ? row.payload
                : {};
            const fromPayload = payload?.from || payload?.user || {};
            const chatPayload = payload?.chat || {};
            const fromName = fromPayload.first_name || fromPayload.username || (row.direction === 'OUTGOING' ? 'Bot' : 'User');

            const inlineKeyboard = Array.isArray(payload?.markup?.inline_keyboard) ? payload.markup.inline_keyboard : [];
            const flatButtons = Array.isArray(inlineKeyboard)
                ? (inlineKeyboard.flat ? inlineKeyboard.flat() : inlineKeyboard.reduce((acc: any[], row: any) => acc.concat(row || []), []))
                : [];

            return {
                id: row.id,
                botId: row.botId,
                messageId: row.messageId || 0,
                chatId: row.chatId,
                platform: 'TG',
                direction: row.direction,
                from: fromName,
                fromId: fromPayload.id ? String(fromPayload.id) : undefined,
                text: row.text,
                date: new Date(row.createdAt).toISOString(),
                status: 'NEW',
                buttons: flatButtons.map((b: any) => ({
                    text: b.text,
                    value: b.callback_data || b.url
                })),
                chatTitle: chatPayload.title
            };
        });

        res.json(messages);
    } catch (e: any) {
        logger.error('[Messages] Fetch error:', e.message || e);
        errorResponse(res, 500, 'Failed to fetch messages');
    }
});

// --- Platform Events (Telegram analytics) ---
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

// MessageLog timeline (Request-aware)
router.get('/messages/logs', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const requestId = typeof req.query.requestId === 'string' ? req.query.requestId : undefined;
        const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : undefined;
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const where: any = {};
        if (requestId) where.requestId = requestId;
        if (chatId) where.chatId = chatId;

        if (companyId) {
            const bots = await prisma.botConfig.findMany({
                where: { companyId },
                select: { id: true }
            });
            const botIds = bots.map(b => b.id);
            where.OR = [
                { request: { companyId } },
                ...(botIds.length ? [{ botId: { in: botIds } }] : [])
            ];
        }

        const logs = await prisma.messageLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit
        });
        // Attach basic meta (variant status)
        const variantIds = logs.map((l: any) => l.variantId).filter(Boolean) as string[];
        const variants = variantIds.length ? await prisma.requestVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, status: true } }) : [];
        const variantMap = new Map(variants.map(v => [v.id, v.status]));
        const enriched = logs.map((l: any) => ({
            ...l,
            variantStatus: l.variantId ? variantMap.get(l.variantId) : undefined
        }));

        res.json(enriched);
    } catch (e: any) {
        logger.error('[MessageLog] Fetch error:', e.message || e);
        errorResponse(res, 500, 'Failed to fetch message logs');
    }
});

router.post('/messages', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const payload = req.body || {};
        if (!payload.botId || !payload.chatId || !payload.text || !payload.direction) {
            return errorResponse(res, 400, 'botId, chatId, text, and direction are required');
        }
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const companyId = isSuperadmin ? (payload.companyId || userCompanyId) : userCompanyId;

        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const botId = String(payload.botId);
        const bot = await prisma.botConfig.findUnique({ where: { id: botId }, select: { companyId: true } });
        if (!bot) return errorResponse(res, 404, 'Bot not found');
        if (companyId && !isSuperadmin && bot.companyId !== companyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const direction = String(payload.direction || '').toUpperCase();
        if (direction !== 'INCOMING' && direction !== 'OUTGOING') {
            return errorResponse(res, 400, 'Invalid direction (use INCOMING or OUTGOING)');
        }

        await prisma.botMessage.create({
            data: {
                botId,
                chatId: String(payload.chatId),
                direction: direction as any,
                text: String(payload.text),
                messageId: payload.messageId !== undefined && payload.messageId !== null ? Number(payload.messageId) : null,
                payload: payload.payload || {}
            }
        });
        res.json({ success: true });
    } catch (e: any) {
        logger.error('[Messages] Insert error:', e.message || e);
        errorResponse(res, 500, 'Failed to store message');
    }
});

// --- Scenarios (Missing Routes Implemented) ---
router.get('/scenarios', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const scenarios = await prisma.scenario.findMany({
            where: (req as any).user?.companyId ? { companyId: (req as any).user.companyId } : {},
            orderBy: { updatedAt: 'desc' }
        });
        res.json(scenarios);
    } catch (e: any) {
        logger.error('[Scenarios] List error:', e);
        errorResponse(res, 500, 'Failed to list scenarios');
    }
});

router.post('/scenarios', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
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

        // Basic graph validation
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

        // Logic: upsert based on ID if it looks like a server ID (cuid) and exists?
        // But the frontend usually sends `id` which might be temporary `scn_...`.
        // If it sends a real ID, we update.

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
                    ...(existing ? { id: { not: existing.id } } : {})
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
                    companyId // Ensure ownership
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
                    companyId
                }
            });
            res.json(created);
        }
    } catch (e: any) {
        logger.error('[Scenarios] Save error:', e);
        errorResponse(res, 500, 'Failed to save scenario');
    }
});

router.delete('/scenarios/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
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

router.post('/messages/send', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { chatId, text, imageUrl, botId, keyboard } = req.body || {};
        if (!chatId || !text) {
            return errorResponse(res, 400, 'chatId and text are required');
        }
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const companyId = isSuperadmin ? ((req.body || {}).companyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const bot = botId
            ? await prisma.botConfig.findUnique({ where: { id: String(botId) } })
            : await prisma.botConfig.findFirst({
                where: {
                    isEnabled: true,
                    ...(companyId ? { companyId } : {})
                },
                orderBy: { createdAt: 'asc' }
            });

        if (!bot?.token) return errorResponse(res, 400, 'Bot token not found');
        if (companyId && !isSuperadmin && bot.companyId !== companyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const result = await integrationService.publishTelegramChannelPost({
            companyId: String(companyId || bot.companyId || ''),
            botToken: bot.token,
            botId: bot.id,
            destination: chatId,
            text,
            imageUrl,
            keyboard
        });

        res.json({ ok: true, result: result.result || result });
    } catch (e: any) {
        logger.error('[Messages] Send error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to send message');
    }
});

// --- Destinations (derived from messages + bot config) ---
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
            select: { chatId: true, payload: true },
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
                    verified: true
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
                    verified: true
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
                verified: true
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
                    verified: data.verified !== false
                });
            });
        }

        res.json(Array.from(destMap.values()));
    } catch (e: any) {
        logger.error('[Destinations] Error:', e.message || e);
        errorResponse(res, 500, 'Failed to fetch destinations');
    }
});

// --- HTML Proxy for Parsers ---
router.get('/proxy', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const target = req.query.url;
        if (!target || typeof target !== 'string') {
            return errorResponse(res, 400, 'url is required');
        }
        const parsed = new URL(target);
        const allowedHosts = new Set(['auto.ria.com', 'www.auto.ria.com', 'olx.ua', 'www.olx.ua']);
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

// --- Leads ---
// --- Leads ---
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

// --- Integrations & Drafts ---
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
        where.OR = companyId === 'company_system'
            ? [{ botId: { in: botIds } }, { botId: null }]
            : [{ botId: { in: botIds } }];
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
            if (!existing.botId && userCompanyId !== 'company_system') return errorResponse(res, 403, 'Forbidden');
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
            if (!existing.botId && userCompanyId !== 'company_system') return errorResponse(res, 403, 'Forbidden');
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

// --- Content Templates & Publication Jobs ---
router.get('/content/templates', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const where: any = {};
        if (companyId) where.OR = [{ companyId }, { companyId: null }];
        const templates = await prisma.template.findMany({ where, orderBy: { createdAt: 'desc' } });
        res.json(templates);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to list templates');
    }
});

router.post('/content/templates', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        if (!payload.name || !payload.body) return errorResponse(res, 400, 'name and body are required');

        const created = await prisma.template.create({
            data: {
                name: String(payload.name),
                body: String(payload.body),
                language: payload.language ?? null,
                status: payload.status || 'ACTIVE',
                companyId: companyId || null,
                variables: payload.variables ?? null
            }
        });
        res.json(created);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to create template');
    }
});

router.put('/content/templates/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const existing = await prisma.template.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Template not found');
        if (!isSuperadmin && userCompanyId && existing.companyId && existing.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const updated = await prisma.template.update({
            where: { id },
            data: {
                name: payload.name ?? undefined,
                body: payload.body ?? undefined,
                language: payload.language ?? undefined,
                status: payload.status ?? undefined,
                variables: payload.variables ?? undefined
            }
        });
        res.json(updated);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to update template');
    }
});

router.delete('/content/templates/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const existing = await prisma.template.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Template not found');
        if (!isSuperadmin && userCompanyId && existing.companyId && existing.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        await prisma.template.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to delete template');
    }
});

router.post('/content/templates/preview', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const result = await previewTemplate({
            templateId: payload.templateId,
            template: payload.template,
            companyId,
            carId: payload.carId,
            variables: payload.variables,
            lang: payload.lang
        });
        res.json(result);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, e.message || 'Failed to preview template');
    }
});

router.get('/content/publication-jobs', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const limit = Math.min(200, Number(req.query.limit) || 50);

        const where: any = {};
        if (companyId) where.companyId = companyId;
        if (status) where.status = status;

        const jobs = await prisma.publicationJob.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                template: true,
                results: { orderBy: { createdAt: 'desc' }, take: 1 }
            }
        });

        res.json(jobs);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to list publication jobs');
    }
});

router.post('/content/publication-jobs', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        if (!payload.destination) return errorResponse(res, 400, 'destination is required');

        const bot = payload.botId
            ? await prisma.botConfig.findUnique({ where: { id: String(payload.botId) } })
            : await prisma.botConfig.findFirst({
                where: {
                    isEnabled: true,
                    ...(companyId ? { companyId } : {})
                },
                orderBy: { createdAt: 'asc' }
            });

        if (!bot?.token) return errorResponse(res, 400, 'Bot token not found');
        if (companyId && !isSuperadmin && bot.companyId !== companyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const templateBody = await resolveTemplateBody(payload.templateId, payload.template, companyId || null);
        const car = payload.carId ? await prisma.carListing.findUnique({ where: { id: String(payload.carId) } }) : null;
        const variables = await buildTemplateVariables({
            carId: payload.carId,
            variables: payload.variables,
            lang: payload.lang
        });
        const text = renderTemplateBody(templateBody, variables);

        if (!text) return errorResponse(res, 400, 'Template rendered to empty text');

        const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
        const publishNow = payload.publishNow === true || !scheduledAt || scheduledAt <= new Date();

        const resolvedTitle = payload.title || car?.title || 'Untitled';
        const resolvedMediaUrl = payload.mediaUrl ?? payload.imageUrl ?? car?.thumbnail ?? null;

        const draft = payload.createDraft === false ? null : await prisma.draft.create({
            data: {
                source: 'MANUAL',
                title: resolvedTitle,
                description: text,
                url: resolvedMediaUrl,
                status: 'SCHEDULED',
                destination: payload.destination,
                botId: bot.id,
                scheduledAt: scheduledAt || new Date(),
                metadata: {
                    templateId: payload.templateId ?? null,
                    variables,
                    carId: payload.carId ?? null
                }
            }
        });

        const job = await prisma.publicationJob.create({
            data: {
                companyId: companyId || null,
                draftId: draft?.id,
                templateId: payload.templateId ?? null,
                botId: bot.id,
                title: resolvedTitle,
                text,
                mediaUrl: resolvedMediaUrl,
                destination: payload.destination,
                status: publishNow ? 'QUEUED' : 'SCHEDULED',
                scheduledAt: scheduledAt || new Date(),
                metadata: {
                    templateId: payload.templateId ?? null,
                    variables,
                    carId: payload.carId ?? null
                }
            }
        });

        if (publishNow) {
            try {
                const result = await integrationService.publishTelegramChannelPost({
                    companyId: String(companyId || bot.companyId || ''),
                    botToken: bot.token,
                    botId: bot.id,
                    destination: payload.destination,
                    text,
                    imageUrl: resolvedMediaUrl ?? undefined
                });
                const publishResult = result as any;
                const messageId = publishResult?.result?.message_id || publishResult?.message_id;
                const postedAt = new Date();

                await prisma.publicationJob.update({
                    where: { id: job.id },
                    data: { status: 'POSTED', postedAt }
                });

                await prisma.publicationResult.create({
                    data: {
                        jobId: job.id,
                        status: 'SUCCESS',
                        messageId: messageId ? Number(messageId) : null,
                        payload: publishResult
                    }
                });

                await logIntegrationEvent({
                    companyId: companyId || null,
                    integration: 'TELEGRAM_BOTAPI',
                    entityId: job.id,
                    action: 'publish_success',
                    status: 'OK',
                    meta: {
                        destination: payload.destination,
                        messageId: messageId ? Number(messageId) : undefined
                    }
                });

                if (draft) {
                    await prisma.draft.update({
                        where: { id: draft.id },
                        data: { status: 'POSTED', postedAt }
                    });
                }

                if (messageId) {
                    await prisma.channelPost.create({
                        data: {
                            draftId: draft?.id,
                            channelId: payload.destination,
                            messageId: Number(messageId),
                            botId: bot.id,
                            status: 'ACTIVE',
                            payload: publishResult
                        }
                    });
                }
            } catch (e: any) {
                await prisma.publicationJob.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', lastError: e.message }
                });
                await prisma.publicationResult.create({
                    data: { jobId: job.id, status: 'FAILED', error: e.message }
                });
                await logIntegrationEvent({
                    companyId: companyId || null,
                    integration: 'TELEGRAM_BOTAPI',
                    entityId: job.id,
                    action: 'publish_failed',
                    status: 'ERROR',
                    message: e.message || 'Publish failed',
                    meta: {
                        destination: payload.destination
                    }
                });
                if (draft) {
                    await prisma.draft.update({
                        where: { id: draft.id },
                        data: { status: 'FAILED', metadata: { error: e.message, failedAt: new Date().toISOString() } }
                    });
                }
            }
        }

        const finalJob = await prisma.publicationJob.findUnique({
            where: { id: job.id },
            include: { template: true, results: { orderBy: { createdAt: 'desc' }, take: 1 } }
        });

        res.json(finalJob);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, e.message || 'Failed to create publication job');
    }
});

router.post('/content/publication-jobs/:id/retry', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const job = await prisma.publicationJob.findUnique({ where: { id } });
        if (!job) return errorResponse(res, 404, 'Publication job not found');
        if (!isSuperadmin && userCompanyId && job.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');

        const updated = await prisma.publicationJob.update({
            where: { id },
            data: { status: 'SCHEDULED', lastError: null, scheduledAt: new Date() }
        });
        res.json(updated);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to retry publication job');
    }
});

router.get('/content/publication-jobs/:id/results', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const job = await prisma.publicationJob.findUnique({ where: { id } });
        if (!job) return errorResponse(res, 404, 'Publication job not found');
        if (!isSuperadmin && userCompanyId && job.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');

        const results = await prisma.publicationResult.findMany({
            where: { jobId: id },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(results);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to list publication results');
    }
});

router.delete('/content/publication-jobs/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const job = await prisma.publicationJob.findUnique({ where: { id } });
        if (!job) return errorResponse(res, 404, 'Publication job not found');
        if (!isSuperadmin && userCompanyId && job.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');

        await prisma.publicationJob.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to delete publication job');
    }
});

// --- Leads CRUD ---
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
    } catch (e) { logger.error(e); errorResponse(res, 500, 'Failed to create lead'); }
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
    } catch (e) { logger.error(e); errorResponse(res, 500, 'Failed to update lead'); }
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
    } catch (e) { errorResponse(res, 500, 'Failed to delete lead'); }
});


router.get('/settings', requireRole(['ADMIN']), async (req, res) => {
    const settings = await prisma.systemSettings.findFirst();
    res.json(settings || {});
});

router.post('/settings', requireRole(['ADMIN']), async (req, res) => { // Updated to POST for saveSettings
    const { id, ...data } = req.body;
    const count = await prisma.systemSettings.count();
    if (count === 0) {
        await prisma.systemSettings.create({ data });
    } else {
        const first = await prisma.systemSettings.findFirst();
        await prisma.systemSettings.update({ where: { id: first!.id }, data });
    }
    res.json({ success: true });
});

// --- Users (Relational) ---
router.get('/users', requireRole(['ADMIN']), async (req, res) => {
    // Use read abstraction
    const users = await getAllUsers();
    res.json(users);
});

import { writeService } from '../services/v41/writeService.js';

router.post('/users', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id, password, ...data } = req.body;
        // Assume companyId is passed or we need to derive it?
        // Legacy 'User' table had companyId. v4.1 user creation needs it.
        // If data.companyId is missing, we might fail or need a fallback.
        // Assuming payload has companyId or we find a way.

        if (!data.companyId && !data.workspaceId) {
            logger.info("Warning: creating user without companyId in API route");
        }

        const pwd = password || '123456';
        const hashedPassword = await bcrypt.hash(pwd, 10);

        const created = await writeService.createUserDual({
            email: data.email,
            passwordHash: hashedPassword,
            name: data.name,
            role: data.role,
            companyId: data.companyId || data.workspaceId // Support both
        });
        res.json(created);
    } catch (e) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to create user');
    }
});

router.put('/users/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id: _, password, ...data } = req.body;
        const { id } = req.params;

        // Update GlobalUser
        const globalUpdates: any = {};
        if (data.email) globalUpdates.email = data.email;
        if (password) globalUpdates.password_hash = await bcrypt.hash(password, 10);
        if (data.isActive !== undefined) globalUpdates.global_status = data.isActive ? 'active' : 'inactive';

        if (Object.keys(globalUpdates).length > 0) {
            await prisma.globalUser.update({ where: { id }, data: globalUpdates });
        }

        // Update Membership (if data present and we can find relevant membership)
        // If we don't know the workspace, we might update ALL memberships? Or just skip.
        // For simple dashboard logic, let's assume we update global user and primary details.
        // But role is membership specific.

        if (data.role || data.name) {
            // Finding all active memberships?
            // Or just ignoring role update here? 
            // In strict multi-tenant, updating role via global endpoint is ambiguous.
            // We'll skip membership update here unless companyId provided.
        }

        res.json({ success: true });
    } catch (e) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to update user');
    }
});

router.delete('/users/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        // Soft-delete GlobalUser?
        await prisma.globalUser.update({
            where: { id },
            data: {
                deleted_at: new Date(),
                global_status: 'archived'
            }
        });
        res.json({ success: true });
    } catch (e) { errorResponse(res, 500, 'Failed to delete user'); }
});

router.get('/logs', requireRole(['ADMIN']), async (req, res) => {
    const logs = await prisma.systemLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(logs);
});

export default router;
