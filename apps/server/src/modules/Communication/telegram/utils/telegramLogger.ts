
import { logger } from '../../../../utils/logger.js';

type TelegramEvent = 'INCOMING_MESSAGE' | 'OUTGOING_MESSAGE' | 'CHANNEL_POST' | 'CALLBACK_QUERY' | 'ERROR' | 'LEAD_CREATED' | 'REQUEST_CREATED';

export class TelegramLogger {
    static log(event: TelegramEvent, meta: Record<string, any>) {
        // Enhance meta with standardized fields if present
        const standardized = {
            botId: meta.botId,
            chatId: meta.chatId,
            userId: meta.userId,
            messageId: meta.messageId,
            ...meta
        };

        // Construct a structured log message
        const logMsg = `[TG:${event}] ${JSON.stringify(standardized)}`;

        if (event === 'ERROR') {
            logger.error(logMsg, meta.error);
        } else {
            logger.info(logMsg);
        }
    }

    static info(message: string, meta?: any) {
        logger.info(`[Telegram] ${message}`, meta);
    }

    static error(message: string, error?: any) {
        logger.error(`[Telegram] ${message}`, error);
    }
}
