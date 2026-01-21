import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext, PipelineMiddleware } from '../../core/types.js';

export const resolveBotTenant: PipelineMiddleware = async (ctx: PipelineContext, next) => {
  if (!ctx.bot && ctx.botId) {
    ctx.bot = await prisma.botConfig.findUnique({ where: { id: ctx.botId } });
  }

  if (!ctx.bot) {
    console.error('[TelegramPipeline] Bot not resolved');
    return;
  }

  if (!ctx.bot.isEnabled) {
    return;
  }

  ctx.companyId = ctx.bot.companyId || null;

  const secretToken = ctx.request?.secretToken || undefined;
  if (secretToken !== undefined) {
    const expected = (ctx.bot.config as any)?.webhookSecret;
    if (!expected || expected !== secretToken) {
      console.warn('[TelegramPipeline] Webhook secret mismatch');
      return;
    }
  }

  await next();
};
