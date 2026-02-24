/**
 * urlParser.ts
 * Thin adapter over the canonical external HTML search pipeline
 * (modules/Integrations/external-search/*).
 *
 * Guarantees (implemented in canonical pipeline):
 * - robots.txt policy per provider/domain
 * - rate limit <= 1 rps/domain
 * - exponential backoff on 403/429
 * - cache window 30-60 minutes by filter key
 */

import { externalSearchService } from '../modules/Integrations/external-search/externalSearch.service.js';
import { parseListingFromUrl } from './parser.js';

type SearchFilter = {
  brand?: string;
  model?: string;
  city?: string;
  yearMin?: number;
  budgetMin?: number;
  budgetMax?: number;
  mileageMax?: number;
  fuel?: string;
  companyId?: string;
};

const toCanonicalListings = (items: any[]) => {
  return (items || []).map((item) => ({
    canonicalId: item.id,
    sourceId: item.id,
    source: item.sourceProvider || item.source || 'EXTERNAL',
    sourceUrl: item.sourceUrl,
    title: item.title,
    price: { amount: item.price || 0, currency: item.currency || 'USD' },
    year: item.year || 0,
    mileage: item.mileage || 0,
    location: item.location || '',
    thumbnail: item.thumbnail || '',
    mediaUrls: Array.isArray(item.mediaUrls) ? item.mediaUrls : [],
    specs: item.specs || {},
    status: item.status || 'HIDDEN',
    postedAt: new Date().toISOString(),
    _provider: item.sourceProvider || item.source || 'EXTERNAL'
  }));
};

const runSearch = async (filter: SearchFilter, maxResults = 6) => {
  const criteria = {
    brand: filter.brand,
    model: filter.model,
    city: filter.city,
    yearMin: filter.yearMin,
    budgetMax: filter.budgetMax || filter.budgetMin,
    mileageMax: filter.mileageMax,
    fuel: filter.fuel
  };

  const listings = await externalSearchService.searchAndPersist(criteria, {
    companyId: filter.companyId || null,
    maxResults
  });

  return listings;
};

export const parseAutoRiaListing = async (url: string): Promise<any | null> => {
  if (!String(url).includes('auto.ria.com')) return null;
  const parsed = await parseListingFromUrl(url);
  if (!parsed?.title) return null;
  return {
    canonicalId: `autoria_${Date.now()}`,
    sourceId: parsed.url,
    source: 'AUTO_RIA',
    sourceUrl: parsed.url,
    title: parsed.title,
    price: { amount: parsed.price || 0, currency: parsed.currency || 'USD' },
    year: parsed.year || 0,
    mileage: parsed.mileage || 0,
    location: parsed.location || '',
    thumbnail: parsed.thumbnail || '',
    mediaUrls: [],
    specs: parsed.raw || {},
    status: 'AVAILABLE',
    postedAt: new Date().toISOString()
  };
};

export const parseOlxListing = async (url: string): Promise<any | null> => {
  if (!String(url).includes('olx.ua')) return null;
  const parsed = await parseListingFromUrl(url);
  if (!parsed?.title) return null;
  return {
    canonicalId: `olx_${Date.now()}`,
    sourceId: parsed.url,
    source: 'OLX',
    sourceUrl: parsed.url,
    title: parsed.title,
    price: { amount: parsed.price || 0, currency: parsed.currency || 'USD' },
    year: parsed.year || 0,
    mileage: parsed.mileage || 0,
    location: parsed.location || '',
    thumbnail: parsed.thumbnail || '',
    mediaUrls: [],
    specs: parsed.raw || {},
    status: 'AVAILABLE',
    postedAt: new Date().toISOString()
  };
};

export const searchAutoRia = async (filter: SearchFilter): Promise<any[]> => {
  const items = await runSearch(filter, 8);
  return toCanonicalListings(items.filter((item) => item.sourceProvider === 'AUTO_RIA'));
};

export const searchOlx = async (filter: SearchFilter): Promise<any[]> => {
  const items = await runSearch(filter, 8);
  return toCanonicalListings(items.filter((item) => item.sourceProvider === 'OLX'));
};

export const searchExternal = async (filter: SearchFilter): Promise<{ results: any[]; errors: string[] }> => {
  try {
    const items = await runSearch(filter, 8);
    return {
      results: toCanonicalListings(items),
      errors: []
    };
  } catch (error: any) {
    return {
      results: [],
      errors: [error?.message || 'external_search_failed']
    };
  }
};
