import { Router } from 'express';
import { prisma } from '../../../../services/prisma.js';
import { BotRepository } from '../../../../repositories/index.js';
import { runTelegramPipeline } from '../scenarios/pipeline.js';

const botRepo = new BotRepository(prisma);

const router = Router();

router.post('/webhook/:botId', async (req, res) => {
  const { botId } = req.params;
  const secretToken = req.header('X-Telegram-Bot-Api-Secret-Token') || null;

  const bot = await botRepo.findById(botId);
  if (!bot || !bot.isEnabled) {
    return res.status(404).json({ error: 'Bot not found' });
  }

  // Phase 1: Keep webhook public (no Bearer token) but require the Telegram secret.
  // Prefer bot-specific secret, fall back to env secret for legacy bots.
  const expected = (bot.config as any)?.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || null;
  if (!expected || expected !== secretToken) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.status(200).json({ ok: true });

  const update = req.body;

  setImmediate(async () => {
    try {
      // Deduplication is handled inside the pipeline middleware.
      await runTelegramPipeline({ update, bot, botId, secretToken, source: 'webhook' });
    } catch (err) {
      console.error('[TelegramWebhook] Pipeline error:', err);
    }
  });
});

export default router;
