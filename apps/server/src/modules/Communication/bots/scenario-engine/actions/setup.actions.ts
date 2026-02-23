import { prisma } from '../../../../../services/prisma.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import type { BotRuntime } from '../types.js';
import { normalizeBotConfigChatId } from '../../../telegram/core/utils/telegramChatId.js';

interface SetupContext {
  bot: BotRuntime;
  input: string;
  chatId: string;
  vars: Record<string, any>;
  update: any;
  saveSession: () => Promise<void>;
}

export const handleSetupCommands = async ({
  bot,
  input,
  chatId,
  vars,
  update,
  saveSession
}: SetupContext): Promise<boolean> => {
  if (input === '/setup_admin') {
    const normalizedAdminChatId = normalizeBotConfigChatId(chatId) || chatId;
    await prisma.botConfig.update({
      where: { id: bot.id },
      data: { adminChatId: normalizedAdminChatId }
    });
    bot.adminChatId = normalizedAdminChatId;
    await sendMessage(bot, chatId, `✅ Admin chat configured: ${normalizedAdminChatId}`);
    return true;
  }

  if (input === '/setup_channel') {
    vars.setup_mode = 'CHANNEL';
    await saveSession();
    await sendMessage(bot, chatId, '📢 Перешліть будь-яке повідомлення з каналу, який треба підключити.');
    return true;
  }

  if (vars.setup_mode === 'CHANNEL') {
    if (update.message?.forward_from_chat) {
      const channelIdRaw = String(update.message.forward_from_chat.id);
      const channelId = normalizeBotConfigChatId(channelIdRaw) || channelIdRaw;
      const channelTitle = update.message.forward_from_chat.title || 'Channel';

      await prisma.botConfig.update({
        where: { id: bot.id },
        data: { channelId }
      });
      bot.channelId = channelId;

      delete vars.setup_mode;
      await saveSession();
      await sendMessage(bot, chatId, `✅ Channel configured: ${channelTitle} (${channelId})`);
      return true;
    }

    if (input === '/cancel' || input === 'cancel') {
      delete vars.setup_mode;
      await saveSession();
      await sendMessage(bot, chatId, '❌ Налаштування скасовано.');
      return true;
    }

    await sendMessage(bot, chatId, '⚠️ Це не переслане повідомлення з каналу. Спробуйте ще раз або напишіть /cancel.');
    return true;
  }

  return false;
};
