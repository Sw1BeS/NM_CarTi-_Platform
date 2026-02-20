import { VariantStatus, RequestStatus } from '@prisma/client';

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

export const renderVariantCard = (variant: any, opts: { includeContact?: boolean } = {}) => {
  const priceObj = variant.price && typeof variant.price === 'object' ? variant.price : { amount: variant.price };
  const price = priceObj?.amount ? Number(priceObj.amount) : 0;
  const currency = priceObj?.currency || variant.currency || 'USD';
  const companyName = variant.companyName || variant.company || variant.specs?.companyName;
  const contact = variant.contact || variant.specs?.contact;
  const fuel = variant.specs?.fuel;
  const condition = variant.specs?.condition;
  const transmission = variant.specs?.transmission;
  const drive = variant.specs?.drive;
  const engine = variant.specs?.engine;
  const color = variant.specs?.color;
  const note = truncateText(variant.specs?.note);
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
    variant.sourceUrl ? `🔗 ${variant.sourceUrl}` : null,
    note ? `📝 ${note}` : null,
    opts.includeContact && companyName ? `🏢 ${companyName}` : null,
    opts.includeContact && contact ? `📞 ${contact}` : null
  ].filter(Boolean);
  return parts.join('\n');
};

export const renderRequestCard = (req: any, opts: { includeContact?: boolean } = {}) => {
  const payload = req?.payload || {};
  const payloadReq = payload?.request || {};
  const companyName = req?.companyName || payload?.companyName || payloadReq?.companyName;
  const contact = req?.contact || payload?.contact || payloadReq?.contact || payloadReq?.phone || payload?.phone;

  const mileageMin = payloadReq?.mileageMin ?? payload?.mileageMin;
  const mileageMax = payloadReq?.mileageMax ?? payload?.mileageMax;
  const mileageText = payloadReq?.mileageText ?? payload?.mileageText;
  const fuel = payloadReq?.fuel ?? payload?.fuel;

  const mileagePart = mileageText
    ? `🛣 ${mileageText}`
    : (mileageMin || mileageMax)
      ? `🛣 ${formatMileage(mileageMin || mileageMax)}${mileageMax && mileageMin && mileageMax !== mileageMin ? ` - ${formatMileage(mileageMax)}` : ''}`
      : null;

  const budgetPart = req.budgetMin || req.budgetMax
    ? `💰 ${req.budgetMin ? req.budgetMin.toLocaleString() : '0'} - ${req.budgetMax ? req.budgetMax.toLocaleString() : '∞'} ${req.currency || 'USD'}`
    : null;
  const parts = [
    `📄 <b>${req.title || 'Запит'}</b>`,
    budgetPart,
    req.yearMin ? `📅 ${req.yearMin}+` : null,
    mileagePart,
    fuel ? `⛽ ${fuel}` : null,
    req.city ? `📍 ${req.city}` : null,
    req.description ? `📝 ${req.description}` : null,
    opts.includeContact && companyName ? `🏢 ${companyName}` : null,
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
      { text: '✅ Approve', callback_data: `VARIANT:${variantId}:APPROVE` },
      { text: '❌ Reject', callback_data: `VARIANT:${variantId}:REJECT` }
    ],
    [
      { text: '📤 Send to client', callback_data: `VARIANT:${variantId}:SEND_TO_CLIENT` },
      { text: 'ℹ️ More info', callback_data: `VARIANT:${variantId}:MORE` }
    ]
  ]
});
