import { prisma } from '../../../../../services/prisma.js';
import { renderVariantCard } from '../../../../../services/cardRenderer.js';
import { telegramOutbox } from '../../../telegram/messaging/outbox/telegramOutbox.js';
import { answerCallback, sendMessage } from '../adapters/telegram.adapter.js';
import type { BotRuntime } from '../types.js';

interface CallbackHandlerContext {
  bot: BotRuntime;
  session: any;
  update: any;
  chatId: string;
  userId?: string;
  lang: string;
  vars: Record<string, any>;
  history: string[];
  saveSession: () => Promise<void>;
  buildStatusHistory: (variant: any, nextStatus: string) => any[];
  handleInput: (input: string, isCallback: boolean) => Promise<boolean>;
  goBack: () => Promise<void>;
  handleCarSelection: (carId: string) => Promise<void>;
  handleAddToRequest: (carId: string) => Promise<void>;
  handleAddToCatalog: (carId: string) => Promise<void>;
  resetFlow: () => void;
  sendMainMenu: () => Promise<void>;
}

export const handleCallbackQuery = async ({
  bot,
  update,
  chatId,
  lang,
  saveSession,
  buildStatusHistory,
  handleInput,
  goBack,
  handleCarSelection,
  handleAddToRequest,
  handleAddToCatalog,
  resetFlow,
  sendMainMenu
}: CallbackHandlerContext): Promise<boolean> => {
  if (!update.callback_query) return false;

  await answerCallback(bot, update.callback_query.id);
  const cbData = update.callback_query.data || '';

  if (cbData.startsWith('B2BVAR:')) {
    const parts = cbData.split(':');
    if (parts.length >= 3) {
      const variantId = parts[1];
      const action = parts[2];

      const variant = await prisma.requestVariant.findUnique({
        where: { id: variantId },
        include: { request: true }
      });

      if (!variant) {
        await sendMessage(bot, chatId, 'Варіант не знайдено.');
        return true;
      }

      if (action === 'FIT') {
        await prisma.requestVariant.update({
          where: { id: variantId },
          data: { status: 'APPROVED', statusHistory: buildStatusHistory(variant, 'APPROVED') }
        });
        await prisma.b2bRequest.update({
          where: { id: variant.requestId },
          data: { status: 'CONTACT_SHARED' }
        }).catch(() => null);

        const msg = update.callback_query.message;
        if (msg) {
          await telegramOutbox.editMessageText({
            botId: bot.id,
            token: bot.token,
            chatId: String(msg.chat.id),
            messageId: msg.message_id,
            text: `${msg.text || msg.caption || ''}\n\n✅ СХВАЛЕНО`,
            companyId: bot.companyId || null
          }).catch(() => null);
        }

        if (bot.adminChatId) {
          const variantCard = renderVariantCard(variant as any, { includeContact: true });
          await sendMessage(
            bot,
            bot.adminChatId,
            `✅ Заявка схвалена!\n\n${variantCard}\n\n🔗 Запит: ${variant.request?.title || variant.requestId}`
          );
        }

        await sendMessage(bot, chatId, '✅ Ви схвалили варіант. Менеджер отримав контакт дилера.');
      } else if (action === 'NO') {
        await prisma.requestVariant.update({
          where: { id: variantId },
          data: { status: 'REJECTED', statusHistory: buildStatusHistory(variant, 'REJECTED') }
        });

        const msg = update.callback_query.message;
        if (msg) {
          await telegramOutbox.editMessageText({
            botId: bot.id,
            token: bot.token,
            chatId: String(msg.chat.id),
            messageId: msg.message_id,
            text: `${msg.text || msg.caption || ''}\n\n❌ НЕ ПІДХОДИТЬ`,
            companyId: bot.companyId || null
          }).catch(() => null);
        }

        await sendMessage(bot, chatId, 'Варіант відхилено.');
      }

      return true;
    }
  }

  if (cbData.startsWith('VARIANT:')) {
    const [, variantId, action] = cbData.split(':');
    if (variantId && action) {
      const target = await prisma.requestVariant.findUnique({ where: { id: variantId } });
      if (target) {
        let nextStatus = target.status;
        if (action === 'APPROVE') nextStatus = 'APPROVED';
        if (action === 'REJECT') nextStatus = 'REJECTED';
        if (action === 'SEND_TO_CLIENT') nextStatus = 'SENT_TO_CLIENT';
        await prisma.requestVariant.update({
          where: { id: variantId },
          data: { status: nextStatus, statusHistory: buildStatusHistory(target, nextStatus) }
        });
        await prisma.messageLog.create({
          data: {
            requestId: target.requestId,
            variantId: target.id,
            botId: bot.id,
            chatId,
            direction: 'OUTGOING',
            text: `Manager action: ${action}`,
            payload: { status: nextStatus }
          }
        }).catch(() => {
        });
        await sendMessage(bot, chatId, `✅ Статус оновлено: ${nextStatus}`);
      } else {
        await sendMessage(bot, chatId, 'Варіант не знайдено.');
      }
    }
    return true;
  }

  if (cbData.startsWith('SCN:CHOICE:')) {
    const choiceVal = cbData.split('SCN:CHOICE:')[1];
    const handled = await handleInput(choiceVal, true);
    if (!handled) {
      await sendMessage(bot, chatId, lang === 'UK' ? '⚠️ Сесія минула. Скидання...' : '⚠️ Session expired. Resetting...');
      resetFlow();
      await saveSession();
      await sendMainMenu();
    }
    return true;
  }

  if (cbData.startsWith('CAR:SELECT:')) {
    await handleCarSelection(cbData.split('CAR:SELECT:')[1]);
    await saveSession();
    return true;
  }

  if (cbData.startsWith('CAR:ADD_REQUEST:')) {
    await handleAddToRequest(cbData.split('CAR:ADD_REQUEST:')[1]);
    await saveSession();
    return true;
  }

  if (cbData.startsWith('CAR:ADD_CATALOG:')) {
    await handleAddToCatalog(cbData.split('CAR:ADD_CATALOG:')[1]);
    await saveSession();
    return true;
  }

  if (cbData === 'CMD:BACK') {
    await goBack();
    await saveSession();
    return true;
  }

  return false;
};
