import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext, PipelineMiddleware } from '../../core/types.js';
import { logger } from '../../../../../utils/logger.js';

export const resolveBotTenant: PipelineMiddleware = async (ctx: PipelineContext, next) => {
  if (!ctx.bot && ctx.botId) {
    ctx.bot = await prisma.botConfig.findUnique({ where: { id: ctx.botId } });
  }

  if (!ctx.bot) {
    logger.error('[TelegramPipeline] Bot not resolved');
    return;
  }

  if (!ctx.bot.isEnabled) {
    return;
  }

  ctx.companyId = ctx.bot.companyId || null;

  const secretToken = ctx.request?.secretToken || undefined;
  if (secretToken !== undefined) {
    // Keep consistent with telegram.routes.ts: allow env fallback for legacy bots.
    const expected = (ctx.bot.config as any)?.webhookSecret || process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected || expected !== secretToken) {
      logger.warn('[TelegramPipeline] Webhook secret mismatch');
      return;
    }
  }

  await next();
};
