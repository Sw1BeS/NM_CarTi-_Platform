import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { IntegrationService } from '../modules/Integrations/integration.service.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();
const integrationService = new IntegrationService();

const pickLargestPhoto = (photos: any[]): any | null => {
    if (!Array.isArray(photos) || photos.length === 0) return null;
    return photos.reduce((best, current) => {
        const bestSize = best?.file_size || 0;
        const currentSize = current?.file_size || 0;
        return currentSize > bestSize ? current : best;
    }, photos[0]);
};

const extractMediaFromMessage = (message?: any) => {
    if (!message || typeof message !== 'object') return null;

    if (Array.isArray(message.photo) && message.photo.length) {
        const best = pickLargestPhoto(message.photo);
        return {
            type: 'photo',
            fileId: best?.file_id,
            size: best?.file_size
        };
    }
    if (message.document) {
        return {
            type: 'document',
            fileId: message.document.file_id,
            fileName: message.document.file_name,
            mimeType: message.document.mime_type,
            size: message.document.file_size
        };
    }
    if (message.video) {
        return {
            type: 'video',
            fileId: message.video.file_id,
            fileName: message.video.file_name,
            mimeType: message.video.mime_type,
            size: message.video.file_size
        };
    }
    if (message.audio) {
        return {
            type: 'audio',
            fileId: message.audio.file_id,
            fileName: message.audio.file_name || message.audio.title,
            mimeType: message.audio.mime_type,
            size: message.audio.file_size
        };
    }
    if (message.voice) {
        return {
            type: 'voice',
            fileId: message.voice.file_id,
            mimeType: message.voice.mime_type,
            size: message.voice.file_size
        };
    }
    if (message.animation) {
        return {
            type: 'animation',
            fileId: message.animation.file_id,
            fileName: message.animation.file_name,
            mimeType: message.animation.mime_type,
            size: message.animation.file_size
        };
    }
    if (message.sticker) {
        return {
            type: 'sticker',
            fileId: message.sticker.file_id,
            mimeType: message.sticker.mime_type,
            size: message.sticker.file_size
        };
    }

    return null;
};

const extractMediaFromPayload = (payload?: any) => {
    if (!payload || typeof payload !== 'object') return null;
    const raw = payload.raw || {};
    const message = raw.message || raw.edited_message || raw.channel_post || raw?.callback_query?.message;
    const mediaFromMessage = extractMediaFromMessage(message);
    if (mediaFromMessage) return mediaFromMessage;

    const normalizeValue = (kind: string, value: any) => {
        if (!value) return null;
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return null;
            if (trimmed.startsWith('http')) {
                return { type: kind, url: trimmed };
            }
            return { type: kind, fileId: trimmed };
        }
        if (typeof value === 'object') {
            if (value.file_id) return { type: kind, fileId: value.file_id };
            if (value.url) return { type: kind, url: value.url };
        }
        return null;
    };

    return (
        normalizeValue('photo', payload.photo)
        || normalizeValue('document', payload.document)
        || normalizeValue('video', payload.video)
        || normalizeValue('audio', payload.audio)
        || normalizeValue('voice', payload.voice)
        || normalizeValue('animation', payload.animation)
        || normalizeValue('sticker', payload.sticker)
        || (Array.isArray(payload.media) && payload.media.length
            ? normalizeValue(payload.media[0]?.type || 'media', payload.media[0]?.media)
            : null)
    );
};

router.get('/messages', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
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
            const telegramUserId = fromPayload.id ? String(fromPayload.id) : undefined;
            const telegramUsername = fromPayload.username || undefined;
            const telegramName = [fromPayload.first_name, fromPayload.last_name].filter(Boolean).join(' ').trim() || undefined;

            const inlineKeyboard = Array.isArray(payload?.markup?.inline_keyboard) ? payload.markup.inline_keyboard : [];
            const flatButtons = Array.isArray(inlineKeyboard)
                ? (inlineKeyboard.flat ? inlineKeyboard.flat() : inlineKeyboard.reduce((acc: any[], row: any) => acc.concat(row || []), []))
                : [];

            const media = extractMediaFromPayload(payload);

            return {
                id: row.id,
                botId: row.botId,
                messageId: row.messageId || 0,
                chatId: row.chatId,
                platform: 'TG',
                direction: row.direction,
                from: fromName,
                fromId: telegramUserId,
                username: telegramUsername,
                firstName: fromPayload.first_name || undefined,
                lastName: fromPayload.last_name || undefined,
                telegramUserId,
                telegramUsername,
                telegramName,
                telegramChatId: row.chatId,
                text: row.text,
                date: new Date(row.createdAt).toISOString(),
                status: 'NEW',
                media,
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

router.get('/messages/logs', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
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

router.post('/messages/logs', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const payload = req.body || {};
        const chatId = typeof payload.chatId === 'string' ? payload.chatId : undefined;
        if (!chatId) return errorResponse(res, 400, 'chatId is required');

        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const companyId = isSuperadmin ? (payload.companyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        if (payload.botId && companyId) {
            const bot = await prisma.botConfig.findUnique({ where: { id: String(payload.botId) }, select: { companyId: true } });
            if (!bot) return errorResponse(res, 404, 'Bot not found');
            if (!isSuperadmin && bot.companyId !== companyId) return errorResponse(res, 403, 'Forbidden');
        }

        if (payload.requestId && companyId) {
            const reqRow = await prisma.b2bRequest.findUnique({ where: { id: String(payload.requestId) }, select: { companyId: true } });
            if (reqRow?.companyId && !isSuperadmin && reqRow.companyId !== companyId) return errorResponse(res, 403, 'Forbidden');
        }

        const direction = String(payload.direction || 'OUTGOING').toUpperCase();
        if (!['INCOMING', 'OUTGOING'].includes(direction)) {
            return errorResponse(res, 400, 'Invalid direction');
        }

        const created = await prisma.messageLog.create({
            data: {
                requestId: payload.requestId ? String(payload.requestId) : null,
                variantId: payload.variantId ? String(payload.variantId) : null,
                botId: payload.botId ? String(payload.botId) : null,
                chatId: String(chatId),
                direction,
                text: payload.text ? String(payload.text) : null,
                payload: payload.payload ?? null
            }
        });

        res.json(created);
    } catch (e: any) {
        logger.error('[MessageLog] Create error:', e.message || e);
        errorResponse(res, 500, 'Failed to create message log');
    }
});

router.post('/messages', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
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

router.get('/inbox/macros', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const macros = await prisma.chatMacro.findMany({
            where: companyId ? { companyId } : {},
            orderBy: { updatedAt: 'desc' }
        });
        res.json(macros);
    } catch (e: any) {
        logger.error('[Inbox Macros] List error:', e.message || e);
        errorResponse(res, 500, 'Failed to list macros');
    }
});

router.post('/inbox/macros', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof (req.body || {}).companyId === 'string' ? (req.body || {}).companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const { shortcut, text, category, isActive } = req.body || {};
        if (!shortcut || !text) return errorResponse(res, 400, 'shortcut and text are required');

        const macro = await prisma.chatMacro.create({
            data: {
                companyId,
                shortcut: String(shortcut).trim(),
                text: String(text).trim(),
                category: category ? String(category).trim() : null,
                isActive: isActive !== undefined ? !!isActive : true
            }
        });
        res.json(macro);
    } catch (e: any) {
        logger.error('[Inbox Macros] Create error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to create macro');
    }
});

router.put('/inbox/macros/:id', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const existing = await prisma.chatMacro.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Macro not found');
        if (!isSuperadmin && existing.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const { shortcut, text, category, isActive } = req.body || {};
        const macro = await prisma.chatMacro.update({
            where: { id },
            data: {
                ...(shortcut !== undefined ? { shortcut: String(shortcut).trim() } : {}),
                ...(text !== undefined ? { text: String(text).trim() } : {}),
                ...(category !== undefined ? { category: category ? String(category).trim() : null } : {}),
                ...(isActive !== undefined ? { isActive: !!isActive } : {})
            }
        });
        res.json(macro);
    } catch (e: any) {
        logger.error('[Inbox Macros] Update error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to update macro');
    }
});

router.delete('/inbox/macros/:id', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const existing = await prisma.chatMacro.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Macro not found');
        if (!isSuperadmin && existing.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        await prisma.chatMacro.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        logger.error('[Inbox Macros] Delete error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to delete macro');
    }
});

router.get('/inbox/notes', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : undefined;
        if (chatId) {
            if (!companyId) return errorResponse(res, 400, 'Company context required');
            const note = await prisma.chatNote.findUnique({
                where: { companyId_chatId: { companyId: companyId as string, chatId } }
            });
            return res.json(note || null);
        }
        const notes = await prisma.chatNote.findMany({
            where: companyId ? { companyId } : {},
            orderBy: { updatedAt: 'desc' }
        });
        res.json(notes);
    } catch (e: any) {
        logger.error('[Inbox Notes] List error:', e.message || e);
        errorResponse(res, 500, 'Failed to list notes');
    }
});

router.post('/inbox/notes', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof (req.body || {}).companyId === 'string' ? (req.body || {}).companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const { chatId, text } = req.body || {};
        if (!chatId) return errorResponse(res, 400, 'chatId is required');

        const note = await prisma.chatNote.upsert({
            where: { companyId_chatId: { companyId, chatId: String(chatId) } },
            create: { companyId, chatId: String(chatId), text: text ? String(text) : null },
            update: { text: text ? String(text) : null }
        });
        res.json(note);
    } catch (e: any) {
        logger.error('[Inbox Notes] Save error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to save note');
    }
});

router.post('/messages/send', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
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

export default router;
