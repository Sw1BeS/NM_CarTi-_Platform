
import { Router } from 'express';
// @ts-ignore
import { prisma } from '../../services/prisma.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { generatePublicId, mapRequestInput, mapRequestOutput, mapVariantInput, mapVariantOutput, mapRequestStatusFilter } from '../../services/dto.js';
import { renderRequestCard, managerActionsKeyboard } from '../../services/cardRenderer.js';
import { TelegramSender } from '../../services/telegramSender.js';
import { generateRequestLink } from '../../utils/deeplink.utils.js';

const router = Router();

// --- B2B Requests CRUD ---
router.get('/', async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;

    const status = req.query.status as string;
    const search = req.query.search as string;

    const where: any = {};
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
        const [total, items] = await Promise.all([
            prisma.b2bRequest.count({ where }),
            prisma.b2bRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip,
                include: { variants: true } // Include nested variants
            })
        ]);

        res.json({
            items: items.map(mapRequestOutput),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch requests' });
    }
});

router.post('/', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id, variants, ...raw } = req.body;
        const createData: any = mapRequestInput(raw);
        if (!createData.title) {
            return res.status(400).json({ error: 'Title is required' });
        }
        if (!createData.publicId) createData.publicId = generatePublicId();

        // Handle nested creation provided via `variants` array
        if (variants && Array.isArray(variants)) {
            createData.variants = {
                create: variants.map((v: any) => mapVariantInput(v))
            };
        }

        const request = await prisma.b2bRequest.create({
            data: createData,
            include: { variants: true }
        });
        res.json(mapRequestOutput(request));
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create request' });
    }
});

router.put('/:id', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id: _id, variants, ...raw } = req.body;
        const { id } = req.params;

        // Update main request
        const data = mapRequestInput(raw);
        const request = await prisma.b2bRequest.update({
            where: { id },
            data,
            include: { variants: true }
        });

        // Sync Variants logic would go here if we want to full-sync, 
        // but typically variants are managed via specific endpoint or separate calls.

        res.json(mapRequestOutput(request));
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update request' });
    }
});

router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.b2bRequest.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: 'Failed to delete request' }); }
});

// --- Variant Management Sub-Routes ---
router.post('/:id/variants', authenticateToken, requireRole(['ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    const { id } = req.params;
    const variantData = mapVariantInput(req.body || {});
    try {
        const variant = await prisma.requestVariant.create({
            data: {
                ...variantData,
                requestId: id
            }
        });
        res.json(mapVariantOutput(variant));
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to add variant' });
    }
});

// --- Channel publish/update/close ---
const resolveBot = async (botId?: string) => {
    if (botId) {
        const bot = await prisma.botConfig.findUnique({ where: { id: botId } });
        if (bot?.token) return bot;
    }
    return prisma.botConfig.findFirst({ where: { isEnabled: true } });
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
        const request = await prisma.b2bRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ error: 'Request not found' });
        const bot = await resolveBot(botId);
        if (!bot?.token) return res.status(400).json({ error: 'Bot not found' });
        const destination = channelId || bot.channelId;
        if (!destination) return res.status(400).json({ error: 'ChannelId required' });

        const reqCard = buildChannelText(request, template);
        const botUsername = bot.config ? (bot.config as any).username : undefined;
        const dl = botUsername && (request.publicId || request.id)
            ? generateRequestLink(botUsername, request.publicId || request.id)
            : undefined;
        const keyboard = dl ? { inline_keyboard: [[{ text: '🚗 Є авто', url: dl }]] } : undefined;

        const sent = await TelegramSender.sendMessage(bot.token, destination, text || reqCard, keyboard);
        const messageId = (sent as any)?.message_id;

        const channelPost = await prisma.channelPost.create({
            data: {
                requestId: id,
                botId: bot.id,
                channelId: destination,
                messageId,
                status: 'ACTIVE',
                payload: { text: text || reqCard }
            }
        });

        await prisma.messageLog.create({
            data: {
                requestId: id,
                botId: bot.id,
                chatId: destination,
                direction: 'OUTGOING',
                text: text || reqCard,
                payload: { type: 'CHANNEL_PUBLISH', messageId }
            }
        }).catch((e) => {
            console.error('[CHANNEL_PUBLISH] MessageLog failed:', e.message || e);
        });

        res.json({ ok: true, channelPost });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to publish' });
    }
});

router.put('/:id/channel-post', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { text, channelId } = req.body || {};
        const cp = await prisma.channelPost.findFirst({ where: { requestId: id, ...(channelId ? { channelId } : {}) } });
        if (!cp) return res.status(404).json({ error: 'ChannelPost not found' });
        const bot = await resolveBot(cp.botId || undefined);
        if (!bot?.token) return res.status(400).json({ error: 'Bot not found' });
        const payload = (cp.payload as any) || {};
        const nextText = text || payload.text || 'Updated';
        await TelegramSender.editMessageText(bot.token, cp.channelId, cp.messageId, nextText);
        const updated = await prisma.channelPost.update({
            where: { id: cp.id },
            data: { status: 'UPDATED', payload: { ...(payload || {}), text: nextText } }
        });
        await prisma.messageLog.create({
            data: {
                requestId: id,
                botId: bot.id,
                chatId: cp.channelId,
                direction: 'OUTGOING',
                text: nextText,
                payload: { type: 'CHANNEL_UPDATE', messageId: cp.messageId }
            }
        }).catch((e) => {
            console.error('[CHANNEL_UPDATE] MessageLog failed:', e.message || e);
        });
        res.json({ ok: true, channelPost: updated });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update post' });
    }
});

router.post('/:id/close-channel', authenticateToken, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const { channelId } = req.body || {};
        const cp = await prisma.channelPost.findFirst({ where: { requestId: id, ...(channelId ? { channelId } : {}) } });
        if (!cp) return res.status(404).json({ error: 'ChannelPost not found' });
        const bot = await resolveBot(cp.botId || undefined);
        if (!bot?.token) return res.status(400).json({ error: 'Bot not found' });
        const payload = (cp.payload as any) || {};
        const closedText = `${payload.text || ''}\n\n🚫 Запит закрито`;
        await TelegramSender.editMessageText(bot.token, cp.channelId, cp.messageId, closedText, { inline_keyboard: [] });
        const updated = await prisma.channelPost.update({
            where: { id: cp.id },
            data: { status: 'CLOSED', payload: { ...(payload || {}), closed: true, text: closedText } }
        });
        await prisma.messageLog.create({
            data: {
                requestId: id,
                botId: bot.id,
                chatId: cp.channelId,
                direction: 'OUTGOING',
                text: closedText,
                payload: { type: 'CHANNEL_CLOSE', messageId: cp.messageId }
            }
        }).catch((e) => {
            console.error('[CHANNEL_CLOSE] MessageLog failed:', e.message || e);
        });
        res.json({ ok: true, channelPost: updated });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ error: 'Failed to close post' });
    }
});

export default router;
