import * as cheerio from 'cheerio';
import type {
  ExternalSearchCandidate,
  ExternalSearchContext,
  ExternalSearchCriteria,
  ExternalSearchProvider,
  ExternalSearchProviderResult
} from '../externalSearch.service.js';

const cleanText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

const slugify = (value: string) => {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized;
};

const toAbsolute = (href: string) => {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `https://www.olx.ua${href}`;
  return `https://www.olx.ua/${href}`;
};

const parsePrice = (text: string) => {
  const amount = Number((text || '').replace(/[^\d]/g, '')) || 0;
  const lower = (text || '').toLowerCase();
  if (lower.includes('грн') || lower.includes('uah')) return { amount, currency: 'UAH' };
  if (lower.includes('eur') || lower.includes('€')) return { amount, currency: 'EUR' };
  return { amount, currency: 'USD' };
};

const extractYear = (text: string) => {
  const match = (text || '').match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
};

const extractMileage = (text: string) => {
  const thousandMatch = (text || '').match(/(\d{2,3})\s*(?:тис|тыс|k)\s*(?:км|km)?/i);
  if (thousandMatch) return Number(thousandMatch[1]) * 1000;
  const directMatch = (text || '').match(/(\d{4,6})\s*(?:км|km)/i);
  if (directMatch) return Number(directMatch[1]);
  return 0;
};

const passesCriteria = (candidate: ExternalSearchCandidate, criteria: ExternalSearchCriteria) => {
  if (criteria.yearMin && candidate.year && candidate.year < criteria.yearMin) return false;
  if (criteria.budgetMax && candidate.price > 0 && candidate.price > criteria.budgetMax) return false;
  if (criteria.mileageMax && candidate.mileage > 0 && candidate.mileage > criteria.mileageMax) return false;
  return true;
};

const isLikelyBlocked = (html: string) => {
  const lower = (html || '').toLowerCase();
  return lower.includes('captcha') || lower.includes('access denied') || lower.includes('robot');
};

const parseOlxListingPage = (url: string, html: string): ExternalSearchCandidate | null => {
  const $ = cheerio.load(html);
  const bodyText = cleanText($('body').text());

  const title = cleanText($('h1').first().text()) || cleanText($('meta[property="og:title"]').attr('content'));
  if (!title) return null;

  const priceRaw = cleanText($('[data-testid="ad-price-container"]').first().text())
    || cleanText($('meta[property="product:price:amount"]').attr('content'))
    || cleanText($('meta[itemprop="price"]').attr('content'));

  const parsedPrice = parsePrice(priceRaw);
  const city = cleanText($('[data-testid="location-date"]').first().text()) || '';

  const images = Array.from(new Set([
    cleanText($('meta[property="og:image"]').attr('content')),
    ...$('img').map((_, el) => cleanText($(el).attr('src') || $(el).attr('data-src'))).get()
  ].filter((src) => src.startsWith('http')))).slice(0, 8);

  return {
    sourceProvider: 'OLX',
    sourceUrl: url,
    title,
    price: parsedPrice.amount,
    currency: parsedPrice.currency,
    city,
    year: extractYear(bodyText),
    mileage: extractMileage(bodyText),
    photos: images,
    rawText: bodyText
  };
};

export const buildOlxSearchUrl = (criteria: ExternalSearchCriteria) => {
  const terms = [criteria.brand, criteria.model].filter(Boolean).map((x) => cleanText(x));
  const query = slugify(terms.join('-'));
  if (!query) return '';
  return `https://www.olx.ua/uk/transport/legkovi-avtomobili/q-${query}/`;
};

export class OlxHtmlProvider implements ExternalSearchProvider {
  readonly key = 'OLX' as const;

  getSearchUrl(criteria: ExternalSearchCriteria) {
    return buildOlxSearchUrl(criteria);
  }

  async ingestUrl(ctx: ExternalSearchContext, url: string) {
    const html = await ctx.fetchHtml(url);
    return parseOlxListingPage(url, html);
  }

  async search(ctx: ExternalSearchContext, criteria: ExternalSearchCriteria): Promise<ExternalSearchProviderResult> {
    const searchUrl = this.getSearchUrl(criteria);
    if (!searchUrl) return { items: [], blocked: false };

    const html = await ctx.fetchHtml(searchUrl);

    if (isLikelyBlocked(html)) {
      if (criteria.sourceUrl) {
        try {
          const ingested = await this.ingestUrl(ctx, criteria.sourceUrl);
          if (ingested && passesCriteria(ingested, criteria)) {
            return { items: [ingested], blocked: true };
          }
        } catch {
          // no-op
        }
      }
      return { items: [], blocked: true };
    }

    const $ = cheerio.load(html);

    const cards = $('a[href*="/d/"]')
      .map((_, element) => {
        const href = toAbsolute(cleanText($(element).attr('href')));
        if (!href.includes('/d/')) return null;

        const card = $(element).closest('article, div[data-cy="l-card"], li, div');
        const title = cleanText(card.find('h4, h5, h6').first().text()) || cleanText($(element).text()) || 'Авто';
        const priceText = cleanText(card.find('[data-testid="ad-price"], [data-testid="ad-price-container"]').first().text());
        const locationText = cleanText(card.find('[data-testid="location-date"]').first().text());
        const image = cleanText(card.find('img').first().attr('src') || card.find('img').first().attr('data-src'));
        const rawText = cleanText(card.text());
        const price = parsePrice(priceText);

        const candidate: ExternalSearchCandidate = {
          sourceProvider: 'OLX',
          sourceUrl: href,
          title,
          price: price.amount,
          currency: price.currency,
          city: locationText,
          year: extractYear(rawText),
          mileage: extractMileage(rawText),
          photos: image ? [image] : [],
          rawText
        };

        return candidate;
      })
      .get()
      .filter((item): item is ExternalSearchCandidate => Boolean(item));

    const uniqueByUrl = new Map<string, ExternalSearchCandidate>();
    for (const item of cards) {
      if (!uniqueByUrl.has(item.sourceUrl)) uniqueByUrl.set(item.sourceUrl, item);
      if (uniqueByUrl.size >= 20) break;
    }

    const filtered = Array.from(uniqueByUrl.values()).filter((item) => passesCriteria(item, criteria));

    return {
      items: filtered.slice(0, ctx.maxResults),
      blocked: false
    };
  }
}
