// @ts-ignore
import { prisma } from '../services/prisma.js';
import axios from 'axios';

export const TELEGRAM_METHODS = new Set([
    'getMe',
    'getWebhookInfo',
    'sendMessage',
    'sendPhoto',
    'sendDocument',
    'sendVideo',
    'sendAudio',
    'sendVoice',
    'sendAnimation',
    'sendSticker',
    'sendMediaGroup',
    'editMessageText',
    'sendChatAction',
    'answerCallbackQuery',
    'setMyCommands',
    'setChatMenuButton',
    'getFile',
    'getUpdates'
]);

export const resolveBot = async (token?: string, botId?: string, companyId?: string | null) => {
    if (botId) {
        const bot = await prisma.botConfig.findUnique({ where: { id: botId } });
        return bot?.token ? { token: bot.token, botId: bot.id, bot } : null;
    }
    if (token) {
        const bot = await prisma.botConfig.findFirst({ where: { token } });
        return { token, botId: bot?.id, bot: bot || null };
    }
    const bot = await prisma.botConfig.findFirst({
        where: {
            isEnabled: true,
            ...(companyId ? { companyId } : {})
        }
    });
    return bot?.token ? { token: bot.token, botId: bot.id, bot } : null;
};

export const callTelegram = async (token: string, method: string, params: Record<string, any>) => {
    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await axios.post(url, params, { timeout: 15000 });
    if (!response.data?.ok) {
        const message = response.data?.description || 'Telegram API error';
        throw new Error(message);
    }
    return response.data.result;
};
