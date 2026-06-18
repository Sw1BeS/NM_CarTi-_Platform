export const normalizeTaxonomyLabel = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ');

const idOverrides: Record<string, string> = {
  'інша марка': 'other',
  'інша модель': 'other',
  'інше': 'other',
  'other': 'other',
  'plug-in гібрид': 'plug-in-hybrid',
  'повний': 'awd',
  'передній': 'fwd',
  'задній': 'rwd',
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
