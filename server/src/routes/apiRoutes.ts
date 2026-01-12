
import { Router, Request, Response } from 'express';
// @ts-ignore
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { botManager } from '../services/botService.js';
import { importDraft, searchAutoRia, sendMetaEvent } from '../services/integrationService.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

// --- Bot Management (CRUD) ---
router.get('/bots', requireRole(['ADMIN']), async (req, res) => {
    const bots = await prisma.botConfig.findMany({ orderBy: { id: 'asc' } });
    res.json(bots);
});

router.post('/bots', requireRole(['ADMIN']), async (req, res) => {
    const { name, template, token, channelId, adminChatId, isEnabled } = req.body;

    // Sanitize optional fields: Convert empty strings to null
    const cleanChannelId = channelId && channelId.trim() !== '' ? channelId.trim() : null;
    const cleanAdminChatId = adminChatId && adminChatId.trim() !== '' ? adminChatId.trim() : null;

    try {
        const newBot = await prisma.botConfig.create({
            data: {
                name,
                template,
                token: token.trim(),
                channelId: cleanChannelId,
                adminChatId: cleanAdminChatId,
                isEnabled: isEnabled ?? true
            }
        });

        // Fire and forget restart to avoid blocking the UI response
        botManager.restartBot(newBot.id).catch(e => console.error("Async Bot Restart Failed:", e));

        res.json(newBot);
    } catch (e) {
        console.error("Create Bot Error:", e);
        res.status(500).json({ error: "Failed to create bot. Token might be duplicate or invalid." });
    }
});

router.put('/bots/:id', requireRole(['ADMIN']), async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, template, token, channelId, adminChatId, isEnabled } = req.body;

    // Sanitize optional fields
    const cleanChannelId = channelId && channelId.trim() !== '' ? channelId.trim() : null;
    const cleanAdminChatId = adminChatId && adminChatId.trim() !== '' ? adminChatId.trim() : null;

    try {
        const updated = await prisma.botConfig.update({
            where: { id },
            data: {
                name,
                template,
                token: token.trim(),
                channelId: cleanChannelId,
                adminChatId: cleanAdminChatId,
                isEnabled
            }
        });

        // Fire and forget
        botManager.restartBot(id).catch(e => console.error("Async Bot Update Failed:", e));

        res.json(updated);
    } catch (e) {
        console.error("Update Bot Error:", e);
        res.status(500).json({ error: 'Failed to update bot' });
    }
});

router.delete('/bots/:id', requireRole(['ADMIN']), async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await prisma.botConfig.delete({ where: { id } });
        await botManager.stopAll();
        botManager.startAll().catch(e => console.error("Async Bot Restart All Failed:", e));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete bot' }); }
});

// --- Leads ---
router.get('/leads', async (req, res) => {
    const leads = await prisma.lead.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(leads);
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
        const { id, ...data } = req.body;
        const lead = await prisma.lead.create({ data });
        res.json(lead);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create lead' }); }
});

router.put('/leads/:id', async (req, res) => {
    try {
        const { id: _, ...data } = req.body;
        const id = parseInt(req.params.id);
        const lead = await prisma.lead.update({ where: { id }, data });
        res.json(lead);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update lead' }); }
});

router.delete('/leads/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.lead.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete lead' }); }
});

// --- B2B Requests CRUD ---
router.get('/requests', async (req, res) => {
    const requests = await prisma.b2bRequest.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(requests);
});

router.post('/requests', async (req, res) => {
    try {
        const { id, ...data } = req.body;
        const request = await prisma.b2bRequest.create({ data });
        res.json(request);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to create request' }); }
});

router.put('/requests/:id', async (req, res) => {
    try {
        const { id: _, ...data } = req.body;
        const id = parseInt(req.params.id);
        const request = await prisma.b2bRequest.update({ where: { id }, data });
        res.json(request);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Failed to update request' }); }
});

router.delete('/requests/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await prisma.b2bRequest.delete({ where: { id } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete request' }); }
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

router.get('/logs', requireRole(['ADMIN']), async (req, res) => {
    const logs = await prisma.systemLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(logs);
});

export default router;
