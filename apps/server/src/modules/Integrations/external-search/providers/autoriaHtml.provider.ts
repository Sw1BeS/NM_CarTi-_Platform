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
  if (href.startsWith('/')) return `https://auto.ria.com${href}`;
  return `https://auto.ria.com/${href}`;
};

const parsePrice = (text: string) => {
  const priceMatch = text.replace(/\s+/g, '').match(/(\d[\d\s.,]{2,})/);
  if (!priceMatch) return { amount: 0, currency: 'USD' };
  const amount = Number(priceMatch[1].replace(/[^\d]/g, '')) || 0;
  const lower = text.toLowerCase();
  if (lower.includes('грн') || lower.includes('uah')) return { amount, currency: 'UAH' };
  if (lower.includes('eur') || lower.includes('€')) return { amount, currency: 'EUR' };
  return { amount, currency: 'USD' };
};

const extractYear = (text: string) => {
  const match = text.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
};

const extractMileage = (text: string) => {
  const thousandMatch = text.match(/(\d{2,3})\s*(?:тис|тыс|k)\s*(?:км|km)?/i);
  if (thousandMatch) return Number(thousandMatch[1]) * 1000;
  const directMatch = text.match(/(\d{4,6})\s*(?:км|km)/i);
  if (directMatch) return Number(directMatch[1]);
  return 0;
};

const includesFuel = (text: string, fuelRaw?: string) => {
  const fuel = cleanText(fuelRaw).toLowerCase();
  if (!fuel) return true;
  const source = text.toLowerCase();
  if (!source) return true;

  const aliases: Record<string, string[]> = {
    diesel: ['diesel', 'дизель'],
    бензин: ['бензин', 'petrol', 'gasoline'],
    electric: ['electric', 'електро', 'ev'],
    hybrid: ['hybrid', 'гібрид', 'гибрид'],
    газ: ['газ', 'lpg']
  };

  const matched = Object.entries(aliases).find(([key, list]) => key.includes(fuel) || list.some(item => item.includes(fuel)));
  if (!matched) return source.includes(fuel);
  return matched[1].some(token => source.includes(token));
};

const passesCriteria = (candidate: ExternalSearchCandidate, criteria: ExternalSearchCriteria) => {
  if (criteria.yearMin && candidate.year && candidate.year < criteria.yearMin) return false;
  if (criteria.budgetMax && candidate.price > 0 && candidate.price > criteria.budgetMax) return false;
  if (criteria.mileageMax && candidate.mileage > 0 && candidate.mileage > criteria.mileageMax) return false;
  if (!includesFuel(candidate.rawText || '', criteria.fuel)) return false;
  return true;
};

export const buildAutoriaSearchUrl = (criteria: ExternalSearchCriteria) => {
  const brandSlug = slugify(criteria.brand || '');
  if (!brandSlug) return '';

  const modelSlug = slugify(criteria.model || '');
  const citySlug = slugify(criteria.city || '');

  const segments = ['https://auto.ria.com', 'uk', 'car', brandSlug];
  if (modelSlug) segments.push(modelSlug);
  if (citySlug) segments.push('city', citySlug);

  return `${segments.join('/')}/`;
};

const hydrateListing = async (
  ctx: ExternalSearchContext,
  candidate: ExternalSearchCandidate
): Promise<ExternalSearchCandidate> => {
  try {
    const html = await ctx.fetchHtml(candidate.sourceUrl);
    const $ = cheerio.load(html);
    const bodyText = cleanText($('body').text());

    const title = candidate.title || cleanText($('h1').first().text()) || candidate.title;
    const ogImage = cleanText($('meta[property="og:image"]').attr('content'));
    const rawPrice = cleanText($('meta[itemprop="price"]').attr('content'));
    const price = rawPrice ? Number(rawPrice.replace(/[^\d]/g, '')) || candidate.price : candidate.price;

    const fallbackImages = $('img')
      .map((_, el) => cleanText($(el).attr('src') || $(el).attr('data-src')))
      .get()
      .filter((src) => src.startsWith('http'))
      .slice(0, 6);

    return {
      ...candidate,
      title,
      price,
      photos: Array.from(new Set([ogImage, ...fallbackImages].filter(Boolean))).slice(0, 8),
      year: candidate.year || extractYear(bodyText),
      mileage: candidate.mileage || extractMileage(bodyText),
      rawText: `${candidate.rawText || ''} ${bodyText}`.trim()
    };
  } catch {
    return candidate;
  }
};

export class AutoriaHtmlProvider implements ExternalSearchProvider {
  readonly key = 'AUTO_RIA' as const;

  getSearchUrl(criteria: ExternalSearchCriteria) {
    return buildAutoriaSearchUrl(criteria);
  }

  async search(ctx: ExternalSearchContext, criteria: ExternalSearchCriteria): Promise<ExternalSearchProviderResult> {
    const searchUrl = this.getSearchUrl(criteria);
    if (!searchUrl) return { items: [], blocked: false };

    const html = await ctx.fetchHtml(searchUrl);
    const $ = cheerio.load(html);

    const linkCandidates = $('a[href*="auto_"]')
      .map((_, element) => toAbsolute(cleanText($(element).attr('href'))))
      .get()
      .filter((href) => href.includes('/auto_'));

    const uniqueLinks = Array.from(new Set(linkCandidates)).slice(0, 20);

    const parsed: ExternalSearchCandidate[] = [];
    for (const url of uniqueLinks) {
      const anchor = $(`a[href=\"${url.replace(/\"/g, '')}\"]`).first();
      const card = anchor.closest('section, article, li, div');
      const title = cleanText(card.find('h3, .blue.bold, .address').first().text()) || cleanText(anchor.text()) || 'Авто';
      const priceText = cleanText(card.find('.price-ticket, .price').first().text()) || cleanText(card.text());
      const city = cleanText(card.find('.item.region, .item-char').first().text());
      const image = cleanText(card.find('img').first().attr('src') || card.find('img').first().attr('data-src'));
      const rawText = cleanText(card.text());
      const price = parsePrice(priceText);

      parsed.push({
        sourceProvider: 'AUTO_RIA',
        sourceUrl: url,
        title,
        price: price.amount,
        currency: price.currency,
        city,
        year: extractYear(rawText),
        mileage: extractMileage(rawText),
        photos: image ? [image] : [],
        rawText
      });
    }

    const hydrated: ExternalSearchCandidate[] = [];
    for (const item of parsed.slice(0, 8)) {
      if (item.photos.length === 0 || !item.year || !item.mileage) {
        hydrated.push(await hydrateListing(ctx, item));
      } else {
        hydrated.push(item);
      }
    }

    const filtered = hydrated.filter((item) => passesCriteria(item, criteria));

    return {
      items: filtered.slice(0, ctx.maxResults),
      blocked: false
    };
  }
}
