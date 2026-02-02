import { Router } from 'express';
import { prisma } from '../../../../services/prisma.js';
import { BotRepository } from '../../../../repositories/index.js';
import { runTelegramPipeline } from '../scenarios/pipeline.js';
import { logIntegrationEvent } from '../../../../services/integrationEventLog.service.js';
import { logger } from '../../../../utils/logger.js';
import { errorResponse } from '../../../../utils/errorResponse.js';

const botRepo = new BotRepository(prisma);

import { destinationRoutes } from '../destinations/destination.routes.js';

const router = Router();

router.use('/destinations', destinationRoutes);

router.post('/webhook/:botId', async (req, res) => {
  const { botId } = req.params;
  const secretToken = req.header('X-Telegram-Bot-Api-Secret-Token') || null;

  const bot = await botRepo.findById(botId);
  if (!bot || !bot.isEnabled) {
    return errorResponse(res, 404, 'Bot not found', 'BOT_NOT_FOUND');
  }

  // Phase 1: Keep webhook public (no Bearer token) but require the Telegram secret.
  // Prefer bot-specific secret, fall back to env secret for legacy bots.
  const expected = (bot.config as any)?.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET || null;
  if (!expected || expected !== secretToken) {
    return errorResponse(res, 403, 'Forbidden', 'BOT_SECRET_INVALID');
  }

  res.status(200).json({ ok: true });

  const update = req.body;
  const updateType = update ? Object.keys(update).find(key => key !== 'update_id') : undefined;

  await logIntegrationEvent({
    companyId: bot.companyId,
    integration: 'TELEGRAM_BOTAPI',
    entityId: botId,
    action: 'webhook_received',
    status: 'OK',
    message: updateType ? `update:${updateType}` : 'update',
    meta: { updateId: update?.update_id, updateType }
  });

  setImmediate(async () => {
    try {
      // Deduplication is handled inside the pipeline middleware.
      await runTelegramPipeline({ update, bot, botId, secretToken, source: 'webhook' });
    } catch (err) {
      logger.error('[TelegramWebhook] Pipeline error:', err);
      await logIntegrationEvent({
        companyId: bot.companyId,
        integration: 'TELEGRAM_BOTAPI',
        entityId: botId,
        action: 'webhook_error',
        status: 'ERROR',
        message: err instanceof Error ? err.message : 'Pipeline error'
      });
    }
  });
});

export default router;
