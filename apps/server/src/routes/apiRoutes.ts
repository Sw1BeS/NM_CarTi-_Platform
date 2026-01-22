
import { Router, Request, Response } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import bcrypt from 'bcryptjs';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getWorkspaceById, getWorkspaceBySlug, getAllUsers } from '../services/v41/readService.js';
import { botManager } from '../modules/Communication/bots/bot.service.js';
import { searchAutoRia } from '../modules/Integrations/autoria.service.js';
import { sendMetaEvent } from '../modules/Integrations/meta.service.js';
import { importDraft } from '../modules/Inventory/inventory/inventory.service.js';
import { mapLeadCreateInput, mapLeadOutput, mapLeadStatusFilter, mapLeadUpdateInput } from '../services/dto.js';
import { mapBotInput, mapBotOutput } from '../modules/Communication/bots/botDto.js';
import { IntegrationService } from '../modules/Integrations/integration.service.js';
import { setWebhookForBot, deleteWebhookForBot } from '../modules/Communication/telegram/core/telegramAdmin.service.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';
import { whatsAppRouter } from '../modules/Integrations/whatsapp/whatsapp.service.js';
import { viberRouter } from '../modules/Integrations/viber/viber.service.js';
import { LeadRepository } from '../repositories/lead.repository.js';

const integrationService = new IntegrationService();
const leadRepository = new LeadRepository(prisma);

const router = Router();

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

    console.warn('[API] System workspace not found, falling back to ID literal "company_system"');
    return 'company_system';
};

// --- Bot Management (CRUD) ---
router.get('/bots', async (req, res) => {
    const bots = await prisma.botConfig.findMany({ orderBy: { id: 'asc' } });
    res.json(bots.map(mapBotOutput));
});

router.post('/bots', async (req, res) => {
    const { data } = mapBotInput(req.body || {});
    if (!data.token) return res.status(400).json({ error: 'Token is required' });

    // Sanitize optional fields: Convert empty strings to null
    const cleanChannelId = data.channelId && String(data.channelId).trim() !== '' ? String(data.channelId).trim() : null;
    const cleanAdminChatId = data.adminChatId && String(data.adminChatId).trim() !== '' ? String(data.adminChatId).trim() : null;

    try {
        const companyId = await resolveCompanyId(data.companyId, (req as any).user?.companyId || null);
        const newBot = await prisma.botConfig.create({
            data: {
                ...data,
                companyId,
                token: data.token.trim(),
                channelId: cleanChannelId,
                adminChatId: cleanAdminChatId,
                isEnabled: data.isEnabled ?? true
            }
        });

        // Fire and forget restart to avoid blocking the UI response
        botManager.restartBot(newBot.id).catch(e => console.error("Async Bot Restart Failed:", e));

        res.json(mapBotOutput(newBot));
    } catch (e) {
        console.error("Create Bot Error:", e);
        res.status(500).json({ error: "Failed to create bot. Token might be duplicate or invalid." });
    }
});

router.put('/bots/:id', async (req, res) => {
    const { id } = req.params;
    const existing = await prisma.botConfig.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Bot not found' });
    const { data } = mapBotInput(req.body || {}, existing.config);
    if ('token' in data && !data.token) return res.status(400).json({ error: 'Token is required' });

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
        botManager.restartBot(id).catch(e => console.error("Async Bot Update Failed:", e));

        res.json(mapBotOutput(updated));
    } catch (e) {
        console.error("Update Bot Error:", e);
        res.status(500).json({ error: 'Failed to update bot' });
    }
});

router.post('/bots/:id/webhook', async (req, res) => {
    try {
        const { id } = req.params;
        const { publicBaseUrl, secretToken } = req.body || {};
        const result = await setWebhookForBot(id, { publicBaseUrl, secretToken });
        botManager.restartBot(id).catch(e => console.error('Async Bot Restart Failed:', e));
        res.json({ ok: true, ...result });
    } catch (e: any) {
        console.error('[Webhook] Set error:', e.message || e);
        res.status(500).json({ error: e.message || 'Failed to set webhook' });
    }
});

router.delete('/bots/:id/webhook', async (req, res) => {
    try {
        const { id } = req.params;
        await deleteWebhookForBot(id);
        botManager.restartBot(id).catch(e => console.error('Async Bot Restart Failed:', e));
        res.json({ ok: true });
    } catch (e: any) {
        console.error('[Webhook] Delete error:', e.message || e);
        res.status(500).json({ error: e.message || 'Failed to delete webhook' });
    }
});

router.delete('/bots/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.botConfig.delete({ where: { id } });
        await botManager.stopAll();
        botManager.startAll().catch(e => console.error("Async Bot Restart All Failed:", e));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete bot' }); }
});

const TELEGRAM_METHODS = new Set([
    'getMe',
    'sendMessage',
    'sendPhoto',
    'sendMediaGroup',
    'editMessageText',
    'sendChatAction',
    'answerCallbackQuery',
    'setMyCommands',
    'setChatMenuButton',
    'getFile',
    'getUpdates'
]);

const resolveBot = async (token?: string, botId?: string) => {
    if (botId) {
        const bot = await prisma.botConfig.findUnique({ where: { id: botId } });
        return bot?.token ? { token: bot.token, botId: bot.id, bot } : null;
    }
    if (token) {
        const bot = await prisma.botConfig.findFirst({ where: { token } });
        return { token, botId: bot?.id, bot: bot || null };
    }
    const bot = await prisma.botConfig.findFirst({ where: { isEnabled: true } });
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
            return res.status(400).json({ error: 'Unsupported Telegram method' });
        }
        const resolved = await resolveBot(token, botId);
        if (!resolved?.token) {
            return res.status(400).json({ error: 'Bot token not found' });
        }
        const userRole = (req as any).user?.role;
        const companyId = (req as any).user?.companyId;
        if (resolved.bot?.companyId && companyId && resolved.bot.companyId !== companyId && userRole !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (method === 'sendMessage') {
            if (!resolved.botId) return res.status(400).json({ error: 'Bot not registered' });
            const chatId = String(params?.chat_id || params?.chatId || '');
            const text = String(params?.text || '');
            if (!chatId || !text) {
                return res.status(400).json({ error: 'chat_id and text are required' });
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
            if (!resolved.botId) return res.status(400).json({ error: 'Bot not registered' });
            const chatId = String(params?.chat_id || params?.chatId || '');
            const photo = String(params?.photo || '');
            if (!chatId || !photo) {
                return res.status(400).json({ error: 'chat_id and photo are required' });
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

        if (method === 'sendMediaGroup') {
            if (!resolved.botId) return res.status(400).json({ error: 'Bot not registered' });
            const chatId = String(params?.chat_id || params?.chatId || '');
            const media = params?.media;
            if (!chatId || !Array.isArray(media)) {
                return res.status(400).json({ error: 'chat_id and media array are required' });
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
            if (!resolved.botId) return res.status(400).json({ error: 'Bot not registered' });
            const chatId = String(params?.chat_id || params?.chatId || '');
            const messageId = Number(params?.message_id || params?.messageId);
            const text = String(params?.text || '');
            if (!chatId || !messageId || !text) {
                return res.status(400).json({ error: 'chat_id, message_id, and text are required' });
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
            if (!resolved.botId) return res.status(400).json({ error: 'Bot not registered' });
            const chatId = String(params?.chat_id || params?.chatId || '');
            const action = String(params?.action || 'typing');
            if (!chatId) {
                return res.status(400).json({ error: 'chat_id is required' });
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
                return res.status(400).json({ error: 'callback_query_id is required' });
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
        console.error('[Telegram Proxy] Error:', e.message || e);
        res.status(500).json({ error: e.message || 'Telegram proxy failed' });
    }
});

// --- Telegram Messages (Inbox) ---
router.get('/messages', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
        const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : undefined;
        const botId = typeof req.query.botId === 'string' ? req.query.botId : undefined;

        const conditions = [];
        if (chatId) conditions.push(Prisma.sql`"chatId" = ${chatId}`);
        if (botId) conditions.push(Prisma.sql`"botId" = ${botId}`);

        const whereClause = conditions.length
            ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
            : Prisma.sql``;

        const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT "id", "botId", "chatId", "direction", "text", "messageId", "payload", "createdAt"
            FROM "BotMessage"
            ${whereClause}
            ORDER BY "createdAt" DESC
            LIMIT ${limit}
        `);

        const messages = rows.map(row => {
            const payload = row.payload || {};
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
        console.error('[Messages] Fetch error:', e.message || e);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// --- Platform Events (Telegram analytics) ---
router.get('/events', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const companyId = (req as any).user?.companyId;
        if (!companyId) return res.status(400).json({ error: 'Company context required' });

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
        console.error('[Events] Fetch error:', e.message || e);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// MessageLog timeline (Request-aware)
router.get('/messages/logs', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const requestId = typeof req.query.requestId === 'string' ? req.query.requestId : undefined;
        const chatId = typeof req.query.chatId === 'string' ? req.query.chatId : undefined;
        const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));

        const where: any = {};
        if (requestId) where.requestId = requestId;
        if (chatId) where.chatId = chatId;

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
        console.error('[MessageLog] Fetch error:', e.message || e);
        res.status(500).json({ error: 'Failed to fetch message logs' });
    }
});

router.post('/messages', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const payload = req.body || {};
        if (!payload.chatId || !payload.text || !payload.direction) {
            return res.status(400).json({ error: 'chatId, text, and direction are required' });
        }
        const botId = payload.botId || '';
        await prisma.$executeRaw`
            INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
            VALUES (
                gen_random_uuid()::text,
                ${String(botId)},
                ${String(payload.chatId)},
                ${String(payload.direction)},
                ${String(payload.text)},
                ${payload.messageId ?? null},
                ${JSON.stringify(payload.payload || {})}::jsonb,
                NOW()
            )
        `;
        res.json({ success: true });
    } catch (e: any) {
        console.error('[Messages] Insert error:', e.message || e);
        res.status(500).json({ error: 'Failed to store message' });
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
        console.error('[Scenarios] List error:', e);
        res.status(500).json({ error: 'Failed to list scenarios' });
    }
});

router.post('/scenarios', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id, _recordId, ...data } = req.body || {};
        const companyId = (req as any).user?.companyId;

        if (!companyId) return res.status(400).json({ error: 'Company context required' });
        if (!data.name) return res.status(400).json({ error: 'Name is required' });
        if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
            return res.status(400).json({ error: 'Scenario must contain at least one node' });
        }
        if (!data.entryNodeId) {
            return res.status(400).json({ error: 'Entry node is required' });
        }

        // Basic graph validation
        const ids = new Set((data.nodes || []).map((n: any) => n.id));
        if (!ids.has(data.entryNodeId)) {
            return res.status(400).json({ error: 'Entry node does not exist in nodes list' });
        }
        for (const n of data.nodes) {
            if (!n.id) return res.status(400).json({ error: 'Each node must have an id' });
            const refs: string[] = [];
            if (n.nextNodeId) refs.push(n.nextNodeId);
            if (n.content?.trueNodeId) refs.push(n.content.trueNodeId);
            if (n.content?.falseNodeId) refs.push(n.content.falseNodeId);
            if (Array.isArray(n.content?.choices)) {
                n.content.choices.forEach((c: any) => c.nextNodeId && refs.push(c.nextNodeId));
            }
            for (const r of refs) {
                if (r && !ids.has(r)) {
                    return res.status(400).json({ error: `Broken link from ${n.id} to ${r}` });
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
                return res.status(409).json({ error: 'Trigger command already used by another published scenario' });
            }
        }

        if (existing) {
            if (existing.companyId !== companyId) {
                return res.status(403).json({ error: 'Forbidden' });
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
        console.error('[Scenarios] Save error:', e);
        res.status(500).json({ error: 'Failed to save scenario' });
    }
});

router.delete('/scenarios/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const companyId = (req as any).user?.companyId;
        if (!companyId) return res.status(400).json({ error: 'Company context required' });
        const deleted = await prisma.scenario.deleteMany({ where: { id, companyId } });
        if (!deleted.count) return res.status(404).json({ error: 'Scenario not found' });
        res.json({ success: true });
    } catch (e: any) {
        console.error('[Scenarios] Delete error:', e);
        res.status(500).json({ error: 'Failed to delete scenario' });
    }
});

router.post('/messages/send', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { chatId, text, imageUrl, botId, keyboard } = req.body || {};
        if (!chatId || !text) {
            return res.status(400).json({ error: 'chatId and text are required' });
        }
        const resolved = await resolveBot(undefined, botId);
        if (!resolved?.token) {
            return res.status(400).json({ error: 'Bot token not found' });
        }

        const result = await integrationService.publishTelegramChannelPost({
            companyId: (req as any).user?.companyId || '', // Fallback or strict? Ideally from user ctx
            botToken: resolved.token,
            botId: resolved.botId,
            destination: chatId,
            text,
            imageUrl,
            keyboard
        });

        res.json({ ok: true, result: result.result || result });
    } catch (e: any) {
        console.error('[Messages] Send error:', e.message || e);
        res.status(500).json({ error: e.message || 'Failed to send message' });
    }
});

// --- Destinations (derived from messages + bot config) ---
router.get('/destinations', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (_req, res) => {
    try {
        const bots = await prisma.botConfig.findMany({ where: { isEnabled: true } });
        const rows = await prisma.$queryRaw<any[]>`
            SELECT "chatId", "payload"
            FROM "BotMessage"
            ORDER BY "createdAt" DESC
            LIMIT 500
        `;

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
            const payload = row.payload || {};
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
        console.error('[Destinations] Error:', e.message || e);
        res.status(500).json({ error: 'Failed to fetch destinations' });
    }
});

// --- HTML Proxy for Parsers ---
router.get('/proxy', requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const target = req.query.url;
        if (!target || typeof target !== 'string') {
            return res.status(400).json({ error: 'url is required' });
        }
        const parsed = new URL(target);
        const allowedHosts = new Set(['auto.ria.com', 'www.auto.ria.com', 'olx.ua', 'www.olx.ua']);
        if (!allowedHosts.has(parsed.hostname)) {
            return res.status(400).json({ error: 'Host not allowed' });
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
        console.error('[Proxy] Error:', e.message || e);
        res.status(500).json({ error: 'Failed to fetch target URL' });
    }
});

// --- Leads ---
// --- Leads ---
router.get('/leads', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const status = req.query.status as string;
    const source = req.query.source as string;
    const search = req.query.search as string;

    const where: any = {};
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
router.post('/drafts/import', async (req, res) => {
    const success = await importDraft(req.body);
    res.json({ success });
});

router.get('/drafts', async (req, res) => {
    const drafts = await prisma.draft.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(drafts);
});

router.post('/drafts', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const payload = req.body || {};
        const draft = await prisma.draft.create({
            data: {
                source: payload.source || 'MANUAL',
                title: payload.title || 'Untitled',
                price: payload.price ?? null,
                url: payload.url ?? payload.imageUrl ?? null,
                description: payload.description ?? payload.text ?? null,
                status: payload.status || 'DRAFT',
                destination: payload.destination ?? null,
                botId: payload.botId ?? null,
                scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
                postedAt: payload.postedAt ? new Date(payload.postedAt) : null,
                metadata: payload.metadata ?? null
            }
        });
        res.json(draft);
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create draft' });
    }
});

router.put('/drafts/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const payload = req.body || {};
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
        console.error(e);
        res.status(500).json({ error: 'Failed to update draft' });
    }
});

router.delete('/drafts/:id', requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma.draft.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to delete draft' });
    }
});

// --- Leads CRUD ---
router.post('/leads', async (req, res) => {
    try {
        const { id, ...raw } = req.body || {};
        const mapped = mapLeadCreateInput(raw);
        if (mapped.error) return res.status(400).json({ error: mapped.error });

        // Use repository for Dual Write
        const lead = await leadRepository.createLead(mapped.data);
        res.json(mapLeadOutput(lead));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create lead' }); }
});

router.put('/leads/:id', async (req, res) => {
    try {
        const { id: _, ...raw } = req.body || {};
        const { id } = req.params;
        const existing = await prisma.lead.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Lead not found' });

        const mapped = mapLeadUpdateInput(raw, existing.payload);

        // Use repository for Dual Write
        const lead = await leadRepository.updateLead(id, mapped.data);
        res.json(mapLeadOutput(lead));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update lead' }); }
});

router.delete('/leads/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.lead.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete lead' }); }
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
            console.log("Warning: creating user without companyId in API route");
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
        console.error(e);
        res.status(500).json({ error: 'Failed to create user' });
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
        console.error(e);
        res.status(500).json({ error: 'Failed to update user' });
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
    } catch (e) { res.status(500).json({ error: 'Failed to delete user' }); }
});

router.get('/logs', requireRole(['ADMIN']), async (req, res) => {
    const logs = await prisma.systemLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(logs);
});

export default router;
