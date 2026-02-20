import { prisma } from '../../../../../services/prisma.js';
import { mapVariantInput } from '../../../../../services/dto.js';
import { parseCarData } from '../../../../../services/enhanced-parsing.utils.js';
import { managerActionsKeyboard, renderVariantCard } from '../../../../../services/cardRenderer.js';
import { telegramOutbox } from '../../../telegram/messaging/outbox/telegramOutbox.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import { hasContactInfo } from '../runtime/helpers.js';
import { resolveRequestId } from './session.actions.js';
import type { BotRuntime } from '../types.js';

interface DealerFlowContext {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  update: any;
  messageTextRaw: string;
  userId?: string;
  saveSession: () => Promise<void>;
}

export const handleDealerFlow = async ({
  bot,
  chatId,
  vars,
  update,
  messageTextRaw,
  userId,
  saveSession
}: DealerFlowContext) => {
  const dealerState = vars.dealer_state || 'INIT';
  const requestId = await resolveRequestId(vars);
  const flow = vars.dealer_flow || {};

  const summaryCard = (override?: any, opts?: { includeContact?: boolean }) => {
    const variantData = {
      title: flow.title || flow.details || 'Пропозиція',
      price: flow.price,
      currency: flow.currency || 'USD',
      year: flow.year,
      mileage: flow.mileage,
      specs: { vin: flow.vin, note: flow.details, fuel: flow.fuel, condition: flow.condition },
      contact: flow.contact,
      companyName: flow.companyName,
      location: flow.city,
      sourceUrl: flow.url,
      thumbnail: (vars.dealer_photos || [])[0],
      ...(override || {})
    };
    const photoCount = (vars.dealer_photos || []).length || 0;
    return `${renderVariantCard(variantData, opts)}\n🖼 Фото: ${photoCount}`;
  };

  if (dealerState === 'INIT') {
    vars.dealer_flow = {};
    vars.dealer_state = 'AWAIT_CONTACT';
    await saveSession();
    await sendMessage(bot, chatId, '🤝 Вітаємо! Поділися контактом, щоб продовжити.', {
      keyboard: [[{ text: '📱 Поділитися контактом', request_contact: true }], [{ text: '❌ Скасувати' }]],
      resize_keyboard: true
    });
    return true;
  }

  if (!requestId) {
    await sendMessage(bot, chatId, 'Не знайшли запит. Перевір посилання або звернись до менеджера.');
    return true;
  }

  if (dealerState === 'AWAIT_CONTACT' && update.message?.contact) {
    flow.contact = update.message.contact.phone_number;
    if (!flow.companyName) {
      const fallbackName = [vars.__telegramFirstName, vars.__telegramLastName].filter(Boolean).join(' ').trim();
      flow.companyName = vars.__telegramUsername ? `@${vars.__telegramUsername}` : (fallbackName || undefined);
    }
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_COMPANY';
    await saveSession();
    await sendMessage(bot, chatId, 'Дякую! Вкажіть назву компанії (або "skip" щоб пропустити):');
    return true;
  }
  if (dealerState === 'AWAIT_CONTACT' && messageTextRaw) {
    await sendMessage(bot, chatId, 'Надішли контакт кнопкою, щоб продовжити.');
    return true;
  }

  if (dealerState === 'AWAIT_COMPANY' && messageTextRaw) {
    const raw = messageTextRaw.trim();
    if (raw && raw.toLowerCase() !== 'skip') {
      flow.companyName = raw;
    }
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_TITLE';
    await saveSession();
    await sendMessage(bot, chatId, 'Яка марка/модель авто? (короткий заголовок)');
    return true;
  }

  if (dealerState === 'AWAIT_TITLE' && messageTextRaw) {
    const title = messageTextRaw.trim();
    if (title.length < 2) {
      await sendMessage(bot, chatId, 'Вкажи коротко марку/модель (мінімум 2 символи).');
      return true;
    }
    flow.title = title;
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_PHOTOS';
    await saveSession();
    await sendMessage(bot, chatId, 'Надішли фото авто (можна кілька). Після фото перейдемо до деталей.');
    return true;
  }

  if (dealerState === 'AWAIT_PHOTOS') {
    if (update.message?.photo) {
      const photo = update.message.photo[update.message.photo.length - 1];
      const list = Array.isArray(vars.dealer_photos) ? vars.dealer_photos : [];
      list.push(photo.file_id);
      vars.dealer_photos = list.slice(0, 10);
      vars.dealer_state = 'AWAIT_PRICE';
      await saveSession();
      await sendMessage(bot, chatId, `Фото отримали (${list.length}). Вкажи ціну (USD):`);
      return true;
    }
    await sendMessage(bot, chatId, 'Спочатку надішли хоча б одне фото.');
    return true;
  }

  if (dealerState === 'AWAIT_PRICE' && messageTextRaw) {
    const num = parseInt(messageTextRaw.replace(/[^\d]/g, ''), 10) || 0;
    flow.price = num;
    flow.currency = messageTextRaw.toUpperCase().includes('EUR') ? 'EUR' : 'USD';
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_YEAR';
    await saveSession();
    await sendMessage(bot, chatId, 'Рік випуску? (наприклад, 2018)');
    return true;
  }

  if (dealerState === 'AWAIT_YEAR' && messageTextRaw) {
    const yr = parseInt(messageTextRaw.replace(/[^\d]/g, ''), 10);
    if (yr && yr > 1900 && yr < 2050) flow.year = yr;
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_MILEAGE';
    await saveSession();
    await sendMessage(bot, chatId, 'Пробіг? (напр., 120 тис км або "skip")');
    return true;
  }

  if (dealerState === 'AWAIT_MILEAGE' && messageTextRaw) {
    const raw = messageTextRaw.trim();
    if (raw.toLowerCase() !== 'skip') {
      const nums = raw.match(/\d{2,}/g);
      if (nums && nums.length) {
        let val = parseInt(nums[0], 10);
        if (raw.toLowerCase().includes('к') || raw.toLowerCase().includes('k') || raw.toLowerCase().includes('тис')) {
          val *= 1000;
        } else if (val < 1000) {
          val *= 1000;
        }
        flow.mileage = val;
      }
    }
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_FUEL';
    await saveSession();
    await sendMessage(bot, chatId, 'Тип пального? (бензин/дизель/гібрид або "skip")');
    return true;
  }

  if (dealerState === 'AWAIT_FUEL' && messageTextRaw) {
    const raw = messageTextRaw.trim();
    if (raw.toLowerCase() !== 'skip') flow.fuel = raw;
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_CONDITION';
    await saveSession();
    await sendMessage(bot, chatId, 'Технічний стан? (наприклад, "гарний/після ТО" або "skip")');
    return true;
  }

  if (dealerState === 'AWAIT_CONDITION' && messageTextRaw) {
    const raw = messageTextRaw.trim();
    if (raw.toLowerCase() !== 'skip') flow.condition = raw;
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_VIN';
    await saveSession();
    await sendMessage(bot, chatId, 'VIN (або напиши "skip"):');
    return true;
  }

  if (dealerState === 'AWAIT_VIN' && messageTextRaw) {
    const vin = messageTextRaw.trim();
    if (vin.toLowerCase() !== 'skip') {
      if (vin.length >= 6) flow.vin = vin.toUpperCase();
    }
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_URL';
    await saveSession();
    await sendMessage(bot, chatId, 'URL лістингу (або "skip"):');
    return true;
  }

  if (dealerState === 'AWAIT_URL' && messageTextRaw) {
    const urlMatch = messageTextRaw.match(/https?:\/\/\S+/);
    if (urlMatch) flow.url = urlMatch[0];
    vars.dealer_flow = flow;
    vars.dealer_state = 'AWAIT_DETAILS';
    await saveSession();
    await sendMessage(bot, chatId, 'Додай короткий опис (стан/комплектація). Без контактів.');
    return true;
  }

  if (dealerState === 'AWAIT_DETAILS' && messageTextRaw) {
    if (hasContactInfo(messageTextRaw)) {
      await sendMessage(bot, chatId, 'Будь ласка, без телефонів/посилань на контакт. Додай лише інформацію про авто.');
      return true;
    }
    flow.details = messageTextRaw;
    vars.dealer_flow = flow;
    vars.dealer_state = 'CONFIRM';
    await saveSession();
    await sendMessage(bot, chatId, summaryCard(), {
      inline_keyboard: [
        [{ text: '✅ Надіслати менеджеру', callback_data: 'DEALER_SEND' }],
        [{ text: '🔄 Змінити опис', callback_data: 'DEALER_EDIT' }]
      ]
    });
    return true;
  }

  if (dealerState === 'CONFIRM' && update.callback_query) {
    const data = update.callback_query.data;
    if (data === 'DEALER_EDIT') {
      vars.dealer_state = 'AWAIT_DETAILS';
      await saveSession();
      await sendMessage(bot, chatId, 'Ок, надішли новий опис без контактів.');
      return true;
    }
    if (data === 'DEALER_SEND') {
      if (flow.url) {
        const dupUrl = await prisma.requestVariant.findFirst({ where: { requestId, sourceUrl: flow.url } });
        if (dupUrl) {
          await sendMessage(bot, chatId, 'Таке посилання вже є у варіантах. Додай інший лот.');
          return true;
        }
      }
      if (flow.vin) {
        const dupVin = await prisma.requestVariant.findFirst({
          where: { requestId, specs: { path: ['vin'], equals: flow.vin } }
        }).catch(() => null);
        if (dupVin) {
          await sendMessage(bot, chatId, 'Цей VIN вже є у варіантах. Додай інший лот.');
          return true;
        }
      }

      const mediaItems = Array.isArray(vars.dealer_photos)
        ? vars.dealer_photos.map((p: string) => ({ tgFileId: p, source: 'TELEGRAM_BOT' }))
        : [];
      const parsedDetails = parseCarData(String(flow.details || ''));
      const resolvedCurrency = flow.currency || parsedDetails.currency || 'USD';
      const resolvedPrice = flow.price || parsedDetails.price;
      const resolvedYear = flow.year || parsedDetails.year;
      const resolvedMileage = flow.mileage || parsedDetails.mileage;
      const mapped = mapVariantInput({
        title: flow.title || parsedDetails.title || flow.details?.split('\n')[0]?.slice(0, 120) || 'Пропозиція',
        url: flow.url,
        sourceUrl: flow.url,
        source: 'DEALER',
        status: 'SUBMITTED',
        specs: {
          note: flow.details,
          vin: flow.vin || parsedDetails.vin,
          fuel: flow.fuel || parsedDetails.fuel,
          condition: flow.condition || parsedDetails.condition,
          transmission: parsedDetails.transmission,
          drive: parsedDetails.drive,
          engine: parsedDetails.engine,
          color: parsedDetails.color
        },
        companyName: flow.companyName,
        contact: flow.contact,
        mediaUrls: [],
        mediaItems,
        statusHistory: [{ status: 'SUBMITTED', at: new Date().toISOString(), by: userId || chatId }],
        year: resolvedYear,
        price: resolvedPrice ? { amount: resolvedPrice, currency: resolvedCurrency } : undefined,
        mileage: resolvedMileage,
        location: parsedDetails.location || flow.city,
        thumbnail: (vars.dealer_photos || [])[0]
      });

      const variant = await prisma.requestVariant.create({
        data: {
          ...mapped,
          requestId
        }
      });

      await prisma.messageLog.create({
        data: {
          requestId,
          variantId: variant.id,
          botId: bot.id,
          chatId,
          direction: 'INCOMING',
          text: flow.details || '',
          payload: {
            photos: vars.dealer_photos || [],
            price: flow.price,
            currency: flow.currency,
            year: flow.year,
            mileage: flow.mileage,
            fuel: flow.fuel,
            condition: flow.condition,
            vin: flow.vin,
            url: flow.url
          }
        }
      }).catch(() => {
      });

      vars.dealer_state = 'DONE';
      vars.dealer_flow = {};
      await saveSession();
      await sendMessage(bot, chatId, '✅ Надіслали менеджеру! Дякуємо.');

      const request = await prisma.b2bRequest.findUnique({ where: { id: requestId } });
      const requesterChatId = request?.chatId;

      if (requesterChatId) {
        const specsWithoutContact = variant.specs ? { ...(variant.specs as any), contact: undefined, companyName: undefined } : {};
        const variantCardForRequester = renderVariantCard({
          ...variant,
          contact: undefined,
          companyName: undefined,
          specs: specsWithoutContact
        } as any);

        await sendMessage(
          bot,
          requesterChatId,
          `🚗 Новий варіант для вашого запиту "${request.title}":\n\n${variantCardForRequester}`,
          {
            inline_keyboard: [
              [
                { text: '✅ Підходить', callback_data: `B2BVAR:${variant.id}:FIT` },
                { text: '❌ Не підходить', callback_data: `B2BVAR:${variant.id}:NO` }
              ]
            ]
          }
        );
      }

      if (bot.adminChatId) {
        const caption = `📨 Новий варіант по запиту ${requestId}\n${summaryCard({ specs: { vin: flow.vin, note: flow.details } }, { includeContact: true })}`;
        if (Array.isArray(vars.dealer_photos) && vars.dealer_photos.length) {
          await telegramOutbox.sendMediaGroup({
            botId: bot.id,
            token: bot.token,
            chatId: String(bot.adminChatId),
            media: vars.dealer_photos.map((p: string, idx: number) => ({
              type: 'photo',
              media: p,
              caption: idx === 0 ? caption : undefined,
              parse_mode: 'HTML'
            })),
            companyId: bot.companyId || null
          });
          await sendMessage(bot, bot.adminChatId, 'Дії з варіантом:', managerActionsKeyboard(variant.id));
        } else {
          await sendMessage(bot, bot.adminChatId, caption, managerActionsKeyboard(variant.id));
        }
      }
      return true;
    }
  }

  return false;
};
