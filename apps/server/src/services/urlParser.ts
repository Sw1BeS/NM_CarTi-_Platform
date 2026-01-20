import axios from 'axios';

const stripTags = (value: string) => value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

const AUTORIA_BRAND_MAP: Record<string, number> = {
    'acura': 1, 'audi': 6, 'bmw': 9, 'bentley': 8, 'buick': 10, 'byd': 2623,
    'cadillac': 11, 'chevrolet': 13, 'chrysler': 14, 'citroen': 15,
    'dodge': 19, 'fiat': 23, 'ferrari': 22, 'ford': 24, 'gmc': 25,
    'honda': 28, 'hummer': 30, 'hyundai': 29, 'infiniti': 32,
    'jaguar': 31, 'jeep': 32, 'kia': 33, 'lamborghini': 35,
    'land rover': 36, 'lexus': 38, 'lincoln': 39, 'mazda': 43,
    'mercedes-benz': 48, 'mercedes': 48, 'mitsubishi': 52, 'mini': 51,
    'nissan': 55, 'opel': 56, 'peugeot': 58, 'porsche': 60,
    'renault': 62, 'rolls-royce': 64, 'skoda': 70, 'subaru': 75,
    'suzuki': 76, 'tesla': 5608, 'toyota': 79, 'volkswagen': 84, 'volvo': 85
};

const AUTORIA_CACHE = new Map<string, { ts: number; data: any[] }>();
const AUTORIA_CACHE_TTL = 15 * 60 * 1000;

export const normalizeUrl = (value: string) => {
    try {
        const u = new URL(value);
        u.hash = '';
        return u.toString().replace(/\/$/, '');
    } catch {
        return (value || '').split('#')[0].replace(/\/$/, '');
    }
};

const extractJsonLdObjects = (input: any): any[] => {
    if (!input) return [];
    if (Array.isArray(input)) return input.flatMap(extractJsonLdObjects);
    if (typeof input === 'object') {
        if (Array.isArray(input['@graph'])) return input['@graph'].flatMap(extractJsonLdObjects);
        return [input];
    }
    return [];
};

const isTargetJsonLdType = (obj: any) => {
    const rawType = obj?.['@type'];
    const types = Array.isArray(rawType) ? rawType : rawType ? [rawType] : [];
    return types.some((t: string) => ['Product', 'Vehicle', 'Car'].includes(String(t)));
};

const extractCandidateUrl = (obj: any) => obj?.url || obj?.offers?.url || obj?.['@id'] || '';

const extractCandidateSourceId = (obj: any) => {
    const candidates = [obj?.sku, obj?.productID, obj?.identifier, obj?.mpn, obj?.['@id']];
    return candidates.find(v => typeof v === 'string' && v.trim().length > 0) || '';
};

const fetchHtml = async (url: string) => {
    const response = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CartieBot/1.0)' }
    });
    return typeof response.data === 'string' ? response.data : String(response.data || '');
};

export const parseAutoRiaListing = async (url: string): Promise<any | null> => {
    if (!url.includes('auto.ria.com')) return null;
    const html = await fetchHtml(url);
    const normalizedTarget = normalizeUrl(url);

    const idMatch = url.match(/auto_.*?(\d+)\.html/);
    const sourceId = idMatch ? idMatch[1] : undefined;

    const scriptMatches = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
    const candidates: any[] = [];
    for (const block of scriptMatches) {
        const content = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
        try {
            const json = JSON.parse(content);
            candidates.push(...extractJsonLdObjects(json));
        } catch {
            continue;
        }
    }

    const productCandidates = candidates.filter(isTargetJsonLdType);
    let data = productCandidates[0] || {};
    if (productCandidates.length > 0) {
        const scored = productCandidates.map(candidate => {
            const candidateUrl = extractCandidateUrl(candidate);
            const urlMatch = candidateUrl ? normalizeUrl(candidateUrl) === normalizedTarget : false;
            const sourceMatch = sourceId
                ? (candidateUrl && candidateUrl.includes(sourceId)) || extractCandidateSourceId(candidate) === sourceId
                : false;
            const score = (urlMatch ? 2 : 0) + (sourceMatch ? 1 : 0);
            return { candidate, score, urlMatch, sourceMatch };
        });
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.urlMatch !== a.urlMatch) return b.urlMatch ? 1 : -1;
            if (b.sourceMatch !== a.sourceMatch) return b.sourceMatch ? 1 : -1;
            return 0;
        });
        data = scored[0]?.candidate || {};
    }

    const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const title = data.name || (titleMatch ? stripTags(titleMatch[1]) : 'AutoRia Listing');
    const price = Number(data.offers?.price || 0);
    const currency = data.offers?.priceCurrency || 'USD';
    const images = Array.isArray(data.image) ? data.image : data.image ? [data.image] : [];
    const yearRaw = data.productionDate || data.vehicleModelDate || data.modelDate;
    const year = yearRaw ? Number(String(yearRaw).slice(0, 4)) : 0;
    const odo = data.mileageFromOdometer?.value || data.mileageFromOdometer;
    const mileage = odo ? Number(String(odo).replace(/\D/g, '')) * 1000 : 0;

    return {
        canonicalId: `autoria_${sourceId || Date.now()}`,
        sourceId,
        source: 'AUTORIA',
        sourceUrl: url,
        title,
        price: { amount: price || 0, currency },
        year,
        mileage,
        location: '',
        thumbnail: images[0] || '',
        mediaUrls: images,
        specs: {},
        status: 'AVAILABLE',
        postedAt: new Date().toISOString()
    };
};

export const searchAutoRia = async (filter: any): Promise<any[]> => {
    if (!filter.brand) return [];
    const cacheKey = `${filter.brand || ''}|${filter.model || ''}|${filter.yearMin || ''}|${filter.yearMax || ''}|${filter.priceMin || ''}|${filter.priceMax || ''}`;
    const cached = AUTORIA_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < AUTORIA_CACHE_TTL) return cached.data;

    const brandId = AUTORIA_BRAND_MAP[String(filter.brand).toLowerCase()];
    let searchUrl = 'https://auto.ria.com/uk/search/?categories.main.id=1&price.currency=1';
    if (brandId) searchUrl += `&brand.id[0]=${brandId}`;
    if (filter.priceMin) searchUrl += `&price.USD.gte=${filter.priceMin}`;
    if (filter.priceMax) searchUrl += `&price.USD.lte=${filter.priceMax}`;
    if (filter.yearMin) searchUrl += `&year.gte=${filter.yearMin}`;
    if (filter.yearMax) searchUrl += `&year.lte=${filter.yearMax}`;

    const html = await fetchHtml(searchUrl);
    const linkMatches = Array.from(html.matchAll(/href="([^"]+auto_.*?\.html)"/gi)).map(m => m[1]);
    const links = Array.from(new Set(linkMatches.map(link => link.startsWith('http') ? link : `https://auto.ria.com${link}`)))
        .filter(link => link.includes('auto.ria.com'))
        .slice(0, 10);

    const results: any[] = [];
    for (const link of links) {
        try {
            const car = await parseAutoRiaListing(link);
            if (car) results.push(car);
        } catch {
            continue;
        }
    }

    const modelKey = filter.model ? String(filter.model).toLowerCase() : '';
    const finalResults = modelKey
        ? results.filter((r: any) => r.title.toLowerCase().includes(modelKey))
        : results;

    AUTORIA_CACHE.set(cacheKey, { ts: Date.now(), data: finalResults });
    return finalResults;
};
