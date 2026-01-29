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

    return {
        meta: { title, description },
        images: Array.from(new Set(imageCandidates)).filter(Boolean),
        variables: {
            title: title || undefined,
            description: description || undefined,
            price,
            currency,
            mileage,
            year,
            vin,
            url
        }
    };
};

const applyMapping = (html: string, mapping: Record<string, any> | null, base: ReturnType<typeof extractVariables>) => {
    if (!mapping || typeof mapping !== 'object') return base;
    const $ = load(html || '');
    const readText = (selector?: string) => {
        if (!selector || typeof selector !== 'string') return '';
        return ($(selector).first().text() || '').trim();
    };

    const next = { ...(base.variables || {}) } as Record<string, any>;
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

    return { ...base, variables: next };
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

        const response = await axios.get(url, { timeout: 15000 });
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
