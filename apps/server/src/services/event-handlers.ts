import { platformEvents, EVENTS } from './platform-events.js';
import { prisma } from './prisma.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';

export const initEventHandlers = () => {
    platformEvents.on(EVENTS.MINIAPP_REQUEST_CREATED, async (data) => {
        try {
            const { requestId, companyId, botId, phone, telegramUserId, payload } = data;
            console.log(`[Event] Request created: ${requestId}`);

            if (!botId) return;

            const botConfig = await prisma.botConfig.findUnique({ where: { id: botId } });
            if (!botConfig || !botConfig.adminChatId) return;

            const adminChatId = botConfig.adminChatId;
            const requestLink = payload?.slug ? `https://t.me/${(botConfig.config as any)?.username}/app?startapp=${payload.slug}` : 'N/A';

            const message = `🔔 <b>New Request</b>\n\n` +
                `📱 Phone: ${phone || 'N/A'}\n` +
                `👤 User: ${telegramUserId || 'N/A'}\n` +
                `🆔 Request ID: ${requestId}\n` +
                `🔗 Link: ${requestLink}\n` +
                `⏱ ${new Date().toLocaleString()}`;

            await telegramOutbox.sendMessage({
                botId,
                token: botConfig.token,
                chatId: adminChatId,
                text: message,
                companyId: companyId || botConfig.companyId
            });
        } catch (e) {
            console.error('[Event] Failed to handle MINIAPP_REQUEST_CREATED', e);
        }
    });

    console.log('[Events] Handlers initialized');
};
