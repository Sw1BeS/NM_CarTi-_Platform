import { Prisma } from '@prisma/client';
import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext, PipelineMiddleware } from '../../core/types.js';

const buildDedupPayload = (update: any) => {
  const message = update?.message;
  const callback = update?.callback_query;
  const inline = update?.inline_query;
  return {
    messageId: message?.message_id || callback?.message?.message_id || null,
    callbackId: callback?.id || null,
    inlineQueryId: inline?.id || null,
    chatId: message?.chat?.id || callback?.message?.chat?.id || null
  };
};

export const dedup: PipelineMiddleware = async (ctx: PipelineContext, next) => {
  const updateId = ctx.update?.update_id;
  if (!ctx.bot || updateId === undefined || updateId === null) {
    await next();
    return;
  }

  try {
    await prisma.telegramUpdate.create({
      data: {
        botId: ctx.bot.id,
        updateId: Number(updateId),
        payload: buildDedupPayload(ctx.update)
      }
    });
    ctx.dedup = { isDuplicate: false, updateId: Number(updateId) };
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      ctx.dedup = { isDuplicate: true, updateId: Number(updateId) };
      await next();
      return;
    }
    throw e;
  }

  await next();
};
