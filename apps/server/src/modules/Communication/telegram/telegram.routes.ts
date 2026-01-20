import { Router } from 'express';
import { prisma } from '../../../services/prisma.js';
import { runTelegramPipeline } from './pipeline/pipeline.js';

const router = Router();

router.post('/webhook/:botId', async (req, res) => {
  const { botId } = req.params;
  const secretToken = req.header('X-Telegram-Bot-Api-Secret-Token') || null;

  const bot = await prisma.botConfig.findUnique({ where: { id: botId } });
  if (!bot || !bot.isEnabled) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  const expected = (bot.config as any)?.webhookSecret;
  if (!expected || expected !== secretToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(200).json({ ok: true });

  setImmediate(() => {
    runTelegramPipeline({ update: req.body, bot, botId, secretToken, source: 'webhook' })
      .catch(err => console.error('[TelegramWebhook] Pipeline error:', err));
  });
});

export default router;
