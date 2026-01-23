export const normalizeCurrency = (val?: string) => {
  if (!val) return undefined;
  const upper = val.toUpperCase();
  if (upper.includes('USD') || upper.includes('$')) return 'USD';
  if (upper.includes('EUR') || upper.includes('€')) return 'EUR';
  if (upper.includes('UAH') || upper.includes('₴')) return 'UAH';
  return upper.slice(0, 3);
};

export const parsePrice = (priceText?: string): { amount?: number; currency?: string } => {
  if (!priceText) return {};
  const clean = priceText.replace(/[\s,]+/g, '');
  const amountMatch = clean.match(/(\d+)/);
  const amount = amountMatch ? Number(amountMatch[1]) : undefined;

  let currency = undefined;
  if (priceText.includes('$') || priceText.toLowerCase().includes('usd')) currency = 'USD';
  else if (priceText.includes('€') || priceText.toLowerCase().includes('eur')) currency = 'EUR';
  else if (priceText.includes('₴') || priceText.toLowerCase().includes('uah')) currency = 'UAH';

  return { amount, currency };
};

export const parseMileage = (text?: string): number | undefined => {
  if (!text) return undefined;
  // Remove spaces, "km", "miles"
  const clean = text.toLowerCase().replace(/[\s,]/g, '').replace('km', '').replace('mi', '');
  const match = clean.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
};
