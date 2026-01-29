import { ApiClient } from './apiClient';

const computeConfidence = (variables: Record<string, any>) => {
  const hasTitle = !!variables.title;
  const hasPrice = typeof variables.price === 'number' && variables.price > 0;
  const hasYear = typeof variables.year === 'number' && variables.year > 1900;
  if (hasTitle && hasPrice && hasYear) return 'high';
  if (hasTitle && (hasPrice || hasYear)) return 'medium';
  return 'low';
};

export const parseListingFromUrl = async (url: string) => {
  const res = await ApiClient.post<any>('parser/preview', { url });
  if (!res.ok) throw new Error(res.message || 'Parse failed');

  const payload = res.data || {};
  const variables = payload.variables || {};
  const images = Array.isArray(payload.images) ? payload.images : [];

  return {
    url: payload.url || url,
    title: variables.title,
    price: variables.price,
    currency: variables.currency,
    year: variables.year,
    mileage: variables.mileage,
    location: variables.location,
    variables,
    confidence: computeConfidence(variables),
    raw: {
      meta: payload.meta,
      images,
      mapping: payload.cachedMapping,
      variables
    }
  };
};

export const saveParserProfile = async (domain: string, selectors: any) => {
  const res = await ApiClient.post<any>('parser/mapping', { domain, mapping: selectors, remember: true });
  if (!res.ok) throw new Error(res.message || 'Save failed');
  return res.data;
};
