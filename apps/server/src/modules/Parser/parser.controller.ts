import { Router } from 'express';
import axios from 'axios';
import { load } from 'cheerio';
import { prisma } from '../../services/prisma.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { logger } from '../../utils/logger.js';
import { errorResponse } from '../../utils/errorResponse.js';
import { parsePrice, parseMileage } from '../../services/textParserUtils.js';

const router = Router();

// Helpers
const sanitizeDomain = (urlStr: string) => {
    try {
        const url = new URL(urlStr);
        return url.hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
};

const extractVariables = (html: string, url: string) => {
    const $ = load(html || '');
    const text = $('body').text() || '';

    const title = ($('meta[property="og:title"]').attr('content')
        || $('meta[name="title"]').attr('content')
        || $('title').text()
        || '').trim();

    const description = ($('meta[property="og:description"]').attr('content')
        || $('meta[name="description"]').attr('content')
        || '').trim();

    const imageCandidates = [
        $('meta[property="og:image"]').attr('content'),
        $('meta[name="twitter:image"]').attr('content')
    ].filter(Boolean) as string[];
    $('img').slice(0, 5).each((_, el) => {
        const src = $(el).attr('src');
        if (src && imageCandidates.length < 5) imageCandidates.push(src);
    });

    const priceMeta = $('meta[property="product:price:amount"]').attr('content')
        || $('meta[itemprop="price"]').attr('content')
        || $('*[itemprop=price]').text();

    const priceRegex = /([\d\s.,]+)\s?(USD|EUR|EURO|€|\$|₴|UAH)/i;
    const priceText = priceMeta || text.match(priceRegex)?.[0] || '';
    const priceMatch = priceText.match(/([\d\s.,]+)/);
    const price = priceMatch ? Number(priceMatch[1].replace(/[^\d.]/g, '')) : undefined;
    const currency = priceText.match(/(USD|EUR|EURO|€|\$|₴|UAH)/i)?.[1] || undefined;

    const mileageMatch = text.match(/(\d[\d\s.,]{2,7})\s?(км|km|mileage)/i);
    const mileage = mileageMatch ? mileageMatch[1].replace(/[^\d.]/g, '') : undefined;

    const yearMatch = text.match(/(20[0-3]\d|19[8-9]\d)/);
    const year = yearMatch ? Number(yearMatch[1]) : undefined;

    const vinMatch = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
    const vin = vinMatch ? vinMatch[0] : undefined;

    // JSON-LD Extraction (Vehicle/Product)
    let vehicleLd: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const json = JSON.parse($(el).html() || '{}');
            const items = Array.isArray(json) ? json : [json];
            const found = items.find((i: any) => {
                const type = String(i['@type'] || '').toLowerCase();
                return type.includes('vehicle') || type.includes('car') || type.includes('product');
            });
            if (found) vehicleLd = found;
        } catch { }
    });

    const ldTitle = vehicleLd?.name || vehicleLd?.headline;
    const ldPrice = vehicleLd?.offers?.price || vehicleLd?.price;
    const ldCurrency = vehicleLd?.offers?.priceCurrency || vehicleLd?.priceCurrency;
    const ldYear = vehicleLd?.modelDate || vehicleLd?.productionDate || vehicleLd?.vehicleModelDate;
    const ldMileage = vehicleLd?.mileageFromOdometer?.value || vehicleLd?.mileageFromOdometer;
    const ldVin = vehicleLd?.vehicleIdentificationNumber;
    const ldImage = vehicleLd?.image?.url || (Array.isArray(vehicleLd?.image) ? vehicleLd?.image[0] : vehicleLd?.image);
    if (ldImage) imageCandidates.push(ldImage);

    // FALLBACK: OpenGraph / Meta Tags (Universal)
    // If regex failed, rely on meta
    const finalTitle = title || $('meta[name="twitter:title"]').attr('content') || '';
    const finalDesc = description || $('meta[name="twitter:description"]').attr('content') || '';
    const finalImage = imageCandidates[0] || '';

    // Heuristic for Price/Currency if regex failed but OG title has it (e.g. "BMW X5 - $50,000")
    let finalPrice = price;
    let finalCurrency = currency;
    if (!finalPrice && finalTitle) {
        const pMatch = finalTitle.match(/([$€£₴])\s?([\d,.]+)/);
        if (pMatch) {
            finalCurrency = pMatch[1] === '$' ? 'USD' : (pMatch[1] === '€' ? 'EUR' : 'UAH');
            finalPrice = Number(pMatch[2].replace(/,/g, ''));
        }
    }

    if (!finalPrice && ldPrice) finalPrice = Number(String(ldPrice).replace(/[^\d.]/g, ''));
    if (!finalCurrency && ldCurrency) finalCurrency = ldCurrency;

    const finalYear = year || (ldYear ? Number(String(ldYear).match(/(19|20)\d{2}/)?.[0]) : undefined);
    const mileageRaw = mileage || (ldMileage ? String(ldMileage).replace(/[^\d.]/g, '') : undefined);
    const finalMileage = mileageRaw ? Number(mileageRaw) : undefined;

    return {
        meta: { title: finalTitle, description: finalDesc },
        images: Array.from(new Set(imageCandidates)).filter(Boolean),
        variables: {
            title: finalTitle || ldTitle || undefined,
            description: finalDesc || undefined,
            price: finalPrice,
            currency: finalCurrency,
            mileage: finalMileage,
            year: finalYear,
            vin: vin || ldVin,
            location: vehicleLd?.address?.addressLocality,
            url,
            // Add raw meta for UI debugging
            ogImage: finalImage
        }
    };
};

const applyFieldMap = (mapping: Record<string, any>, base: ReturnType<typeof extractVariables>) => {
    const fields = mapping?.fields && typeof mapping.fields === 'object' ? mapping.fields : {};
    const next = { ...(base.variables || {}) } as Record<string, any>;

    Object.entries(fields).forEach(([targetKey, sourceKey]) => {
        if (!sourceKey || typeof sourceKey !== 'string') return;
        if (sourceKey === 'images') {
            if (targetKey === 'images') {
                (next as any).images = base.images || [];
            }
            return;
        }
        const value = (base.variables as any)?.[sourceKey];
        if (value !== undefined && value !== null && value !== '') {
            (next as any)[targetKey] = value;
        }
    });

    return { ...base, variables: next };
};

const applySelectorMap = (html: string, mapping: Record<string, any>, base: ReturnType<typeof extractVariables>) => {
    const $ = load(html || '');
    const readText = (selector?: string) => {
        if (!selector || typeof selector !== 'string') return '';
        return ($(selector).first().text() || '').trim();
    };

    const next = { ...(base.variables || {}) } as Record<string, any>;
    let images = Array.isArray(base.images) ? [...base.images] : [];
    const mappedTitle = readText(mapping.title);
    if (mappedTitle) next.title = mappedTitle;

    const mappedDesc = readText(mapping.description);
    if (mappedDesc) next.description = mappedDesc;

    const priceText = readText(mapping.price);
    if (priceText) {
        const parsed = parsePrice(priceText);
        if (parsed.amount !== undefined) next.price = parsed.amount;
        if (parsed.currency) next.currency = parsed.currency;
    }

    const yearText = readText(mapping.year);
    if (yearText) {
        const yearMatch = yearText.match(/(19|20)\d{2}/);
        if (yearMatch) next.year = Number(yearMatch[0]);
    }

    const mileageText = readText(mapping.mileage);
    if (mileageText) {
        const parsedMileage = parseMileage(mileageText);
        if (parsedMileage !== undefined) next.mileage = parsedMileage;
    }

    const locationText = readText(mapping.location);
    if (locationText) next.location = locationText;

    const currencyText = readText(mapping.currency);
    if (currencyText) {
        const parsedCurrency = parsePrice(currencyText);
        if (parsedCurrency.currency) next.currency = parsedCurrency.currency;
    }

    const vinText = readText(mapping.vin);
    if (vinText) {
        const vinMatch = vinText.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i);
        next.vin = vinMatch ? vinMatch[0].toUpperCase() : vinText.trim();
    }

    const imageContainer = mapping.imageContainer;
    if (imageContainer) {
        const container = $(imageContainer);
        const imgSources: string[] = [];
        container.find('img').each((_, el) => {
            const src = $(el).attr('data-src') || $(el).attr('src') || '';
            if (src) imgSources.push(src);
        });
        if (imgSources.length) {
            images = Array.from(new Set([...images, ...imgSources]));
        }
    }

    return { ...base, variables: next, images };
};

const applyMapping = (html: string, mapping: Record<string, any> | null, base: ReturnType<typeof extractVariables>) => {
    if (!mapping || typeof mapping !== 'object') return base;
    if (mapping.mode === 'fieldMap') return applyFieldMap(mapping, base);
    return applySelectorMap(html, mapping, base);
};

const getSettingsModules = async () => {
    const settings = await prisma.systemSettings.findFirst();
    const modules = (settings?.modules as any) || {};
    return { settings, modules };
};

const saveSettingsModules = async (modules: Record<string, any>) => {
    const existing = await prisma.systemSettings.findFirst();
    if (existing) {
        return prisma.systemSettings.update({ where: { id: existing.id }, data: { modules } });
    }
    return prisma.systemSettings.create({ data: { modules } });
};

router.use(authenticateToken);

router.post('/preview', requireRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), async (req, res) => {
    try {
        const { url } = req.body || {};
        if (!url || typeof url !== 'string') return errorResponse(res, 400, 'url required');
        const domain = sanitizeDomain(url);
        if (!domain) return errorResponse(res, 400, 'invalid url');

        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const html = response.data || '';
        const parsed = extractVariables(html, url);
        const { modules } = await getSettingsModules();
        const cached = modules?.parserMappings?.[domain] || null;
        const mapped = applyMapping(html, cached, parsed);

        return res.json({
            ok: true,
            data: {
                url,
                domain,
                variables: mapped.variables,
                meta: mapped.meta,
                images: mapped.images,
                cachedMapping: cached || undefined
            }
        });
    } catch (e: any) {
        logger.error('[Parser] preview error:', e.message || e);
        return errorResponse(res, 500, e.message || 'Failed to parse URL');
    }
});

router.get('/mapping/:domain', requireRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), async (req, res) => {
    try {
        const domain = sanitizeDomain(`https://${req.params.domain}`);
        if (!domain) return errorResponse(res, 400, 'invalid domain');
        const { modules } = await getSettingsModules();
        const mapping = modules?.parserMappings?.[domain] || null;
        return res.json({ ok: true, data: { domain, mapping } });
    } catch (e: any) {
        logger.error('[Parser] get mapping error:', e.message || e);
        return errorResponse(res, 500, e.message || 'Failed to read mapping');
    }
});

router.post('/mapping', requireRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']), async (req, res) => {
    try {
        const { domain: rawDomain, mapping, remember = true } = req.body || {};
        const domain = sanitizeDomain(typeof rawDomain === 'string' ? rawDomain : `https://${rawDomain || ''}`);
        if (!domain) return errorResponse(res, 400, 'domain required');
        if (!mapping || typeof mapping !== 'object') return errorResponse(res, 400, 'mapping required');

        const { modules } = await getSettingsModules();
        const parserMappings = { ...(modules?.parserMappings || {}) };
        if (remember) {
            parserMappings[domain] = mapping;
        }

        const nextModules = { ...(modules || {}), parserMappings };
        await saveSettingsModules(nextModules);

        return res.json({ ok: true, data: { domain, mapping: parserMappings[domain] || mapping } });
    } catch (e: any) {
        logger.error('[Parser] save mapping error:', e.message || e);
        return errorResponse(res, 500, e.message || 'Failed to save mapping');
    }
});

export default router;
