import crypto from 'node:crypto';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../services/prisma.js';
import { logger } from '../../../utils/logger.js';
import { externalCache } from './policy/cache.js';
import { externalDomainRateLimiter } from './policy/domainRateLimiter.js';
import { withBackoff } from './policy/backoff.js';
import { isRobotsAllowed } from './policy/robotsPolicy.js';
import { AutoriaHtmlProvider } from './providers/autoriaHtml.provider.js';
import { OlxHtmlProvider } from './providers/olxHtml.provider.js';

export type ExternalProviderKey = 'AUTO_RIA' | 'OLX';

export type ExternalSearchCriteria = {
  brand?: string;
  model?: string;
  city?: string;
  yearMin?: number;
  budgetMax?: number;
  mileageMax?: number;
  fuel?: string;
  sourceUrl?: string;
};

export type ExternalSearchCandidate = {
  sourceProvider: ExternalProviderKey;
  sourceUrl: string;
  title: string;
  price: number;
  currency: string;
  city?: string;
  year: number;
  mileage: number;
  photos: string[];
  rawText?: string;
};

export type ExternalSearchProviderResult = {
  items: ExternalSearchCandidate[];
  blocked: boolean;
};

export type ExternalSearchContext = {
  maxResults: number;
  fetchHtml: (url: string) => Promise<string>;
};

export interface ExternalSearchProvider {
  readonly key: ExternalProviderKey;
  getSearchUrl: (criteria: ExternalSearchCriteria) => string;
  search: (ctx: ExternalSearchContext, criteria: ExternalSearchCriteria) => Promise<ExternalSearchProviderResult>;
}

export type ExternalSearchListing = {
  id: string;
  source: string;
  sourceProvider: ExternalProviderKey;
  sourceUrl: string;
  title: string;
  price: number;
  currency: string;
  year: number;
  mileage: number;
  location: string;
  thumbnail: string;
  mediaUrls: string[];
  specs: Record<string, unknown>;
  status: string;
  external: true;
};

const SEARCH_CACHE_TTL_MS = 45 * 60 * 1000;
const USER_AGENT = 'CartieBot/1.0 (+https://cartie.local)';
const logExternalEvent = (event: string, meta: Record<string, unknown> = {}) => {
  // Observability must stay PII-safe: provider/state/count only (no contacts, no user payload).
  logger.info(`[external-search] ${event}`, meta);
};

const cleanText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const toNum = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const normalizeCriteria = (criteria: ExternalSearchCriteria): ExternalSearchCriteria => ({
  brand: cleanText(criteria.brand),
  model: cleanText(criteria.model),
  city: cleanText(criteria.city),
  fuel: cleanText(criteria.fuel),
  sourceUrl: cleanText(criteria.sourceUrl),
  yearMin: toNum(criteria.yearMin) || undefined,
  budgetMax: toNum(criteria.budgetMax) || undefined,
  mileageMax: toNum(criteria.mileageMax) || undefined
});

const stableExternalId = (provider: ExternalProviderKey, sourceUrl: string) => {
  const digest = crypto.createHash('sha1').update(`${provider}|${sourceUrl}`).digest('hex').slice(0, 20);
  return `ext_${provider.toLowerCase()}_${digest}`;
};

const sanitizePhotos = (value: unknown) => {
  const source = Array.isArray(value) ? value : [];
  return Array.from(
    new Set(
      source
        .map((item) => cleanText(item))
        .filter((item) => item.startsWith('http://') || item.startsWith('https://'))
    )
  ).slice(0, 10);
};

const sanitizeCurrency = (value: unknown) => {
  const raw = cleanText(value).toUpperCase();
  if (!raw) return 'USD';
  if (['USD', 'EUR', 'UAH'].includes(raw)) return raw;
  if (raw.includes('ГРН') || raw.includes('UAH')) return 'UAH';
  return 'USD';
};

const sanitizeCandidate = (candidate: ExternalSearchCandidate): ExternalSearchCandidate | null => {
  const sourceUrl = cleanText(candidate.sourceUrl);
  const title = cleanText(candidate.title);
  if (!sourceUrl || !title) return null;

  return {
    sourceProvider: candidate.sourceProvider,
    sourceUrl,
    title,
    price: Math.max(0, Math.round(toNum(candidate.price))),
    currency: sanitizeCurrency(candidate.currency),
    city: cleanText(candidate.city),
    year: Math.max(0, Math.round(toNum(candidate.year))),
    mileage: Math.max(0, Math.round(toNum(candidate.mileage))),
    photos: sanitizePhotos(candidate.photos),
    rawText: cleanText(candidate.rawText)
  };
};

const buildCacheKey = (provider: ExternalProviderKey, criteria: ExternalSearchCriteria, maxResults: number) => {
  return `external:search:${provider}:${JSON.stringify(criteria)}:${maxResults}`;
};

class ExternalSearchService {
  private providers: ExternalSearchProvider[] = [
    new AutoriaHtmlProvider(),
    new OlxHtmlProvider()
  ];

  private disabledProviders = new Set<ExternalProviderKey>();

  private async fetchHtml(url: string) {
    await externalDomainRateLimiter.waitTurn(url);

    const response = await withBackoff(() => axios.get<string>(url, {
      timeout: 15000,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
        Accept: 'text/html,application/xhtml+xml'
      },
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 500
    }));

    if (!response || response.status >= 400) {
      const error = new Error(`HTTP_${response?.status || 'UNKNOWN'}`) as Error & { status?: number };
      error.status = response?.status;
      throw error;
    }

    return typeof response.data === 'string' ? response.data : String(response.data || '');
  }

  private async runProvider(
    provider: ExternalSearchProvider,
    criteria: ExternalSearchCriteria,
    maxResults: number
  ): Promise<ExternalSearchCandidate[]> {
    logExternalEvent('provider_start', {
      provider: provider.key,
      maxResults
    });

    const searchUrl = provider.getSearchUrl(criteria);
    if (!searchUrl) return [];

    const robots = await isRobotsAllowed(searchUrl);
    if (!robots.allowed) {
      this.disabledProviders.add(provider.key);
      logExternalEvent('provider_disabled_by_robots', {
        provider: provider.key,
        reason: robots.reason
      });
      return [];
    }

    const cacheKey = buildCacheKey(provider.key, criteria, maxResults);
    const result = await externalCache.getOrSet(cacheKey, SEARCH_CACHE_TTL_MS, async () => {
      const output = await provider.search({
        maxResults,
        fetchHtml: (url: string) => this.fetchHtml(url)
      }, criteria);
      return output;
    });

    if (result.blocked) {
      logger.warn('[external-search] provider blocked/dynamic page', { provider: provider.key });
    }

    logExternalEvent('provider_done', {
      provider: provider.key,
      count: result.items?.length || 0,
      blocked: Boolean(result.blocked)
    });

    return (result.items || [])
      .map((item) => sanitizeCandidate(item))
      .filter((item): item is ExternalSearchCandidate => Boolean(item));
  }

  private async upsertCandidate(candidate: ExternalSearchCandidate, companyId?: string | null): Promise<ExternalSearchListing | null> {
    const existing = await prisma.carListing.findFirst({
      where: {
        sourceProvider: candidate.sourceProvider,
        sourceUrl: candidate.sourceUrl
      },
      select: { id: true }
    });

    const payload = {
      source: `EXTERNAL_${candidate.sourceProvider}`,
      sourceProvider: candidate.sourceProvider,
      external: true,
      sourceUrl: candidate.sourceUrl,
      title: candidate.title,
      price: candidate.price,
      currency: candidate.currency,
      year: candidate.year || 0,
      mileage: candidate.mileage || 0,
      location: candidate.city || null,
      thumbnail: candidate.photos[0] || null,
      mediaUrls: candidate.photos,
      specs: {
        city: candidate.city || undefined,
        rawText: candidate.rawText || undefined
      } as Prisma.InputJsonValue,
      status: 'HIDDEN',
      companyId: companyId || null,
      postedAt: new Date()
    };

    const record = existing
      ? await prisma.carListing.update({
          where: { id: existing.id },
          data: payload
        })
      : await prisma.carListing.create({
          data: {
            id: stableExternalId(candidate.sourceProvider, candidate.sourceUrl),
            ...payload
          }
        }).catch(async () => {
          // Rare ID collision fallback.
          return prisma.carListing.create({
            data: {
              id: `${stableExternalId(candidate.sourceProvider, candidate.sourceUrl)}_${Math.random().toString(36).slice(2, 8)}`,
              ...payload
            }
          });
        });

    if (!record) return null;

    return {
      id: record.id,
      source: record.source,
      sourceProvider: candidate.sourceProvider,
      sourceUrl: record.sourceUrl || candidate.sourceUrl,
      title: record.title,
      price: record.price,
      currency: record.currency,
      year: record.year,
      mileage: record.mileage,
      location: record.location || '',
      thumbnail: record.thumbnail || '',
      mediaUrls: record.mediaUrls || [],
      specs: (record.specs as Record<string, unknown>) || {},
      status: record.status,
      external: true
    };
  }

  async searchAndPersist(
    rawCriteria: ExternalSearchCriteria,
    opts: { companyId?: string | null; maxResults?: number } = {}
  ): Promise<ExternalSearchListing[]> {
    const criteria = normalizeCriteria(rawCriteria);
    const maxResults = Math.max(1, Math.min(12, Number(opts.maxResults || 6)));

    if (!criteria.brand) return [];

    const candidates: ExternalSearchCandidate[] = [];

    for (const provider of this.providers) {
      if (this.disabledProviders.has(provider.key)) continue;
      if (candidates.length >= maxResults) break;

      try {
        const chunk = await this.runProvider(provider, criteria, maxResults - candidates.length);
        if (chunk.length > 0) {
          candidates.push(...chunk);
          logExternalEvent('provider_results', {
            provider: provider.key,
            count: chunk.length
          });
        }
      } catch (error: any) {
        logger.warn('[external-search] provider failed', {
          provider: provider.key,
          error: error?.message || String(error)
        });
      }
    }

    const deduped = new Map<string, ExternalSearchCandidate>();
    for (const item of candidates) {
      const key = `${item.sourceProvider}|${item.sourceUrl}`;
      if (!deduped.has(key)) deduped.set(key, item);
      if (deduped.size >= maxResults) break;
    }

    const saved: ExternalSearchListing[] = [];
    for (const item of deduped.values()) {
      const persisted = await this.upsertCandidate(item, opts.companyId || null);
      if (persisted) saved.push(persisted);
    }

    logExternalEvent('search_completed', {
      providersTotal: this.providers.length,
      providersDisabled: this.disabledProviders.size,
      candidates: candidates.length,
      deduped: deduped.size,
      persisted: saved.length
    });

    return saved;
  }
}

export const externalSearchService = new ExternalSearchService();
