import { prisma } from '../../../../../services/prisma.js';
import { generateULID } from '../../../../../utils/ulid.js';
import { b2bRegistrationService } from '../../../../../services/b2bRegistration.service.js';
import { sendMessage } from '../adapters/telegram.adapter.js';
import { promptB2BRegistration } from './b2b-registration.actions.js';
import { startFormFlow, type FormSubmission } from './form.actions.js';
import type { BotRuntime } from '../types.js';

type InventoryMode = 'MY' | 'ADD' | 'PRICE' | 'SOLD';

const clean = (value: unknown) => String(value || '').trim();
const toNumber = (value: unknown) => {
  const raw = clean(value).replace(/[^\d]/g, '');
  return raw ? Number(raw) : 0;
};

const ensureInventoryDraft = (vars: Record<string, any>) => {
  if (!vars.b2bInvDraft || typeof vars.b2bInvDraft !== 'object' || Array.isArray(vars.b2bInvDraft)) {
    vars.b2bInvDraft = {};
  }
  return vars.b2bInvDraft as Record<string, any>;
};

const resolvePartner = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
}) => {
  const tgUserId = clean(params.userId || params.vars.__telegramUserId || params.chatId);
  if (!tgUserId) return null;

  const participant = await b2bRegistrationService.resolveParticipant({
    tgUserId,
    companyId: params.bot.companyId || null
  });

  if (!participant.allowed || !participant.partnerCompany || !participant.partnerUser) {
    await promptB2BRegistration({
      bot: params.bot,
      chatId: params.chatId,
      vars: params.vars,
      reason: 'Партнерський інвентар'
    });
    return null;
  }

  params.vars.b2bPartnerId = participant.partnerCompany.id;
  params.vars.b2bPartnerName = participant.partnerCompany.name;
  params.vars.b2bPartnerRole = participant.partnerUser.role;
  params.vars.b2bPartnerUserId = participant.partnerUser.id;

  return {
    partnerId: participant.partnerCompany.id,
    partnerName: participant.partnerCompany.name || 'Партнер',
    partnerRole: String(participant.partnerUser.role || ''),
    partnerUserId: participant.partnerUser.id
  };
};

const buildInventorySummary = (cars: any[]) => {
  if (!cars.length) return 'Поки що у вашому інвентарі немає авто.';
  const lines = cars.map((car, idx) => {
    const price = Number(car.price || 0);
    const year = car.year ? ` ${car.year}` : '';
    const status = clean(car.status) || 'AVAILABLE';
    return `${idx + 1}. ${car.title}${year} • ${price.toLocaleString()} ${car.currency || 'USD'} • ${status}\nID: ${car.id}`;
  });
  return lines.join('\n\n');
};

const buildInventoryKeyboard = (cars: any[]) => {
  const rows: any[][] = [];
  cars.slice(0, 6).forEach((car, idx) => {
    rows.push([
      { text: `💲 Ціна #${idx + 1}`, callback_data: `B2BINV:PRICE:${car.id}` },
      { text: `✅ Продано #${idx + 1}`, callback_data: `B2BINV:SOLD:${car.id}` }
    ]);
  });
  rows.push([{ text: '➕ Додати авто', callback_data: 'B2BINV:ADD' }]);
  rows.push([{ text: '🔄 Оновити список', callback_data: 'B2BINV:LIST' }]);
  return { inline_keyboard: rows };
};

const sendPartnerInventory = async (params: {
  bot: BotRuntime;
  chatId: string;
  partnerId: string;
  partnerName: string;
}) => {
  const cars = await prisma.carListing.findMany({
    where: {
      companyId: params.bot.companyId || null,
      partnerCompanyId: params.partnerId,
      external: false
    },
    orderBy: { createdAt: 'desc' },
    take: 12
  });

  const text = [
    `🏢 Компанія: ${params.partnerName}`,
    '',
    '🚘 Мій інвентар:',
    buildInventorySummary(cars)
  ].join('\n');

  await sendMessage(params.bot, params.chatId, text, buildInventoryKeyboard(cars));
};

const startAddForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
}) => {
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'b2b_inventory_add',
    namespace: 'B2BINV',
    title: 'Додати авто в інвентар',
    confirmAction: 'B2BINV:ADD_SUBMIT',
    fields: [
      { key: 'brand', label: 'Марка', prompt: 'Вкажіть марку:' },
      { key: 'model', label: 'Модель', prompt: 'Вкажіть модель:' },
      { key: 'year', label: 'Рік', prompt: 'Вкажіть рік випуску:' },
      { key: 'price', label: 'Ціна', prompt: 'Вкажіть ціну (USD):' },
      { key: 'mileage', label: 'Пробіг', prompt: 'Вкажіть пробіг (км):', optional: true },
      { key: 'fuel', label: 'Пальне', prompt: 'Вкажіть тип пального:', optional: true },
      { key: 'city', label: 'Місто', prompt: 'Вкажіть місто:', optional: true },
      { key: 'comment', label: 'Коментар', prompt: 'Додайте коментар:', optional: true },
      { key: 'photos', label: 'Фото', prompt: 'Надішліть фото (необовʼязково) і натисніть "Готово".', type: 'photo', optional: true, maxPhotos: 8 }
    ]
  });
};

const startPriceByIdForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
}) => {
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'b2b_inventory_price_by_id',
    namespace: 'B2BINV',
    title: 'Змінити ціну',
    confirmAction: 'B2BINV:PRICE_BY_ID_SUBMIT',
    fields: [
      { key: 'carId', label: 'ID авто', prompt: 'Введіть ID авто:' },
      { key: 'price', label: 'Нова ціна', prompt: 'Введіть нову ціну (USD):' }
    ]
  });
};

const startSoldByIdForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
}) => {
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'b2b_inventory_sold_by_id',
    namespace: 'B2BINV',
    title: 'Позначити продано',
    confirmAction: 'B2BINV:SOLD_BY_ID_SUBMIT',
    fields: [
      { key: 'carId', label: 'ID авто', prompt: 'Введіть ID авто:' }
    ]
  });
};

const startPriceCallbackForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  vars: Record<string, any>;
  carId: string;
}) => {
  const draft = ensureInventoryDraft(params.vars);
  draft.priceCarId = params.carId;
  await startFormFlow({
    bot: params.bot,
    chatId: params.chatId,
    vars: params.vars
  }, {
    formId: 'b2b_inventory_price_cb',
    namespace: 'B2BINV',
    title: `Змінити ціну (${params.carId})`,
    confirmAction: 'B2BINV:PRICE_SUBMIT',
    fields: [
      { key: 'price', label: 'Нова ціна', prompt: 'Введіть нову ціну (USD):' }
    ]
  });
};

const markSold = async (params: {
  bot: BotRuntime;
  chatId: string;
  partnerId: string;
  carId: string;
}) => {
  const updated = await prisma.carListing.updateMany({
    where: {
      id: params.carId,
      companyId: params.bot.companyId || null,
      partnerCompanyId: params.partnerId
    },
    data: {
      status: 'SOLD'
    }
  });
  if (!updated.count) {
    await sendMessage(params.bot, params.chatId, '⚠️ Авто не знайдено або немає доступу до редагування.');
    return false;
  }
  await sendMessage(params.bot, params.chatId, '✅ Авто позначено як продане.');
  return true;
};

export const startB2BInventoryFlow = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  mode: InventoryMode;
}) => {
  const partner = await resolvePartner(params);
  if (!partner) return true;

  if (params.mode !== 'MY' && partner.partnerRole !== 'OWNER') {
    await sendMessage(params.bot, params.chatId, '⚠️ Керувати інвентарем може лише OWNER компанії.');
    return true;
  }

  if (params.mode === 'MY') {
    await sendPartnerInventory({
      bot: params.bot,
      chatId: params.chatId,
      partnerId: partner.partnerId,
      partnerName: partner.partnerName
    });
    return true;
  }

  if (params.mode === 'ADD') {
    await startAddForm(params);
    return true;
  }

  if (params.mode === 'PRICE') {
    await startPriceByIdForm(params);
    return true;
  }

  if (params.mode === 'SOLD') {
    await startSoldByIdForm(params);
    return true;
  }

  return false;
};

export const handleB2BInventoryCallback = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  callbackData: string;
}) => {
  if (!params.callbackData.startsWith('B2BINV:')) return false;

  const partner = await resolvePartner(params);
  if (!partner) return true;

  if (params.callbackData === 'B2BINV:LIST') {
    await sendPartnerInventory({
      bot: params.bot,
      chatId: params.chatId,
      partnerId: partner.partnerId,
      partnerName: partner.partnerName
    });
    return true;
  }

  if (params.callbackData === 'B2BINV:ADD') {
    if (partner.partnerRole !== 'OWNER') {
      await sendMessage(params.bot, params.chatId, '⚠️ Керувати інвентарем може лише OWNER компанії.');
      return true;
    }
    await startAddForm(params);
    return true;
  }

  if (params.callbackData.startsWith('B2BINV:PRICE:')) {
    if (partner.partnerRole !== 'OWNER') {
      await sendMessage(params.bot, params.chatId, '⚠️ Керувати інвентарем може лише OWNER компанії.');
      return true;
    }
    const carId = clean(params.callbackData.split('B2BINV:PRICE:')[1]);
    if (!carId) return true;
    await startPriceCallbackForm({
      ...params,
      carId
    });
    return true;
  }

  if (params.callbackData.startsWith('B2BINV:SOLD:')) {
    if (partner.partnerRole !== 'OWNER') {
      await sendMessage(params.bot, params.chatId, '⚠️ Керувати інвентарем може лише OWNER компанії.');
      return true;
    }
    const carId = clean(params.callbackData.split('B2BINV:SOLD:')[1]);
    if (!carId) return true;
    await markSold({
      bot: params.bot,
      chatId: params.chatId,
      partnerId: partner.partnerId,
      carId
    });
    return true;
  }

  return false;
};

export const submitB2BInventoryForm = async (params: {
  bot: BotRuntime;
  chatId: string;
  userId?: string;
  vars: Record<string, any>;
  submission: FormSubmission;
}) => {
  if (params.submission.namespace !== 'B2BINV') return false;
  if (params.submission.status === 'CANCELLED') {
    await sendMessage(params.bot, params.chatId, '❌ Дію скасовано.');
    return true;
  }

  const partner = await resolvePartner(params);
  if (!partner) return true;

  const values = params.submission.values || {};
  const confirmAction = clean(params.submission.confirmAction);
  const draft = ensureInventoryDraft(params.vars);

  if (confirmAction === 'B2BINV:ADD_SUBMIT') {
    if (partner.partnerRole !== 'OWNER') {
      await sendMessage(params.bot, params.chatId, '⚠️ Керувати інвентарем може лише OWNER компанії.');
      return true;
    }
    const brand = clean(values.brand);
    const model = clean(values.model);
    const year = toNumber(values.year);
    const price = toNumber(values.price);
    const mileage = Math.max(toNumber(values.mileage), 0);
    const fuel = clean(values.fuel);
    const city = clean(values.city);
    const comment = clean(values.comment);
    const photos = Array.isArray(values.photos) ? values.photos.map((v: unknown) => clean(v)).filter(Boolean).slice(0, 8) : [];

    if (!brand || !model || !year || !price) {
      await sendMessage(params.bot, params.chatId, '⚠️ Вкажіть марку, модель, рік і ціну.');
      await startAddForm(params);
      return true;
    }

    const title = `${brand} ${model}`.trim();
    const created = await prisma.carListing.create({
      data: {
        id: `car_${generateULID()}`,
        companyId: params.bot.companyId || null,
        partnerCompanyId: partner.partnerId,
        source: 'PARTNER_B2B',
        title,
        price,
        currency: 'USD',
        year,
        mileage: mileage || 0,
        location: city || null,
        description: comment || null,
        mediaUrls: photos,
        thumbnail: photos[0] || null,
        specs: {
          fuel: fuel || null,
          representative: clean(params.vars.__telegramUsername || params.vars.__telegramFirstName || '')
        } as any,
        status: 'AVAILABLE',
        external: false
      }
    });

    await sendMessage(params.bot, params.chatId, `✅ Авто додано в інвентар.\nID: ${created.id}`);
    await sendPartnerInventory({
      bot: params.bot,
      chatId: params.chatId,
      partnerId: partner.partnerId,
      partnerName: partner.partnerName
    });
    return true;
  }

  if (confirmAction === 'B2BINV:PRICE_SUBMIT' || confirmAction === 'B2BINV:PRICE_BY_ID_SUBMIT') {
    if (partner.partnerRole !== 'OWNER') {
      await sendMessage(params.bot, params.chatId, '⚠️ Керувати інвентарем може лише OWNER компанії.');
      return true;
    }
    const carId = confirmAction === 'B2BINV:PRICE_SUBMIT' ? clean(draft.priceCarId) : clean(values.carId);
    const price = toNumber(values.price);
    if (!carId || !price) {
      await sendMessage(params.bot, params.chatId, '⚠️ Вкажіть ID авто та нову ціну.');
      if (confirmAction === 'B2BINV:PRICE_BY_ID_SUBMIT') {
        await startPriceByIdForm(params);
      }
      return true;
    }

    const updated = await prisma.carListing.updateMany({
      where: {
        id: carId,
        companyId: params.bot.companyId || null,
        partnerCompanyId: partner.partnerId
      },
      data: { price }
    });

    if (!updated.count) {
      await sendMessage(params.bot, params.chatId, '⚠️ Авто не знайдено або немає доступу.');
      return true;
    }

    delete draft.priceCarId;
    await sendMessage(params.bot, params.chatId, '✅ Ціну оновлено.');
    return true;
  }

  if (confirmAction === 'B2BINV:SOLD_BY_ID_SUBMIT') {
    if (partner.partnerRole !== 'OWNER') {
      await sendMessage(params.bot, params.chatId, '⚠️ Керувати інвентарем може лише OWNER компанії.');
      return true;
    }
    const carId = clean(values.carId);
    if (!carId) {
      await sendMessage(params.bot, params.chatId, '⚠️ Вкажіть ID авто.');
      await startSoldByIdForm(params);
      return true;
    }
    await markSold({
      bot: params.bot,
      chatId: params.chatId,
      partnerId: partner.partnerId,
      carId
    });
    return true;
  }

  return false;
};
