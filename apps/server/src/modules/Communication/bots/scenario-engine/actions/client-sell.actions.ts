import { prisma } from '../../../../../services/prisma.js';
// @ts-ignore
import { createOrMergeLead } from '../../../telegram/core/leadService.js';
import { telegramOutbox } from '../../../telegram/messaging/outbox/telegramOutbox.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import { sendCarCardWithMedia } from './car-card.actions.js';
import { startFormFlow, type FormSubmission } from './form.actions.js';
import type { BotRuntime } from '../types.js';

type LeadSellDraft = {
  brand: string;
  model: string;
  year: number;
  mileage?: number;
  fuel?: string;
  condition?: string;
  price?: number;
  vin?: string;
  city?: string;
  photos: string[];
  contact: string;
};

const cleanText = (value: unknown) => String(value || '').trim();
const toNum = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const buildSellCaption = (draft: LeadSellDraft) => {
  const lines = [
    '[LEAD SELL]',
    `🚗 ${draft.brand} ${draft.model}`.trim(),
    `📅 Рік: ${draft.year || '—'}`,
    draft.mileage ? `🛣 Пробіг: ${draft.mileage}` : '',
    draft.fuel ? `⛽ Пальне: ${draft.fuel}` : '',
    draft.condition ? `🛠 Стан/пошкодження: ${draft.condition}` : '',
    draft.price ? `💰 Ціна: ${draft.price}` : '',
    draft.vin ? `🔑 VIN: ${draft.vin}` : '',
    draft.city ? `📍 Місто: ${draft.city}` : '',
    `📞 Контакт: ${draft.contact}`
  ].filter(Boolean);

  return lines.join('\n');
};

const adminActions = (leadId: string) => ({
  inline_keyboard: [
    [{ text: '✅ Зберегти в інвентар', callback_data: `LEADSELL:SAVE:${leadId}` }],
    [{ text: '📢 Опублікувати в канал CarTié', callback_data: `LEADSELL:PUBLISH_CARTIE:${leadId}` }],
    [{ text: '🤝 Опублікувати в CarDealer Lviv', callback_data: `LEADSELL:PUBLISH_B2B:${leadId}` }],
    [{ text: '🔁 Створити B2B-запит', callback_data: `LEADSELL:CREATE_B2B:${leadId}` }]
  ]
});

const toCard = (draft: LeadSellDraft, leadId: string) => ({
  canonicalId: `lead_sell_${leadId}`,
  source: 'LEAD_SELL',
  sourceUrl: `lead://sell/${leadId}`,
  title: `${draft.brand} ${draft.model}`.trim(),
  price: { amount: draft.price || 0, currency: 'USD' },
  year: draft.year || 0,
  mileage: draft.mileage || 0,
  location: draft.city || '',
  thumbnail: draft.photos[0] || '',
  mediaUrls: draft.photos,
  specs: {
    fuel: draft.fuel,
    condition: draft.condition,
    vin: draft.vin
  },
  status: 'PENDING'
});

const createOrUpdateInventoryFromLead = async (params: {
  leadId: string;
  companyId?: string | null;
  draft: LeadSellDraft;
}) => {
  const id = `lead_sell_${params.leadId}`;

  const data = {
    source: 'LEAD_SELL',
    sourceUrl: `lead://sell/${params.leadId}`,
    title: `${params.draft.brand} ${params.draft.model}`.trim(),
    price: params.draft.price || 0,
    currency: 'USD',
    year: params.draft.year || 0,
    mileage: params.draft.mileage || 0,
    location: params.draft.city || null,
    thumbnail: params.draft.photos[0] || null,
    mediaUrls: params.draft.photos,
    specs: {
      fuel: params.draft.fuel || undefined,
      condition: params.draft.condition || undefined,
      vin: params.draft.vin || undefined,
      sourceLeadId: params.leadId
    },
    description: params.draft.condition || null,
    status: 'AVAILABLE',
    companyId: params.companyId || null,
    postedAt: new Date()
  };

  const existing = await prisma.carListing.findUnique({ where: { id } });
  if (existing) {
    return prisma.carListing.update({ where: { id }, data });
  }

  return prisma.carListing.create({
    data: {
      id,
      ...data
    }
  });
};

const extractSellDraft = (lead: any): LeadSellDraft | null => {
  const payload = (lead?.payload && typeof lead.payload === 'object' && !Array.isArray(lead.payload))
    ? lead.payload
    : {};
  const draft = (payload as any).sellDraft;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;

  const brand = cleanText(draft.brand);
  const model = cleanText(draft.model);
  const year = toNum(draft.year) || 0;
  const contact = cleanText(draft.contact);
  const photos = Array.isArray(draft.photos) ? draft.photos.map((x: unknown) => cleanText(x)).filter(Boolean) : [];
  if (!brand || !model || !year || !contact || photos.length === 0) return null;

  return {
    brand,
    model,
    year,
    mileage: toNum(draft.mileage),
    fuel: cleanText(draft.fuel) || undefined,
    condition: cleanText(draft.condition) || undefined,
    price: toNum(draft.price),
    vin: cleanText(draft.vin) || undefined,
    city: cleanText(draft.city) || undefined,
    photos,
    contact
  };
};

const runIdempotent = async (params: {
  bot: BotRuntime;
  chatId: string;
  leadId: string;
  action: string;
  run: () => Promise<void>;
}) => {
  const key = `leadsell:${params.action}:${params.leadId}`;
  const existing = await prisma.integrationEventLog.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    await sendMessage(params.bot, params.chatId, 'ℹ️ Ця дія вже виконана раніше.');
    return true;
  }

  try {
    await params.run();

    await prisma.integrationEventLog.create({
      data: {
        companyId: params.bot.companyId || null,
        integration: 'telegram',
        entityType: 'lead_sell',
        entityId: params.leadId,
        action: `lead_sell.${params.action}`,
        status: 'SUCCESS',
        idempotencyKey: key,
        message: `Lead sell action ${params.action} executed`
      }
    });

    return true;
  } catch (error: any) {
    await prisma.integrationEventLog.create({
      data: {
        companyId: params.bot.companyId || null,
        integration: 'telegram',
        entityType: 'lead_sell',
        entityId: params.leadId,
        action: `lead_sell.${params.action}`,
        status: 'FAILED',
        message: error?.message || String(error)
      }
    }).catch(() => null);

    throw error;
  }
};

export const startLeadSellFlow = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
}) => {
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'lead_sell_form',
    namespace: 'LEADSELL',
    title: 'Продати авто',
    confirmAction: 'LEADSELL:FORM_SUBMIT',
    fields: [
      { key: 'brand', label: 'Марка', prompt: 'Вкажіть марку авто:', type: 'text' },
      { key: 'model', label: 'Модель', prompt: 'Вкажіть модель авто:', type: 'text' },
      { key: 'year', label: 'Рік', prompt: 'Вкажіть рік авто:', type: 'text' },
      { key: 'mileage', label: 'Пробіг', prompt: 'Пробіг (або Пропустити):', type: 'text', optional: true },
      { key: 'fuel', label: 'Пальне', prompt: 'Тип пального (або Пропустити):', type: 'text', optional: true },
      { key: 'condition', label: 'Стан/пошкодження', prompt: 'Стан/пошкодження (або Пропустити):', type: 'text', optional: true },
      { key: 'price', label: 'Ціна', prompt: 'Ціна (або Пропустити):', type: 'text', optional: true },
      { key: 'vin', label: 'VIN', prompt: 'VIN (або Пропустити):', type: 'text', optional: true },
      { key: 'city', label: 'Місто', prompt: 'Місто (або Пропустити):', type: 'text', optional: true },
      { key: 'photos', label: 'Фото', prompt: 'Надішліть фото (мінімум 1), після завершення натисніть "Готово".', type: 'photo', minPhotos: 1, maxPhotos: 10 },
      { key: 'contact', label: 'Контакт', prompt: 'Поділіться контактом або введіть номер телефону:', type: 'contact' }
    ]
  });
};

export const submitLeadSellForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  submission: FormSubmission;
}) => {
  if (params.submission.namespace !== 'LEADSELL') return false;

  if (params.submission.status === 'CANCELLED') {
    await sendMessage(params.bot, params.chatId, 'Сценарій продажу скасовано.');
    return true;
  }

  const values = params.submission.values || {};
  const draft: LeadSellDraft = {
    brand: cleanText(values.brand),
    model: cleanText(values.model),
    year: toNum(values.year) || 0,
    mileage: toNum(values.mileage),
    fuel: cleanText(values.fuel) || undefined,
    condition: cleanText(values.condition) || undefined,
    price: toNum(values.price),
    vin: cleanText(values.vin) || undefined,
    city: cleanText(values.city) || undefined,
    photos: Array.isArray(values.photos) ? values.photos.map((x: unknown) => cleanText(x)).filter(Boolean) : [],
    contact: cleanText(values.contact)
  };

  if (!draft.brand || !draft.model || !draft.year || !draft.contact || draft.photos.length === 0) {
    await sendMessage(params.bot, params.chatId, '⚠️ Перевірте обовʼязкові поля: марка, модель, рік, фото, контакт.');
    return true;
  }

  const leadResult = await createOrMergeLead({
    botId: params.bot.id,
    companyId: params.bot.companyId || null,
    chatId: params.chatId,
    userId: params.userId,
    name: `User ${params.chatId}`,
    phone: draft.contact,
    request: `${draft.brand} ${draft.model}`.trim(),
    source: 'TELEGRAM',
    payload: {
      sellDraft: draft
    },
    leadType: 'SELL',
    createRequest: false
  }, params.bot.config);

  const leadId = leadResult?.lead?.id;
  if (!leadId || !params.bot.adminChatId) {
    await sendMessage(params.bot, params.chatId, '✅ Заявку отримано. Менеджер скоро звʼяжеться з вами.');
    return true;
  }

  const caption = buildSellCaption(draft);
  if (draft.photos.length > 1) {
    await telegramOutbox.sendMediaGroup({
      botId: params.bot.id,
      token: params.bot.token,
      chatId: String(params.bot.adminChatId),
      media: draft.photos.map((photo, index) => ({
        type: 'photo',
        media: photo,
        caption: index === 0 ? caption : undefined,
        parse_mode: 'HTML'
      })),
      companyId: params.bot.companyId || null
    }).catch(() => null);

    await sendMessage(params.bot, String(params.bot.adminChatId), 'Дії по заявці [LEAD SELL]:', adminActions(leadId));
  } else {
    await telegramOutbox.sendPhoto({
      botId: params.bot.id,
      token: params.bot.token,
      chatId: String(params.bot.adminChatId),
      photo: draft.photos[0],
      caption,
      replyMarkup: adminActions(leadId),
      companyId: params.bot.companyId || null
    }).catch(async () => {
      await sendMessage(params.bot, String(params.bot.adminChatId), caption, adminActions(leadId));
    });
  }

  await sendMessage(params.bot, params.chatId, '✅ Дякуємо! Заявку на продаж отримано.');
  return true;
};

export const handleLeadSellCallback = async (params: {
  bot: BotRuntime;
  chatId: string;
  callbackData: string;
}) => {
  if (!params.callbackData.startsWith('LEADSELL:')) return false;

  const adminChatId = String(params.bot.adminChatId || '').trim();
  if (!adminChatId || params.chatId !== adminChatId) {
    await sendMessage(params.bot, params.chatId, '⚠️ Дія доступна лише адміну.');
    return true;
  }

  const [, action, leadIdRaw] = params.callbackData.split(':');
  const leadId = cleanText(leadIdRaw);
  if (!action || !leadId) return true;

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    await sendMessage(params.bot, params.chatId, '⚠️ Lead не знайдено.');
    return true;
  }

  const draft = extractSellDraft(lead);
  if (!draft) {
    await sendMessage(params.bot, params.chatId, '⚠️ Дані авто у lead відсутні або неповні.');
    return true;
  }

  if (action === 'SAVE') {
    await runIdempotent({
      bot: params.bot,
      chatId: params.chatId,
      leadId,
      action,
      run: async () => {
        await createOrUpdateInventoryFromLead({
          leadId,
          companyId: params.bot.companyId || null,
          draft
        });
        await sendMessage(params.bot, params.chatId, '✅ Авто збережено в інвентар.');
      }
    });
    return true;
  }

  if (action === 'PUBLISH_CARTIE') {
    await runIdempotent({
      bot: params.bot,
      chatId: params.chatId,
      leadId,
      action,
      run: async () => {
        const destination = cleanText(params.bot.channelId);
        if (!destination) {
          await sendMessage(params.bot, params.chatId, '⚠️ У бота не налаштовано канал CarTié.');
          return;
        }

        await sendCarCardWithMedia({
          bot: params.bot,
          chatId: destination,
          car: toCard(draft, leadId),
          lang: 'UK'
        });

        await sendMessage(params.bot, params.chatId, '✅ Опубліковано в канал CarTié.');
      }
    });
    return true;
  }

  if (action === 'PUBLISH_B2B') {
    await runIdempotent({
      bot: params.bot,
      chatId: params.chatId,
      leadId,
      action,
      run: async () => {
        const b2bBot = await prisma.botConfig.findFirst({
          where: {
            companyId: params.bot.companyId || undefined,
            template: 'B2B',
            isEnabled: true,
            channelId: { not: null }
          },
          orderBy: { createdAt: 'asc' }
        });

        if (!b2bBot?.channelId) {
          await sendMessage(params.bot, params.chatId, '⚠️ B2B канал не налаштовано.');
          return;
        }

        await sendCarCardWithMedia({
          bot: {
            id: b2bBot.id,
            token: b2bBot.token,
            companyId: b2bBot.companyId,
            channelId: b2bBot.channelId,
            adminChatId: b2bBot.adminChatId,
            config: b2bBot.config
          },
          chatId: String(b2bBot.channelId),
          car: toCard(draft, leadId),
          lang: 'UK'
        });

        await sendMessage(params.bot, params.chatId, '✅ Опубліковано в CarDealer Lviv.');
      }
    });
    return true;
  }

  if (action === 'CREATE_B2B') {
    await runIdempotent({
      bot: params.bot,
      chatId: params.chatId,
      leadId,
      action,
      run: async () => {
        const created = await prisma.b2bRequest.create({
          data: {
            title: `${draft.brand} ${draft.model}`.trim(),
            description: `[LEAD SELL]\n${draft.condition || ''}`.trim(),
            budgetMax: draft.price || null,
            yearMin: draft.year || null,
            city: draft.city || null,
            type: 'SELL',
            status: 'COLLECTING_VARIANTS',
            chatId: lead.userTgId || null,
            language: 'UK',
            publicId: `SELL-${Date.now().toString(36).toUpperCase()}`,
            companyId: params.bot.companyId || null,
            botId: params.bot.id,
            leadId: lead.id,
            payload: {
              source: 'lead_sell_admin_action',
              contact: draft.contact,
              photos: draft.photos,
              vin: draft.vin || undefined
            }
          }
        });

        await sendMessage(params.bot, params.chatId, `✅ B2B-запит створено: ${created.publicId || created.id}`);
      }
    });
    return true;
  }

  return true;
};
