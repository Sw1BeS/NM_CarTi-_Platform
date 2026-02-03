import { PipelineMiddleware } from '../../core/types.js';
import { prisma } from '../../../../../services/prisma.js';
import { summarizeText } from '../../core/events/eventEmitter.js';
import { logger } from '../../../../../utils/logger.js';
import { logIntegrationEvent } from '../../../../../services/integrationEventLog.service.js';

export const saveMessage: PipelineMiddleware = async (ctx, next) => {
    // 1. Proceed with pipeline first (or parallel? - safer to wait for next to ensure we don't save duplicates if dedup fails?)
    // Actually, we want to save 'Incoming' message regardless of whether it matched a scenario, unless it is a duplicate.
    // Dedup middleware runs before this.

    // 2. Check if we have a valid message or callback
    const message = ctx.update?.message || ctx.update?.edited_message || ctx.update?.channel_post;
    const callback = ctx.update?.callback_query;

    // 3. Extract basic info
    const text = message?.text || message?.caption || (callback ? `[Callback] ${callback.data}` : null);
    const messageId = message?.message_id || callback?.message?.message_id;

    // Note: For callbacks, the 'message' in update is the original message that was clicked, 
    // but the 'from' user is in callback_query.from.
    // We generally only want to save "user sent text/media". 
    // Callbacks are interactions, maybe save them too but with distinction.
    // For Inbox purposes, we definitely need TEXT messages.

    if (ctx.bot?.id && ctx.chatId && messageId) {
        try {
            // 4. Check if already saved (idempotency by messageId) - though dedup should handle update_id.
            // MessageId is specific to chat.
            const existing = await prisma.botMessage.findFirst({
                where: {
                    botId: ctx.bot.id,
                    chatId: ctx.chatId,
                    messageId: messageId,
                    direction: 'INCOMING'
                },
                select: { id: true }
            });

            if (!existing) {
                await prisma.botMessage.create({
                    data: {
                        botId: ctx.bot.id,
                        chatId: ctx.chatId,
                        direction: 'INCOMING',
                        messageId: messageId,
                        text: summarizeText(text) || '[Media/Unknown]',
                        payload: {
                            raw: ctx.update,
                            type: ctx.updateType,
                            from: message?.from || callback?.from
                        }
                    }
                });
                await logIntegrationEvent({
                    companyId: ctx.companyId || undefined,
                    integration: 'TELEGRAM',
                    entityId: ctx.bot.id,
                    action: 'message.received',
                    status: 'OK',
                    message: summarizeText(text) || 'incoming',
                    meta: {
                        botId: ctx.bot.id,
                        chatId: ctx.chatId,
                        messageId: messageId
                    }
                });
            }
        } catch (err) {
            logger.error('[saveMessage] Failed to persist message:', err);
            // specific error shouldn't block pipeline
        }
    }

    await next();
};
