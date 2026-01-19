import { VariantStatus, RequestStatus } from '@prisma/client';

export const renderVariantCard = (variant: any) => {
  const priceObj = variant.price && typeof variant.price === 'object' ? variant.price : { amount: variant.price };
  const price = priceObj?.amount ? Number(priceObj.amount) : 0;
  const currency = priceObj?.currency || variant.currency || 'USD';
  const parts = [
    `🚗 <b>${(variant.title || 'Варіант').toUpperCase()}</b>`,
    price ? `💰 ${price.toLocaleString()} ${currency}` : null,
    variant.year ? `📅 ${variant.year}` : null,
    variant.mileage ? `🛣 ${Math.round(variant.mileage / 1000)}k km` : null,
    variant.location ? `📍 ${variant.location}` : null,
    variant.specs?.vin ? `🔑 VIN: ${variant.specs.vin}` : null,
    variant.sourceUrl ? `🔗 ${variant.sourceUrl}` : null
  ].filter(Boolean);
  return parts.join('\n');
};

export const renderRequestCard = (req: any) => {
  const budgetPart = req.budgetMin || req.budgetMax
    ? `💰 ${req.budgetMin ? req.budgetMin.toLocaleString() : '0'} - ${req.budgetMax ? req.budgetMax.toLocaleString() : '∞'} ${req.currency || 'USD'}`
    : null;
  const parts = [
    `📄 <b>${req.title || 'Запит'}</b>`,
    budgetPart,
    req.yearMin ? `📅 ${req.yearMin}+` : null,
    req.city ? `📍 ${req.city}` : null,
    req.description ? `📝 ${req.description}` : null,
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
