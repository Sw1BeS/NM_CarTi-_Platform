import axios from 'axios';

type Confidence = 'low' | 'medium' | 'high';

type ParsedListing = {
  title?: string;
  price?: number;
  currency?: string;
  year?: number;
  location?: string;
  thumbnail?: string;
  url: string;
  raw?: Record<string, any>;
  confidence: Confidence;
  reason?: string;
};

const extractMeta = (html: string, names: string[]): string | undefined => {
  for (const name of names) {
    const regex = new RegExp(`<meta[^>]+(?:property|name)=[\"']${name}[\"'][^>]+content=[\"']([^\"']+)[\"']`, 'i');
    const match = html.match(regex);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
};

const extractJsonLd = (html: string): any[] => {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const parsed: any[] = [];
  for (const [, body] of scripts) {
    try {
      const json = JSON.parse(body.trim());
      if (Array.isArray(json)) parsed.push(...json);
      else parsed.push(json);
    } catch {
      continue;
    }
  }
  return parsed;
};

const normalizeCurrency = (val?: string) => {
  if (!val) return undefined;
  const upper = val.toUpperCase();
  if (upper.includes('USD') || upper.includes('$')) return 'USD';
  if (upper.includes('EUR') || upper.includes('€')) return 'EUR';
  if (upper.includes('UAH') || upper.includes('₴')) return 'UAH';
  return upper.slice(0, 3);
};

const parsePrice = (priceText?: string): { amount?: number; currency?: string } => {
  if (!priceText) return {};
  const clean = priceText.replace(/[\s,]+/g, ' ');
  const amountMatch = clean.match(/([\d\s.,]+)/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/[^\d.]/g, '')) : undefined;
  const currency = normalizeCurrency(clean);
  return { amount: Number.isFinite(amount) ? amount : undefined, currency };
};

export const parseListingFromUrl = async (url: string): Promise<ParsedListing> => {
  try {
    const resp = await axios.get<string>(url, { timeout: 15000 });
    const html = resp.data || '';
    const title = extractMeta(html, ['og:title', 'twitter:title', 'title']) || extractMeta(html, ['name']);
    const image = extractMeta(html, ['og:image', 'twitter:image']);
    const description = extractMeta(html, ['og:description', 'description']);
    const priceText = extractMeta(html, ['product:price:amount', 'price', 'og:price:amount']) || description;
    const jsonLd = extractJsonLd(html);
    const vehicleLd = jsonLd.find(j => (j['@type'] || '').toLowerCase().includes('vehicle') || j.price || j.brand);

    const ldTitle = vehicleLd?.name || vehicleLd?.headline;
    const ldPrice = vehicleLd?.offers?.price || vehicleLd?.price;
    const ldCurrency = vehicleLd?.offers?.priceCurrency || vehicleLd?.priceCurrency;
    const ldYear = vehicleLd?.modelDate || vehicleLd?.productionDate;
    const ldLocation = vehicleLd?.address?.addressLocality || vehicleLd?.offers?.availabilityEnds;

    const parsedPrice = parsePrice(String(ldPrice || priceText || ''));

    const payload: ParsedListing = {
      title: title || ldTitle,
      price: parsedPrice.amount,
      currency: parsedPrice.currency || normalizeCurrency(ldCurrency),
      year: ldYear ? Number(ldYear) : undefined,
      location: ldLocation,
      thumbnail: image,
      url,
      raw: {
        jsonLd: vehicleLd || null,
        meta: {
          title,
          image,
          description,
          priceText
        }
      },
      confidence: 'low'
    };

    const hasTitle = Boolean(payload.title);
    const hasPrice = Boolean(payload.price);
    const hasYear = Boolean(payload.year);
    const strongMatch = hasTitle && (hasPrice || hasYear);

    if (strongMatch) {
      payload.confidence = 'high';
    } else if (hasTitle) {
      payload.confidence = 'medium';
      payload.reason = 'Missing price/year';
    } else {
      payload.confidence = 'low';
      payload.reason = 'Title not detected';
    }

    const urlHost = new URL(url).hostname;
    if (title && !html.toLowerCase().includes(title.toLowerCase().slice(0, 6))) {
      payload.confidence = 'low';
      payload.reason = 'Possible mismatch between URL and title';
    }

    payload.raw = {
      ...payload.raw,
      urlHost,
      fetchedAt: new Date().toISOString()
    };

    return payload;
  } catch (e: any) {
    return {
      url,
      confidence: 'low',
      reason: e?.message || 'fetch_failed'
    };
  }
};
