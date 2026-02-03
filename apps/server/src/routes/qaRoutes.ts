import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { parseListingFromUrl } from '../services/parser.js';
// @ts-ignore
import { saveProfile } from '../services/parserProfiles.js';
import { generateRequestLink } from '../utils/deeplink.utils.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ScenarioEngine } from '../modules/Communication/bots/scenario.engine.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';
import axios from 'axios';

const router = Router();

router.get('/parse', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  const url = req.query.url as string;
  if (!url) return errorResponse(res, 400, 'url required');
  try {
    const result = await parseListingFromUrl(url);
    res.json(result);
  } catch (e: any) {
    errorResponse(res, 500, e.message || 'parse failed');
  }
});

router.post('/parse/profile', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
    try {
        const { domain, selectors } = req.body;
        if (!domain || !selectors) return errorResponse(res, 400, 'domain and selectors required');

        await saveProfile(domain, selectors);
        res.json({ success: true });
    } catch (e: any) {
        logger.error('Save Profile Error:', e);
        errorResponse(res, 500, e.message);
    }
});

router.get('/simulate/start', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  const type = req.query.type as string;
  const requestId = req.query.requestId as string;
  const dealerId = req.query.dealerId as string;
  const bot = await prisma.botConfig.findFirst({ where: { isEnabled: true } });
  const botUsername = bot?.config ? (bot.config as any).username : undefined;
  if (!bot?.token || !botUsername) return errorResponse(res, 400, 'Bot username missing');

  if (type === 'dealer_invite' && dealerId) {
    const payload = requestId ? `dealer_invite:${dealerId}:${requestId}` : `dealer_invite:${dealerId}`;
    const link = `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
    return res.json({ link });
  }
  if (type === 'request' && requestId) {
    const link = generateRequestLink(botUsername, requestId);
    return res.json({ link });
  }
  errorResponse(res, 400, 'Invalid payload');
});

router.post('/simulate/message', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { chatId, text, botId } = req.body || {};
    if (!chatId || !text) return errorResponse(res, 400, 'chatId and text are required');

    const bot = botId
      ? await prisma.botConfig.findUnique({ where: { id: botId } })
      : await prisma.botConfig.findFirst({ where: { isEnabled: true } });
    if (!bot?.token) return errorResponse(res, 400, 'Active bot not found');

    const session = await prisma.botSession.upsert({
      where: { botId_chatId: { botId: String(bot.id), chatId: String(chatId) } },
      update: { lastActive: new Date() },
      create: {
        botId: String(bot.id),
        chatId: String(chatId),
        state: 'START',
        history: [],
        variables: {},
        lastActive: new Date()
      }
    });

    const runtime = {
      id: String(bot.id),
      name: bot.name,
      token: bot.token,
      channelId: bot.channelId,
      adminChatId: bot.adminChatId,
      companyId: bot.companyId,
      config: bot.config,
      template: bot.template
    };

    const update = {
      update_id: Date.now(),
      message: {
        message_id: Date.now(),
        chat: { id: chatId, type: 'private' },
        from: { id: chatId, first_name: 'Simulator' },
        text,
        date: Math.floor(Date.now() / 1000)
      }
    };

    await (prisma as any).botMessage.create({
        data: {
            botId: String(bot.id),
            chatId: String(chatId),
            direction: 'INCOMING',
        text,
        messageId: update.message.message_id,
        payload: { from: update.message.from, chat: update.message.chat }
      }
    }).catch(() => {});

    await ScenarioEngine.handleUpdate(runtime as any, session, update);

    res.json({ ok: true });
  } catch (e: any) {
    logger.error('[QA Simulate] Error:', e);
    errorResponse(res, 500, e.message || 'Simulation failed');
  }
});

router.get('/telegram/token', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const botId = req.query.botId as string | undefined;
    const bot = botId
      ? await prisma.botConfig.findUnique({ where: { id: botId } })
      : await prisma.botConfig.findFirst({ where: { isEnabled: true } });
    if (!bot?.token) return errorResponse(res, 400, 'Bot token missing');

    const resp = await axios.get(`https://api.telegram.org/bot${bot.token}/getMe`, { timeout: 8000 });
    res.json({ ok: resp.data?.ok, result: resp.data?.result });
  } catch (e: any) {
    errorResponse(res, 500, e?.response?.data?.description || e.message || 'Token check failed');
  }
});

router.get('/telegram/webhook', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const botId = req.query.botId as string | undefined;
    const bot = botId
      ? await prisma.botConfig.findUnique({ where: { id: botId } })
      : await prisma.botConfig.findFirst({ where: { isEnabled: true } });
    if (!bot?.token) return errorResponse(res, 400, 'Bot token missing');

    const resp = await axios.get(`https://api.telegram.org/bot${bot.token}/getWebhookInfo`, { timeout: 8000 });
    res.json({ ok: resp.data?.ok, result: resp.data?.result });
  } catch (e: any) {
    errorResponse(res, 500, e?.response?.data?.description || e.message || 'Webhook check failed');
  }
});

router.get('/media/check', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const url = req.query.url as string;
    if (!url) return errorResponse(res, 400, 'url required');

    const settings = await prisma.systemSettings.findFirst({ orderBy: { id: 'desc' } });
    const baseUrl = (settings?.modules as any)?.telegram?.publicBaseUrl || process.env.PUBLIC_BASE_URL || '';
    const resolved = url.startsWith('http') ? url : `${baseUrl.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;

    if (!resolved || !resolved.startsWith('http')) {
      return errorResponse(res, 400, 'Unable to resolve URL');
    }

    const resp = await axios.head(resolved, { timeout: 8000 });
    res.json({ ok: resp.status >= 200 && resp.status < 400, status: resp.status, url: resolved });
  } catch (e: any) {
    errorResponse(res, 500, e?.message || 'Media check failed');
  }
});

export default router;
