import { lookupAlias, normalizeValue } from './normalizationStore.js';

type Options = {
  companyId?: string | null;
  brand?: string | null;
};

const MODEL_ALIASES: Record<string, string> = {
  'x5': 'X5',
  'x6': 'X6',
  'x3': 'X3',
  'x1': 'X1',
  'gls': 'GLS',
  'gle': 'GLE',
  'c class': 'C-Class',
  'c-class': 'C-Class',
  'e class': 'E-Class',
  'e-class': 'E-Class',
  's class': 'S-Class',
  's-class': 'S-Class',
  'camry': 'Camry',
  'corolla': 'Corolla',
  'land cruiser': 'Land Cruiser',
  'landcruiser': 'Land Cruiser'
};

export const normalizeModel = async (input?: string | null, options: Options = {}) => {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();
  if (!key) return undefined;

  const alias = await lookupAlias('model', key, options);
  if (alias) return alias;

  if (MODEL_ALIASES[key]) return MODEL_ALIASES[key];

  return normalizeValue(input);
};
