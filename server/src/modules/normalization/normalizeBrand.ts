import { lookupAlias, normalizeValue } from './normalizationStore.js';

type Options = {
  companyId?: string | null;
};

const BRAND_ALIASES: Record<string, string> = {
  'бмв': 'BMW',
  'bmw': 'BMW',
  'мерседес': 'Mercedes-Benz',
  'мерседес бенц': 'Mercedes-Benz',
  'мерседес-бенц': 'Mercedes-Benz',
  'mercedes': 'Mercedes-Benz',
  'mercedes benz': 'Mercedes-Benz',
  'mercedes-benz': 'Mercedes-Benz',
  'ауди': 'Audi',
  'audi': 'Audi',
  'тойота': 'Toyota',
  'toyota': 'Toyota',
  'фольксваген': 'Volkswagen',
  'vw': 'Volkswagen',
  'volkswagen': 'Volkswagen',
  'хонда': 'Honda',
  'honda': 'Honda',
  'лексус': 'Lexus',
  'lexus': 'Lexus',
  'мазда': 'Mazda',
  'mazda': 'Mazda'
};

export const normalizeBrand = async (input?: string | null, options: Options = {}) => {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();
  if (!key) return undefined;

  const alias = await lookupAlias('brand', key, options);
  if (alias) return alias;

  if (BRAND_ALIASES[key]) return BRAND_ALIASES[key];

  return normalizeValue(input);
};
