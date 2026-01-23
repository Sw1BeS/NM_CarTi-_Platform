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

  const expected = (bot.config as any)?.webhookSecret;
  if (!expected || expected !== secretToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(200).json({ ok: true });

  const update = req.body;
  const updateIdRaw = update?.update_id;
  const updateId = typeof updateIdRaw === 'number'
    ? updateIdRaw
    : (updateIdRaw !== undefined && updateIdRaw !== null && Number.isFinite(Number(updateIdRaw)) ? Number(updateIdRaw) : null);

  setImmediate(async () => {
    try {
      // Idempotency: skip duplicate updates if Telegram retries
      if (updateId !== null) {
        try {
          await prisma.telegramUpdate.create({
            data: {
              botId,
              updateId,
              payload: update
            }
          });
        } catch (e: any) {
          if (e?.code === 'P2002') {
            return; // already processed
          }
          console.error('[TelegramWebhook] Failed to persist update:', e?.message || e);
        }
      }

      await runTelegramPipeline({ update, bot, botId, secretToken, source: 'webhook' });
    } catch (err) {
      console.error('[TelegramWebhook] Pipeline error:', err);
    }
  });
});

export default router;
