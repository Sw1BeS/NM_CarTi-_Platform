import { Router } from 'express';
import { prisma } from '../services/prisma.js';
import { parseListingFromUrl } from '../services/parser.js';
import { generateRequestLink } from '../utils/deeplink.utils.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { ScenarioEngine } from '../modules/Communication/bots/scenario.engine.js';

const router = Router();

router.get('/parse', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).json({ error: 'url required' });
  try {
    const result = await parseListingFromUrl(url);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'parse failed' });
  }
});

router.get('/simulate/start', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  const type = req.query.type as string;
  const requestId = req.query.requestId as string;
  const dealerId = req.query.dealerId as string;
  const bot = await prisma.botConfig.findFirst({ where: { isEnabled: true } });
  const botUsername = bot?.config ? (bot.config as any).username : undefined;
  if (!bot?.token || !botUsername) return res.status(400).json({ error: 'Bot username missing' });

  if (type === 'dealer_invite' && dealerId) {
    const payload = requestId ? `dealer_invite:${dealerId}:${requestId}` : `dealer_invite:${dealerId}`;
    const link = `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
    return res.json({ link });
  }
  if (type === 'request' && requestId) {
    const link = generateRequestLink(botUsername, requestId);
    return res.json({ link });
  }
  res.status(400).json({ error: 'Invalid payload' });
});

router.post('/simulate/message', authenticateToken, requireRole(['SUPER_ADMIN', 'ADMIN']), async (req, res) => {
  try {
    const { chatId, text, botId } = req.body || {};
    if (!chatId || !text) return res.status(400).json({ error: 'chatId and text are required' });

    const bot = botId
      ? await prisma.botConfig.findUnique({ where: { id: botId } })
      : await prisma.botConfig.findFirst({ where: { isEnabled: true } });
    if (!bot?.token) return res.status(400).json({ error: 'Active bot not found' });

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
    console.error('[QA Simulate] Error:', e);
    res.status(500).json({ error: e.message || 'Simulation failed' });
  }
});

export default router;
