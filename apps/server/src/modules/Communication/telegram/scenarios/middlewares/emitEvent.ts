import type { PipelineContext, PipelineMiddleware } from '../../core/types.js';
import { emitPlatformEvent, summarizeText } from '../../core/events/eventEmitter.js';

export const emitEvent: PipelineMiddleware = async (ctx: PipelineContext, next) => {
  let error: any = null;
  try {
    await next();
  } catch (e) {
    error = e;
  }

  const updateId = ctx.update?.update_id;
  await emitPlatformEvent({
    companyId: ctx.companyId,
    botId: ctx.bot?.id,
    eventType: 'tg.update.received',
    userId: ctx.userId,
    chatId: ctx.chatId,
    payload: {
      updateId,
      updateType: ctx.updateType,
      dedup: ctx.dedup?.isDuplicate || false
    }
  });

  if (ctx.updateType === 'message' || ctx.updateType === 'web_app') {
    const message = ctx.update?.message;
    await emitPlatformEvent({
      companyId: ctx.companyId,
      botId: ctx.bot?.id,
      eventType: 'tg.message.incoming',
      userId: ctx.userId,
      chatId: ctx.chatId,
      payload: {
        messageId: message?.message_id,
        text: summarizeText(message?.text || message?.caption),
        hasContact: !!message?.contact
      }
    });
  }

  if (error) throw error;
};
