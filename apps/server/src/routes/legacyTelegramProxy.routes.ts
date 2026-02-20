import { Router } from 'express';
import axios from 'axios';
import { requireRole } from '../middleware/auth.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';
import { MediaLimitError, saveTelegramBotFile } from '../services/mediaStorage.service.js';
import { TELEGRAM_METHODS, callTelegram, resolveBot } from './legacyTelegramProxy.shared.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();

router.post('/telegram/call', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
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

router.get('/telegram/file', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const fileId = typeof req.query.fileId === 'string' ? req.query.fileId : '';
        const botId = typeof req.query.botId === 'string' ? req.query.botId : undefined;
        if (!fileId) return errorResponse(res, 400, 'fileId is required');

        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = isSuperadmin ? (typeof req.query.companyId === 'string' ? req.query.companyId : undefined) : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const resolved = await resolveBot(undefined, botId, companyId);
        if (!resolved?.token) {
            return errorResponse(res, 400, 'Bot token not found');
        }
        if (resolved.bot?.companyId && companyId && resolved.bot.companyId !== companyId && !isSuperadmin) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const fileInfo = await callTelegram(resolved.token, 'getFile', { file_id: fileId });
        const filePath = fileInfo?.file_path;
        if (!filePath) return errorResponse(res, 404, 'File not found');

        const fileUrl = `https://api.telegram.org/file/bot${resolved.token}/${filePath}`;
        const response = await axios.get(fileUrl, { responseType: 'stream', timeout: 20000 });
        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        response.data.pipe(res);
    } catch (e: any) {
        logger.error('[Telegram File] Error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to fetch Telegram file');
    }
});

router.post('/telegram/file/cache', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { fileId, botId, chatId, messageId, size } = req.body || {};
        if (!fileId || typeof fileId !== 'string') return errorResponse(res, 400, 'fileId is required');

        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = isSuperadmin
            ? (typeof (req.body || {}).companyId === 'string' ? (req.body || {}).companyId : undefined)
            : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const resolved = await resolveBot(undefined, botId, companyId);
        if (!resolved?.token) {
            return errorResponse(res, 400, 'Bot token not found');
        }
        if (resolved.bot?.companyId && companyId && resolved.bot.companyId !== companyId && !isSuperadmin) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const saved = await saveTelegramBotFile(resolved.token, fileId, {
            companyId: resolved.bot?.companyId || companyId || null,
            sourceChatId: chatId ? String(chatId) : undefined,
            sourceMessageId: messageId ? Number(messageId) : undefined,
            fileSize: typeof size === 'number' ? size : undefined
        });

        res.json({ ok: true, url: saved.url, fileId });
    } catch (e: any) {
        if (e instanceof MediaLimitError || e?.code === 'MEDIA_TOO_LARGE') {
            return errorResponse(res, 413, e.message || 'Media too large');
        }
        logger.error('[Telegram File Cache] Error:', e.message || e);
        errorResponse(res, 500, e.message || 'Failed to cache Telegram file');
    }
});

export default router;
