export const normalizeTaxonomyLabel = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ');

const idOverrides: Record<string, string> = {
  'інша марка': 'other',
  'інша модель': 'other',
  'інше': 'other',
  'other': 'other',
  'plug-in гібрид': 'plug-in-hybrid',
  'electric': 'електро',
  'ev': 'електро',
  'diesel': 'дизель',
  'gasoline': 'бензин',
  'petrol': 'бензин',
  'hybrid': 'гібрид',
  'automatic': 'автомат',
  'auto': 'автомат',
  'manual': 'механіка',
  'sedan': 'седан',
  'coupe': 'купе',
  'liftback': 'ліфтбек',
  'pickup': 'пікап',
  'convertible': 'кабріолет',
  'cabriolet': 'кабріолет',
  'позашляховик / кросовер': 'suv',
  'внедорожник / кроссовер': 'suv',
  'suv': 'suv',
  'crossover': 'suv',
  'cross-over': 'suv',
  'повний': 'awd',
  'awd': 'awd',
  '4wd': 'awd',
  'передній': 'fwd',
  'fwd': 'fwd',
  'задній': 'rwd',
  'rwd': 'rwd',
  'вся україна': 'all-ukraine',
  'під замовлення': 'import-to-order'
};

export const vehicleTaxonomyId = (label: unknown) => {
  const normalized = normalizeTaxonomyLabel(label).toLowerCase();
  if (idOverrides[normalized]) return idOverrides[normalized];
  return normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9а-яіїєґ]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
};
