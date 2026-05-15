import { prisma } from '../../../../../services/prisma.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import type { BotRuntime } from '../types.js';
import { normalizeBotConfigChatId } from '../../../telegram/core/utils/telegramChatId.js';
import { TelegramSender } from '../../../telegram/messaging/telegramSender.js';

interface SetupContext {
  bot: BotRuntime;
  input: string;
  chatId: string;
  vars: Record<string, any>;
  update: any;
  saveSession: () => Promise<void>;
}

type SetupAdminAccessResult =
  | { ok: true; normalizedAdminChatId: string }
  | { ok: false; errorText: string };

const ADMIN_STATUSES = new Set(['administrator', 'creator']);

const assertSetupAdminCommandAccess = async (
  bot: BotRuntime,
  chatId: string,
  update: any
): Promise<SetupAdminAccessResult> => {
  const chat = update?.message?.chat || {};
  const chatType = String(chat.type || '').toLowerCase();
  const normalizedChatId = normalizeBotConfigChatId(chatId) || chatId;
  if (chatType !== 'group' && chatType !== 'supergroup') {
    return { ok: false, errorText: '⚠️ /setup_admin доступна лише в групі або супергрупі.' };
  }

  const configuredAdminChatId = normalizeBotConfigChatId((bot as any).adminChatId);
  if (configuredAdminChatId && configuredAdminChatId !== normalizedChatId) {
    return { ok: false, errorText: '⚠️ /setup_admin доступна лише в уже налаштованій admin-групі.' };
  }

  const actorId = String(update?.message?.from?.id || '').trim();
  if (!actorId) {
    return { ok: false, errorText: '⚠️ Не вдалося перевірити адміністратора групи.' };
  }

  try {
    const member = await TelegramSender.getChatMember(bot.token, normalizedChatId, actorId);
    const status = String((member as any)?.status || '').toLowerCase();
    if (!ADMIN_STATUSES.has(status)) {
      return { ok: false, errorText: '⚠️ Лише адміністратор групи може налаштувати admin chat.' };
    }
    return { ok: true, normalizedAdminChatId: normalizedChatId };
  } catch {
    return { ok: false, errorText: '⚠️ Не вдалося перевірити адміністратора групи.' };
  }
};

export const handleSetupCommands = async ({
  bot,
  input,
  chatId,
  vars,
  update,
  saveSession
}: SetupContext): Promise<boolean> => {
  if (input === '/setup_admin') {
    const access = await assertSetupAdminCommandAccess(bot, chatId, update);
    if (!access.ok) {
      await sendMessage(bot, chatId, access.errorText);
      return true;
    }
    const normalizedAdminChatId = access.normalizedAdminChatId;
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
