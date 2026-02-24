import { VariantStatus, RequestStatus } from '@prisma/client';
import { ActionTokens, buildCallbackData } from '../modules/Communication/telegram/core/utils/callbackUtils.js';

// =============================================================================
// §4 — EXACT CARD FORMATS (hard output contract from MEGA PROMPT v7)
// =============================================================================

const dash = (v: any) => (v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : '—');

/**
 * §4 Lead user car card (HTML)
 * Used in bot when showing inventory matches to client.
 */
export const renderLeadBuyCard = (car: any): string => {
  const rawTitle = String(car.title || '').trim();
  const yearStr = car.year ? String(car.year) : '';
  // Extract brand/model from title or dedicated fields
  const brand = String((car as any).brand || car.specs?.brand || '').trim();
  const model = String((car as any).model || car.specs?.model || '').trim();
  const titleDisplay = brand && model ? `${brand} ${model} ${yearStr}`.trim()
    : model ? `${model} ${yearStr}`.trim()
      : `${rawTitle} ${yearStr}`.trim().replace(/\s+/g, ' ');

  const mileageNum = Number(car.mileage || 0);
  const mileageStr = mileageNum > 0
    ? (mileageNum >= 1000 ? `${Math.round(mileageNum / 1000)} тис. км` : `${mileageNum} км`)
    : '—';

  const price = car.price?.amount ?? car.price ?? 0;
  const currency = car.price?.currency || car.currency || 'USD';

  return [
    `🚗 <b>${titleDisplay}</b>`,
    `🛣 Пробіг: ${mileageStr}`,
    `⛽ Паливо: ${dash(car.specs?.fuel)}`,
    `🕹 КПП: ${dash(car.specs?.transmission)}`,
    `🛞 Привід: ${dash(car.specs?.drive)}`,
    `📍 Місто: ${dash(car.location)}`,
    `💵 Ціна: ${price ? price.toLocaleString('uk-UA') : '—'} ${currency}`
  ].join('\n');
};

/**
 * §4 Inline buttons under each lead buy car card.
 * isFavorited — whether user already starred this car.
 */
export const buildLeadBuyCardButtons = (carId: string, isFavorited: boolean, idx = 0) => ({
  inline_keyboard: [
    [
      { text: '✅ Цікавить це авто', callback_data: buildCallbackData(ActionTokens.LB_INTEREST, String(idx)) },
      isFavorited
        ? { text: '🗑 Прибрати з обраного', callback_data: buildCallbackData(ActionTokens.LB_FAV_DEL, String(idx)) }
        : { text: '⭐ В обране', callback_data: buildCallbackData(ActionTokens.LB_FAV_TOGGLE, String(idx)) }
    ]
  ]
});

/**
 * §4 After-batch control message buttons.
 * favCount — number of favorites currently saved.
 */
export const buildAfterBatchControls = (favCount: number) => {
  const rows: any[][] = [
    [{ text: 'Показати ще', callback_data: buildCallbackData(ActionTokens.LB_NEXT) }]
  ];
  if (favCount > 0) {
    rows.push([
      { text: `⭐ Обране (${favCount})`, callback_data: buildCallbackData(ActionTokens.LB_FAV_OPEN) },
      { text: 'Звʼязатися по обраному', callback_data: buildCallbackData(ActionTokens.LB_FAV_SEND) }
    ]);
  }
  rows.push([
    { text: 'Змінити фільтри', callback_data: buildCallbackData(ActionTokens.LB_EDIT) },
    { text: 'Завершити', callback_data: buildCallbackData(ActionTokens.LB_CANCEL) }
  ]);
  return { inline_keyboard: rows };
};

/**
 * §4 B2B channel request post (NO contacts).
 * Returns { text, replyMarkup } — text has no phone numbers or personal links.
 */
export const renderB2bChannelPost = (request: any): { text: string; replyMarkup: any } => {
  const payload = (request?.payload || {}) as Record<string, any>;
  const reqPayload = (payload.request || {}) as Record<string, any>;

  const companyName = String(reqPayload.companyName || payload.companyName || 'Невідома компанія');
  const publicId = request.publicId || request.id || '?';

  const titleParts = [request.title || reqPayload.brand || reqPayload.make, reqPayload.model].filter(Boolean);
  const titleLine = titleParts.join(' ') || '—';

  const yearMin = request.yearMin || reqPayload.yearMin;
  const yearMax = request.yearMax || reqPayload.yearMax;
  const yearLine = yearMin
    ? `${yearMin}${yearMax && yearMax !== yearMin ? `–${yearMax}` : '+'}`
    : '—';

  const budgetMin = request.budgetMin || reqPayload.budgetMin;
  const budgetMax = request.budgetMax || reqPayload.budgetMax;
  const budgetLine = budgetMax
    ? `${budgetMin ? `${budgetMin.toLocaleString()}–` : 'до '}${budgetMax.toLocaleString()} USD`
    : budgetMin ? `від ${budgetMin.toLocaleString()} USD` : '—';

  const mileageLine = reqPayload.mileageText || reqPayload.mileageMax
    ? (reqPayload.mileageText || `до ${reqPayload.mileageMax} км`)
    : '—';

  const fuelLine = reqPayload.fuel || payload.fuel || '—';
  const noteLine = String(request.description || reqPayload.comment || '—').slice(0, 200);

  const text = [
    `🔵 <b>Запит #${publicId}</b>`,
    `🚗 ${titleLine}`,
    `📅 Рік: ${yearLine}`,
    `💰 Бюджет: ${budgetLine}`,
    `🛣 Пробіг: ${mileageLine}`,
    `⛽ Паливо: ${fuelLine}`,
    `📝 Примітка: ${noteLine}`,
    `🏢 Хто шукає: ${companyName}`
  ].join('\n');

  const replyMarkup = {
    inline_keyboard: [[
      { text: 'Є авто', callback_data: buildCallbackData(ActionTokens.BV_SEND, String(request.publicId || request.id).slice(0, 28)) }
    ]]
  };
  return { text, replyMarkup };
};

/**
 * §4 CarTié channel car post template (channel publication style).
 */
export const renderChannelCarPost = (car: any): string => {
  const rawTitle = String(car.title || '').trim();
  const yearStr = car.year ? String(car.year) : '';
  const titleDisplay = `${rawTitle} ${yearStr}`.trim().replace(/\s+/g, ' ');

  const statusTag = String(car.status || 'AVAILABLE').toUpperCase();
  const statusText: Record<string, string> = {
    AVAILABLE: 'в наявності', RESERVED: 'резерв', SOLD: 'продано', PENDING: 'очікування'
  };

  const mileageNum = Number(car.mileage || 0);
  const mileageTxt = mileageNum > 0
    ? (mileageNum >= 1000 ? `${Math.round(mileageNum / 1000)} тис. км` : `${mileageNum} км`)
    : '—';

  const powerOrBattery = car.specs?.engine || car.specs?.battery || '—';
  const safety = car.specs?.safety || car.specs?.airbags || '—';
  const driveTxt = car.specs?.drive || '—';
  const damageTxt = car.specs?.damage || car.specs?.condition || 'не вказано';
  const runTag = car.specs?.runs === false ? '❌ не на ходу' : '✅ на ходу';

  const price = car.price?.amount ?? car.price ?? 0;

  return [
    `🇺🇸<b>${titleDisplay}</b>`,
    `⏳#${statusTag} (${statusText[statusTag] || statusTag})`,
    '',
    `${runTag}`,
    `🚙 пробіг ${mileageTxt}`,
    `🔥 ${powerOrBattery}`,
    `✔️ ${safety}`,
    `🚙 ${driveTxt}`,
    `🛠 Пошкодження: ${damageTxt}`,
    '',
    `💵 Ціна за розмитнене авто у Львові: ${price ? price.toLocaleString('uk-UA') : '—'}$`,
    `<i>*ціна може змінюватися залежно від курсу та доставки</i>`
  ].join('\n');
};

// =============================================================================
// Existing renderers (unchanged below)
// =============================================================================


const formatMileage = (value: number) => {
  if (!Number.isFinite(value)) return '';
  if (value >= 1000) return `${Math.round(value / 1000)}k km`;
  return `${value} km`;
};

const truncateText = (value?: string, max = 220) => {
  if (!value) return '';
  const clean = String(value).trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}…`;
};

const contactLineKeywords = [
  'контакт',
  'contact',
  'телефон',
  'phone',
  'telegram',
  'телеграм',
  'whatsapp',
  'viber',
  't.me/',
  'tg://'
];

const redactSensitiveText = (value?: string, includeContact = false) => {
  if (!value) return '';
  const text = String(value).trim();
  if (!text || includeContact) return text;

  const redactedLines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();
      return !contactLineKeywords.some((keyword) => lower.includes(keyword));
    })
    .map((line) =>
      line
        .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[hidden]')
        .replace(/@[a-zA-Z0-9_]{4,}/g, '@hidden')
        .replace(/https?:\/\/(?:t\.me|wa\.me)\/\S+/gi, '[hidden-link]')
    );

  return redactedLines.join('\n').trim();
};

export const renderVariantCard = (variant: any, opts: { includeContact?: boolean; includeCompany?: boolean } = {}) => {
  const priceObj = variant.price && typeof variant.price === 'object' ? variant.price : { amount: variant.price };
  const price = priceObj?.amount ? Number(priceObj.amount) : 0;
  const currency = priceObj?.currency || variant.currency || 'USD';
  const companyName = variant.companyName || variant.company || variant.specs?.companyName;
  const representative = variant.specs?.representative || variant.representative;
  const contact = variant.contact || variant.specs?.contact;
  const fuel = variant.specs?.fuel;
  const condition = variant.specs?.condition;
  const transmission = variant.specs?.transmission;
  const drive = variant.specs?.drive;
  const engine = variant.specs?.engine;
  const color = variant.specs?.color;
  const note = truncateText(redactSensitiveText(variant.specs?.note, Boolean(opts.includeContact)));
  const sourceUrl = redactSensitiveText(variant.sourceUrl, Boolean(opts.includeContact));
  const includeCompany = Boolean(opts.includeCompany || opts.includeContact);
  const parts = [
    `🚗 <b>${(variant.title || 'Варіант').toUpperCase()}</b>`,
    price ? `💰 ${price.toLocaleString()} ${currency}` : null,
    variant.year ? `📅 ${variant.year}` : null,
    variant.mileage ? `🛣 ${formatMileage(variant.mileage)}` : null,
    engine ? `⚙️ ${engine}` : null,
    fuel ? `⛽ ${fuel}` : null,
    transmission ? `🕹 ${transmission}` : null,
    drive ? `🛞 ${drive}` : null,
    color ? `🎨 ${color}` : null,
    condition ? `🛠 ${condition}` : null,
    variant.location ? `📍 ${variant.location}` : null,
    variant.specs?.vin ? `🔑 VIN: ${variant.specs.vin}` : null,
    sourceUrl ? `🔗 ${sourceUrl}` : null,
    note ? `📝 ${note}` : null,
    includeCompany && companyName ? `🏢 Компанія: ${companyName}` : null,
    includeCompany && representative ? `👤 Представник: ${representative}` : null,
    opts.includeContact && contact ? `📞 ${contact}` : null
  ].filter(Boolean);
  return parts.join('\n');
};

export const renderRequestCard = (req: any, opts: { includeContact?: boolean; includeCompany?: boolean } = {}) => {
  const payload = req?.payload || {};
  const payloadReq = payload?.request || {};
  const companyName = req?.companyName || payload?.companyName || payloadReq?.companyName;
  const representative = payload?.representative || payloadReq?.representative;
  const contact = req?.contact || payload?.contact || payloadReq?.contact || payloadReq?.phone || payload?.phone;

  const mileageMin = payloadReq?.mileageMin ?? payload?.mileageMin;
  const mileageMax = payloadReq?.mileageMax ?? payload?.mileageMax;
  const mileageText = payloadReq?.mileageText ?? payload?.mileageText;
  const fuel = payloadReq?.fuel ?? payload?.fuel;
  const description = redactSensitiveText(req.description, Boolean(opts.includeContact));

  const mileagePart = mileageText
    ? `🛣 ${mileageText}`
    : (mileageMin || mileageMax)
      ? `🛣 ${formatMileage(mileageMin || mileageMax)}${mileageMax && mileageMin && mileageMax !== mileageMin ? ` - ${formatMileage(mileageMax)}` : ''}`
      : null;

  const budgetPart = req.budgetMin || req.budgetMax
    ? `💰 ${req.budgetMin ? req.budgetMin.toLocaleString() : '0'} - ${req.budgetMax ? req.budgetMax.toLocaleString() : '∞'} ${req.currency || 'USD'}`
    : null;
  const includeCompany = Boolean(opts.includeCompany || opts.includeContact);
  const parts = [
    `📄 <b>${req.title || 'Запит'}</b>`,
    budgetPart,
    req.yearMin ? `📅 ${req.yearMin}+` : null,
    mileagePart,
    fuel ? `⛽ ${fuel}` : null,
    req.city ? `📍 ${req.city}` : null,
    description ? `📝 ${description}` : null,
    includeCompany && companyName ? `🏢 Компанія: ${companyName}` : null,
    includeCompany && representative ? `👤 Представник: ${representative}` : null,
    opts.includeContact && contact ? `📞 ${contact}` : null,
    req.publicId ? `ID: ${req.publicId}` : null
  ].filter(Boolean);
  return parts.join('\n');
};

export const renderLeadCard = (lead: any) => {
  const parts = [
    `🙋‍♂️ <b>${lead.clientName || 'Клієнт'}</b>`,
    lead.phone ? `📞 ${lead.phone}` : null,
    lead.request ? `🚗 ${lead.request}` : null,
    lead.payload?.city ? `📍 ${lead.payload.city}` : null,
    lead.payload?.budget ? `💰 ${lead.payload.budget}` : null
  ].filter(Boolean);
  return parts.join('\n');
};


export const renderCarListingCard = (car: any, lang: string = 'EN') => {
  const t = {
    EN: { mileage: 'km', vin: 'VIN' },
    UK: { mileage: 'км', vin: 'VIN' },
    RU: { mileage: 'км', vin: 'VIN' }
  } as const;

  const loc = t[lang as keyof typeof t] || t.EN;
  const rawTitle = car.title || '';
  const yearStr = car.year ? String(car.year) : '';
  const titleNoYear = rawTitle.replace(/\b(19|20)\d{2}\b/g, '').replace(/\s+/g, ' ').trim();
  const header = [titleNoYear, yearStr].filter(Boolean).join(' ').trim();

  const parts: string[] = [`🚗 <b>${(header || rawTitle).toUpperCase()}</b>`];
  if (car.mileage) parts.push(`🛣 ${Math.round(car.mileage / 1000)} ${loc.mileage}`);
  if (car.specs?.engine) parts.push(`⚙️ ${car.specs.engine}`);
  if (car.specs?.fuel) parts.push(`⛽ ${car.specs.fuel}`);
  if (car.specs?.drive) parts.push(`🛞 ${car.specs.drive}`);
  if (car.specs?.transmission) parts.push(`🕹 ${car.specs.transmission}`);
  if (car.location) parts.push(`📍 ${car.location}`);
  if (car.specs?.condition) parts.push(`🛠 ${car.specs.condition}`);
  if (car.specs?.vin) parts.push(`🔑 ${loc.vin}: ${car.specs.vin}`);

  const priceObj = car.price && typeof car.price === 'object' ? car.price : { amount: car.price };
  if (priceObj?.amount) parts.push(`💰 ${priceObj.amount.toLocaleString()} ${priceObj.currency || 'USD'}`);

  return parts.join('\n').trim();
};

export const managerActionsKeyboard = (variantId: string) => ({
  inline_keyboard: [
    [
      { text: '✅ Підтвердити', callback_data: `VARIANT:${variantId}:APPROVE` },
      { text: '❌ Відхилити', callback_data: `VARIANT:${variantId}:REJECT` }
    ],
    [
      { text: '📤 Надіслати клієнту', callback_data: `VARIANT:${variantId}:SEND_TO_CLIENT` },
      { text: 'ℹ️ Деталі', callback_data: `VARIANT:${variantId}:MORE` }
    ]
  ]
});
