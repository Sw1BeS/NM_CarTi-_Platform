import axios from 'axios';
import * as cheerio from 'cheerio';
// @ts-ignore
import { getProfile } from './parserProfiles.js';
// @ts-ignore
import { parsePrice, parseMileage, normalizeCurrency } from './textParserUtils.js';

type Confidence = 'low' | 'medium' | 'high';

type ParsedListing = {
  title?: string;
  price?: number;
  currency?: string;
  year?: number;
  mileage?: number;
  location?: string;
  thumbnail?: string;
  url: string;
  raw?: Record<string, any>;
  confidence: Confidence;
  reason?: string;
};

export const parseListingFromUrl = async (url: string): Promise<ParsedListing> => {
  try {
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    const resp = await axios.get<string>(url, {
      timeout: 15000,
      headers: { 'User-Agent': userAgent }
    });

    const html = resp.data || '';
    const $ = cheerio.load(html);

    // 0. Profile Extraction
    let profileData: any = {};
    try {
        const domain = new URL(url).hostname;
        const profile = await getProfile(domain);
        if (profile) {
            if (profile.title) profileData.title = $(profile.title).first().text().trim();
            if (profile.price) {
                 const txt = $(profile.price).first().text().trim();
                 const pp = parsePrice(txt);
                 profileData.price = pp.amount;
                 profileData.currency = pp.currency;
            }
            if (profile.year) {
                 const txt = $(profile.year).first().text().trim();
                 const m = txt.match(/(19|20)\d{2}/);
                 if (m) profileData.year = Number(m[0]);
            }
            if (profile.mileage) {
                 const txt = $(profile.mileage).first().text().trim();
                 profileData.mileage = parseMileage(txt);
            }
            if (profile.description) profileData.description = $(profile.description).first().text().trim();
        }
    } catch (e) {
        console.warn('Profile extraction failed', e);
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

    const payload: ParsedListing = {
      title: (profileData.title || ldTitle || title || '').trim(),
      price: profileData.price || finalPrice,
      currency: profileData.currency || finalCurrency,
      year: profileData.year || finalYear,
      mileage: profileData.mileage || finalMileage,
      location: vehicleLd?.address?.addressLocality,
      thumbnail: ldImage || image,
      url,
      raw: {
        jsonLd: vehicleLd || null,
        meta: { title, image, description },
        profile: profileData
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
      console.error('Parse error:', message);
    }
    return {
      url,
      confidence: 'low',
      reason: e?.message || 'fetch_failed'
    };
  }
};
