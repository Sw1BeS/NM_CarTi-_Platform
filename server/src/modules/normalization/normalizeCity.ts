import { lookupAlias, normalizeValue } from './normalizationStore.js';

type Options = {
  companyId?: string | null;
};

const CITY_ALIASES: Record<string, string> = {
  'київ': 'Kyiv',
  'киев': 'Kyiv',
  'kiev': 'Kyiv',
  'kyiv': 'Kyiv',
  'львів': 'Lviv',
  'львов': 'Lviv',
  'lviv': 'Lviv',
  'одеса': 'Odesa',
  'одесса': 'Odesa',
  'odessa': 'Odesa',
  'odesa': 'Odesa',
  'дніпро': 'Dnipro',
  'днепр': 'Dnipro',
  'dnipro': 'Dnipro',
  'kharkiv': 'Kharkiv',
  'харьков': 'Kharkiv',
  'харків': 'Kharkiv'
};

export const normalizeCity = async (input?: string | null, options: Options = {}) => {
  if (!input) return undefined;
  const key = input.trim().toLowerCase();
  if (!key) return undefined;

  const alias = await lookupAlias('city', key, options);
  if (alias) return alias;

  if (CITY_ALIASES[key]) return CITY_ALIASES[key];

  return normalizeValue(input);
};
