import axios from 'axios';
import * as cheerio from 'cheerio';
// @ts-ignore
import { getProfile } from './parserProfiles.js';
// @ts-ignore
import { parsePrice, parseMileage, normalizeCurrency } from './textParserUtils.js';
import { logger } from '../utils/logger.js';

type Confidence = 'low' | 'medium' | 'high';

type ParsedListing = {
  title?: string;
  price?: number;
  currency?: string;
  year?: number;
  mileage?: number;
  location?: string;
  thumbnail?: string;
  domain?: string;
  url: string;
  raw?: Record<string, any>;
  confidence: Confidence;
  reason?: string;
};

export const parseListingFromUrl = async (url: string, htmlOverride?: string): Promise<ParsedListing> => {
  try {
    let html = htmlOverride || '';
    if (!html) {
      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      const resp = await axios.get<string>(url, {
        timeout: 15000,
        headers: { 'User-Agent': userAgent }
      });
      html = resp.data || '';
    }
    const $ = cheerio.load(html);
    const domain = new URL(url).hostname.replace(/^www\./, '');

    // 0. Mapping/Profile Extraction
    let profileData: any = {};
    let mapping: any = null;
    try {
        mapping = await getProfile(domain);
        const selectorMap = mapping && !mapping.fields && mapping.mode !== 'fieldMap' ? mapping : null;
        if (selectorMap) {
            if (selectorMap.title) profileData.title = $(selectorMap.title).first().text().trim();
            if (selectorMap.price) {
                 const txt = $(selectorMap.price).first().text().trim();
                 const pp = parsePrice(txt);
                 profileData.price = pp.amount;
                 profileData.currency = pp.currency;
            }
            if (selectorMap.year) {
                 const txt = $(selectorMap.year).first().text().trim();
                 const m = txt.match(/(19|20)\d{2}/);
                 if (m) profileData.year = Number(m[0]);
            }
            if (selectorMap.mileage) {
                 const txt = $(selectorMap.mileage).first().text().trim();
                 profileData.mileage = parseMileage(txt);
            }
            if (selectorMap.description) profileData.description = $(selectorMap.description).first().text().trim();
        }
    } catch (e) {
        logger.warn('Profile extraction failed', e);
    }

    // 1. Meta Tags (OG, Twitter)
    const title = $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || $('title').text();
    const image = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content');
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');

    // 2. JSON-LD Extraction
    let vehicleLd: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() || '{}');
        const items = Array.isArray(json) ? json : [json];
        const found = items.find((i: any) => {
          const type = (i['@type'] || '').toLowerCase();
          return type.includes('vehicle') || type.includes('car') || type.includes('product');
        });
        if (found) vehicleLd = found;
      } catch (e) {}
    });

    // 3. Structured Data Mapping
    const ldTitle = vehicleLd?.name || vehicleLd?.headline;
    const ldPrice = vehicleLd?.offers?.price || vehicleLd?.price;
    const ldCurrency = vehicleLd?.offers?.priceCurrency || vehicleLd?.priceCurrency;
    const ldYear = vehicleLd?.modelDate || vehicleLd?.productionDate || vehicleLd?.vehicleModelDate;
    const ldMileage = vehicleLd?.mileageFromOdometer?.value || vehicleLd?.mileageFromOdometer;
    const ldImage = vehicleLd?.image?.url || (Array.isArray(vehicleLd?.image) ? vehicleLd?.image[0] : vehicleLd?.image);
    const ldImages = Array.isArray(vehicleLd?.image) ? vehicleLd?.image : (ldImage ? [ldImage] : []);

    // 4. Fallback Heuristics (if JSON-LD missing)
    let heuristicPrice = undefined;
    if (!ldPrice) {
       // Try common price selectors
       const pText = $('.price, [class*="price"], [id*="price"]').first().text();
       heuristicPrice = parsePrice(pText);
    }

    const parsedPrice = parsePrice(String(ldPrice || ''));

    const finalPrice = parsedPrice.amount || heuristicPrice?.amount;
    const finalCurrency = parsedPrice.currency || normalizeCurrency(ldCurrency) || heuristicPrice?.currency || 'USD';

    // Parse Year from Title if missing
    let finalYear = ldYear ? Number(ldYear) : undefined;
    if (!finalYear && title) {
      const yearMatch = title.match(/(19|20)\d{2}/);
      if (yearMatch) finalYear = Number(yearMatch[0]);
    }

    // Parse Mileage from specs/description if missing
    let finalMileage = ldMileage ? Number(ldMileage) : undefined;
    if (!finalMileage && description) {
        // Look for "150000 km" pattern
        const milesMatch = description.match(/(\d+[\d\s]*)(km|miles|км|миль)/i);
        if (milesMatch) finalMileage = parseMileage(milesMatch[1]);
    }

    const baseVariables = {
      title: (profileData.title || ldTitle || title || '').trim(),
      price: profileData.price || finalPrice,
      currency: profileData.currency || finalCurrency,
      year: profileData.year || finalYear,
      mileage: profileData.mileage || finalMileage,
      location: vehicleLd?.address?.addressLocality,
      description: profileData.description || description,
      vin: vehicleLd?.vehicleIdentificationNumber || undefined,
      thumbnail: ldImage || image,
      url
    } as Record<string, any>;

    const baseImages = Array.from(new Set([...(ldImages || []), image].filter(Boolean) as string[]));

    // Apply field-map mapping if provided
    if (mapping && (mapping.mode === 'fieldMap' || mapping.fields)) {
      const fields = mapping.fields || mapping;
      const mapped: Record<string, any> = { ...baseVariables };
      Object.entries(fields || {}).forEach(([targetKey, sourceKey]) => {
        if (!sourceKey || typeof sourceKey !== 'string') return;
        if (sourceKey === 'images' || targetKey === 'images') {
          mapped.images = baseImages;
          return;
        }
        const value = baseVariables[sourceKey];
        if (value !== undefined && value !== null && value !== '') {
          mapped[targetKey] = value;
        }
      });
      Object.assign(baseVariables, mapped);
    }

    const payload: ParsedListing = {
      title: baseVariables.title,
      price: baseVariables.price,
      currency: baseVariables.currency,
      year: baseVariables.year,
      mileage: baseVariables.mileage,
      location: baseVariables.location,
      thumbnail: baseVariables.thumbnail || ldImage || image,
      domain,
      url,
      raw: {
        jsonLd: vehicleLd || null,
        meta: { title, image, description },
        profile: profileData,
        images: baseImages
      },
      confidence: 'low'
    };

    // Calculate Confidence
    if (payload.title && payload.price && payload.year) {
      payload.confidence = 'high';
    } else if (payload.title && (payload.price || payload.year)) {
      payload.confidence = 'medium';
    }

    return payload;

  } catch (e: any) {
    const message = e?.message || '';
    if (message && message !== 'Invalid URL') {
      logger.error('Parse error:', message);
    }
    return {
      url,
      confidence: 'low',
      reason: e?.message || 'fetch_failed'
    };
  }
};
