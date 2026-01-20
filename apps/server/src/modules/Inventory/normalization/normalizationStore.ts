import { prisma } from '../../../services/prisma.js';

type AliasType = 'brand' | 'model' | 'city';

type LookupOptions = {
  companyId?: string | null;
};

const fetchAlias = async (type: AliasType, key: string, companyId?: string | null) => {
  if (companyId) {
    const specific = await prisma.normalizationAlias.findFirst({
      where: {
        type,
        companyId,
        alias: { equals: key, mode: 'insensitive' }
      }
    });
    if (specific) return specific.canonical;
  }
  const global = await prisma.normalizationAlias.findFirst({
    where: {
      type,
      companyId: null,
      alias: { equals: key, mode: 'insensitive' }
    }
  });
  return global?.canonical || undefined;
};

const normalizeKey = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

export const lookupAlias = async (type: AliasType, value: string, options: LookupOptions = {}) => {
  const clean = normalizeKey(value);
  if (!clean) return undefined;
  return fetchAlias(type, clean, options.companyId);
};

export const normalizeValue = (value: string) =>
  value.trim().replace(/\s+/g, ' ');
