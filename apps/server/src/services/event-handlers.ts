import { platformEvents, EVENTS } from './platform-events.js';
import { prisma } from './prisma.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';

export const initEventHandlers = () => {
    platformEvents.on(EVENTS.MINIAPP_REQUEST_CREATED, async (data) => {
        try {
            const { requestId, companyId, botId, phone, telegramUserId, payload } = data;
            console.log(`[Event] Запит створено: ${requestId}`);

            if (!botId) return;

            const botConfig = await prisma.botConfig.findUnique({ where: { id: botId } });
            if (!botConfig || !botConfig.adminChatId) return;

            const adminChatId = botConfig.adminChatId;
            const cfg = ((botConfig.config as any) || {}) as Record<string, unknown>;
            const botUsername = String((cfg.botUsername as string) || (cfg.username as string) || '').replace(/^@/, '').trim();
            const requestLink = payload?.slug && botUsername
                ? `https://t.me/${botUsername}/app?startapp=${payload.slug}`
                : 'н/д';

            const message = `🔔 <b>Новий запит</b>\n\n` +
                `📱 Контакт: ${phone || 'н/д'}\n` +
                `👤 Користувач: ${telegramUserId || 'н/д'}\n` +
                `🆔 ID запиту: ${requestId}\n` +
                `🔗 Посилання: ${requestLink}\n` +
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

    console.log('[Events] Обробники ініціалізовано');
};
