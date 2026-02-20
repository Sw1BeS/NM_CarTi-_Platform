import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireRole } from '../middleware/auth.js';
import { getAllUsers } from '../services/v41/readService.js';
import { writeService } from '../services/v41/writeService.js';
import { SettingsService } from '../modules/Core/system/settings.service.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.get('/settings', requireRole(['ADMIN']), async (req, res) => {
    try {
        res.set('X-Deprecated', 'Use /system/settings');
        const settings = await SettingsService.getSettings(false);
        res.json(settings || {});
    } catch {
        errorResponse(res, 500, 'Failed to load settings');
    }
});

router.post('/settings', requireRole(['ADMIN']), async (req, res) => { // Legacy endpoint (deprecated)
    try {
        res.set('X-Deprecated', 'Use /system/settings');
        await SettingsService.updateSettings(req.body || {});
        res.json({ success: true });
    } catch {
        errorResponse(res, 500, 'Failed to update settings');
    }
});

router.get('/users', requireRole(['ADMIN']), async (req, res) => {
    const users = await getAllUsers();
    res.json(users);
});

router.post('/users', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { password, ...data } = req.body;
        if (!data.companyId && !data.workspaceId) {
            logger.info('Warning: creating user without companyId in API route');
        }

        const pwd = password || '123456';
        const hashedPassword = await bcrypt.hash(pwd, 10);

        const created = await writeService.createUserDual({
            email: data.email,
            passwordHash: hashedPassword,
            name: data.name,
            role: data.role,
            companyId: data.companyId || data.workspaceId
        });
        res.json(created);
    } catch (e) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to create user');
    }
});

router.put('/users/:id', requireRole(['ADMIN']), async (req, res) => {
    try {
        const { password, ...data } = req.body;
        const { id } = req.params;

        const globalUpdates: any = {};
        if (data.email) globalUpdates.email = data.email;
        if (password) globalUpdates.password_hash = await bcrypt.hash(password, 10);
        if (data.isActive !== undefined) globalUpdates.global_status = data.isActive ? 'active' : 'inactive';

        if (Object.keys(globalUpdates).length > 0) {
            await prisma.globalUser.update({ where: { id }, data: globalUpdates });
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
        await prisma.globalUser.update({
            where: { id },
            data: {
                deleted_at: new Date(),
                global_status: 'archived'
            }
        });
        res.json({ success: true });
    } catch {
        errorResponse(res, 500, 'Failed to delete user');
    }
});

router.get('/logs', requireRole(['ADMIN']), async (_req, res) => {
    const logs = await prisma.systemLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    res.json(logs);
});

router.post('/storage/upload', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { name, content } = req.body || {};
        if (!name || !content) return errorResponse(res, 400, 'name and content required');

        const matches = content.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        const buffer = matches && matches.length === 3
            ? Buffer.from(matches[2], 'base64')
            : Buffer.from(content, 'base64');

        const fileName = `${Date.now()}_${name.replace(/[^a-z0-9.]/gi, '_')}`;
        const mediaDir = path.join(__dirname, '../../storage/media');
        if (!fs.existsSync(mediaDir)) {
            fs.mkdirSync(mediaDir, { recursive: true });
        }

        const filePath = path.join(mediaDir, fileName);
        fs.writeFileSync(filePath, buffer);

        const url = `/media/${fileName}`;
        res.json({ ok: true, url, name });
    } catch (e: any) {
        logger.error('[Upload] Error:', e);
        errorResponse(res, 500, 'Upload failed');
    }
});

export default router;
