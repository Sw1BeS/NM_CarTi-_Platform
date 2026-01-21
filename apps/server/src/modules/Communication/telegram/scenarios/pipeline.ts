import type { BotConfig } from '@prisma/client';
import type { PipelineContext, PipelineMiddleware } from '../core/types.js';
import { resolveBotTenant } from './middlewares/resolveBotTenant.js';
import { dedup } from './middlewares/dedup.js';
import { enrichContext } from './middlewares/enrichContext.js';
import { normalize } from './middlewares/normalize.js';
import { emitEvent } from './middlewares/emitEvent.js';
import { routeMessage } from '../routing/routeMessage.js';
import { routeCallback } from '../routing/routeCallback.js';
import { routeWebApp } from '../routing/routeWebApp.js';
import { routeInline } from '../routing/routeInline.js';

type PipelineInput = {
  update: any;
  bot?: BotConfig | null;
  botId?: string;
  secretToken?: string | null;
  source?: 'polling' | 'webhook';
};

const routeUpdate: PipelineMiddleware = async (ctx, next) => {
  if (!ctx.bot) return;

  if (!ctx.dedup?.isDuplicate) {
    if (ctx.update?.inline_query) {
      await routeInline(ctx);
    } else if (ctx.update?.callback_query) {
      await routeCallback(ctx);
    } else if (ctx.update?.message?.web_app_data) {
      await routeWebApp(ctx);
    } else if (ctx.update?.message) {
      await routeMessage(ctx);
    }
  }

  await next();
};

const compose = (middlewares: PipelineMiddleware[]) =>
  async (ctx: PipelineContext) => {
    let index = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      const fn = middlewares[i];
      if (!fn) return;
      await fn(ctx, () => dispatch(i + 1));
    };
    await dispatch(0);
  };

const pipeline = compose([
  resolveBotTenant,
  dedup,
  enrichContext,
  normalize,
  routeUpdate,
  emitEvent
]);

export const runTelegramPipeline = async (input: PipelineInput) => {
  const ctx: PipelineContext = {
    update: input.update,
    bot: input.bot || null,
    botId: input.botId,
    receivedAt: new Date(),
    request: {
      secretToken: input.secretToken || null,
      source: input.source
    }
  };

  await pipeline(ctx);
};
