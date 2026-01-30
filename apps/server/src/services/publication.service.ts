import { prisma } from './prisma.js';
import { renderCarListingCard } from './cardRenderer.js';

const cleanTag = (value: string) => value.replace(/[^a-zA-Z0-9]/g, '');
const toStringSafe = (value: any) => (value === null || value === undefined ? '' : String(value));
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const renderTemplateBody = (template: string, variables: Record<string, any>) => {
  let result = template || '';
  Object.entries(variables || {}).forEach(([key, value]) => {
    const safeVal = toStringSafe(value);
    const placeholder = new RegExp(`\\{${escapeRegExp(key)}\\}`, 'g');
    result = result.replace(placeholder, safeVal);
  });
  return result.replace(/\n\s*\n/g, '\n\n').trim();
};

export const buildCarVariables = (car: any, lang: string = 'UK') => {
  if (!car) return {};
  const rawTitle = car.title || '';
  const parts = rawTitle.split(' ').filter(Boolean);
  const brandRaw = parts[0] || '';
  const modelRaw = parts.slice(1).join(' ');
  const brand = cleanTag(brandRaw);
  const model = cleanTag(modelRaw);
  const hashtagYear = car.year ? `#y${car.year}` : '';
  const hashtags = ['#cartie', brand ? `#${brand}` : '', model ? `#${model}` : '', hashtagYear].filter(Boolean).join(' ');

  const specsObj = car.specs || {};
  const specsList: string[] = [];
  if (specsObj.engine) specsList.push(`⛽ ${specsObj.engine}`);
  if (specsObj.transmission) specsList.push(`🕹 ${specsObj.transmission}`);
  if (specsObj.fuel) specsList.push(`⛽ ${specsObj.fuel}`);
  const specs = specsList.join(' | ');

  const priceObj = car.price && typeof car.price === 'object' ? car.price : { amount: car.price, currency: car.currency };
  const amount = priceObj?.amount ? Number(priceObj.amount) : 0;
  const currency = priceObj?.currency || car.currency || 'USD';

  return {
    car: renderCarListingCard(car, lang),
    title: rawTitle,
    brand,
    model,
    price: amount ? amount.toLocaleString() : '',
    currency,
    year: car.year || '',
    mileage: car.mileage ? Math.round(Number(car.mileage) / 1000) : '',
    location: car.location || '',
    link: car.sourceUrl || '',
    specs,
    hashtags,
    hashtag_year: hashtagYear
  };
};

export const resolveTemplateBody = async (templateId?: string, template?: string, companyId?: string | null) => {
  if (template && template.trim()) return template;
  if (!templateId) throw new Error('Template is required');

  const where: any = { id: templateId };
  if (companyId) {
    where.OR = [{ companyId }, { companyId: null }];
  }

  const tpl = await prisma.template.findFirst({ where });
  if (!tpl) throw new Error('Template not found');
  return tpl.body;
};

export const buildTemplateVariables = async (params: {
  carId?: string;
  variables?: Record<string, any>;
  lang?: string;
}) => {
  const base: any = {};
  if (params.carId) {
    const car = await prisma.carListing.findUnique({ where: { id: params.carId } });
    if (car) Object.assign(base, buildCarVariables(car, params.lang));
  }
  return { ...base, ...(params.variables || {}) };
};

export const previewTemplate = async (params: {
  templateId?: string;
  template?: string;
  companyId?: string | null;
  carId?: string;
  variables?: Record<string, any>;
  lang?: string;
}) => {
  const body = await resolveTemplateBody(params.templateId, params.template, params.companyId);
  const variables = await buildTemplateVariables({
    carId: params.carId,
    variables: params.variables,
    lang: params.lang
  });
  const text = renderTemplateBody(body, variables);
  return { text, variables };
};
