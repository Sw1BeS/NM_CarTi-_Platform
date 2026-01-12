
import { Router, Request, Response } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { botManager } from '../modules/bots/bot.service.js';
import { importDraft, searchAutoRia, sendMetaEvent } from '../services/integrationService.js';
import { mapLeadCreateInput, mapLeadOutput, mapLeadStatusFilter, mapLeadUpdateInput } from '../services/dto.js';
import { mapBotInput, mapBotOutput } from '../services/botDto.js';

const router = Router();

router.use(authenticateToken);

// --- Bot Management (CRUD) ---
router.get('/bots', requireRole(['ADMIN']), async (req, res) => {
    const bots = await prisma.botConfig.findMany({ orderBy: { id: 'asc' } });
    res.json(bots.map(mapBotOutput));
});

router.post('/bots', requireRole(['ADMIN']), async (req, res) => {
    const { data } = mapBotInput(req.body || {});
    if (!data.token) return res.status(400).json({ error: 'Token is required' });

    // Sanitize optional fields: Convert empty strings to null
    const cleanChannelId = data.channelId && String(data.channelId).trim() !== '' ? String(data.channelId).trim() : null;
    const cleanAdminChatId = data.adminChatId && String(data.adminChatId).trim() !== '' ? String(data.adminChatId).trim() : null;

    try {
        const newBot = await prisma.botConfig.create({
            data: {
                ...data,
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

router.put('/bots/:id', requireRole(['ADMIN']), async (req, res) => {
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

router.delete('/bots/:id', requireRole(['ADMIN']), async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.botConfig.delete({ where: { id } });
        await botManager.stopAll();
        botManager.startAll().catch(e => console.error("Async Bot Restart All Failed:", e));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete bot' }); }
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

// --- Leads CRUD ---
router.post('/leads', async (req, res) => {
    try {
        const { id, ...raw } = req.body || {};
        const mapped = mapLeadCreateInput(raw);
        if (mapped.error) return res.status(400).json({ error: mapped.error });
        const lead = await prisma.lead.create({ data: mapped.data });
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
        const lead = await prisma.lead.update({ where: { id }, data: mapped.data });
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
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(users);
});

router.post('/users', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id, password, ...data } = req.body;
        const hashedPassword = await bcrypt.hash(password || '123456', 10);
        const user = await prisma.user.create({ data: { ...data, password: hashedPassword } });
        res.json(user);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

router.put('/users/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id: _, password, ...data } = req.body;
        const { id } = req.params;
        const updateData: any = { ...data };
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }
        const user = await prisma.user.update({ where: { id }, data: updateData });
        res.json(user);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

router.delete('/users/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.user.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete user' }); }
});

router.get('/logs', requireRole(['ADMIN']), async (req, res) => {
    const logs = await prisma.systemLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(logs);
});

export default router;
