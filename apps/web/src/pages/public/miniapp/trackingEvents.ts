export type MiniAppBusinessEvent =
    | 'MiniAppOpen'
    | 'ViewShowcase'
    | 'ViewInventoryItem'
    | 'LeadFormStart'
    | 'LeadSubmit'
    | 'B2BRequestCreate';

export type MiniAppMetaCookieName = '_fbp' | '_fbc';

export type MiniAppMetaCookieWrite = {
    name: MiniAppMetaCookieName;
    value: string;
};

export type MiniAppMetaTrackingResolution = {
    fbclid?: string;
    fbp?: string;
    fbc?: string;
    cookiesToPersist: MiniAppMetaCookieWrite[];
};

const cleanString = (value: unknown) => {
    const normalized = String(value || '').trim();
    return normalized || undefined;
};

const createMetaTimestamp = (nowMs: number) => String(Math.trunc(nowMs));

const createMetaRandomPart = () => Math.floor(Math.random() * 1_000_000_000_000).toString();

export const resolveMiniAppViewEventType = (view: string): MiniAppBusinessEvent => {
    const normalized = String(view || '').trim().toUpperCase();
    if (normalized === 'CATALOG' || normalized === 'FAVORITES' || normalized === 'STATUS') return 'ViewShowcase';
    if (normalized === 'LISTING') return 'ViewInventoryItem';
    if (normalized === 'REQUEST') return 'LeadFormStart';
    return 'MiniAppOpen';
};

export const resolveMiniAppSubmitEventType = (params: {
    isB2BMode: boolean;
    requestType?: 'BUY' | 'SELL' | string;
}): MiniAppBusinessEvent => {
    return params.isB2BMode ? 'B2BRequestCreate' : 'LeadSubmit';
};

export const resolveMiniAppMetaTracking = (params: {
    fbclid?: string | null;
    existingFbp?: string | null;
    existingFbc?: string | null;
    nowMs?: number;
    randomPart?: string;
}): MiniAppMetaTrackingResolution => {
    const fbclid = cleanString(params.fbclid);
    const existingFbp = cleanString(params.existingFbp);
    const existingFbc = cleanString(params.existingFbc);
    const timestamp = createMetaTimestamp(params.nowMs ?? Date.now());
    const randomPart = cleanString(params.randomPart) || createMetaRandomPart();
    const cookiesToPersist: MiniAppMetaCookieWrite[] = [];

    const fbp = existingFbp || `fb.1.${timestamp}.${randomPart}`;
    if (!existingFbp) {
        cookiesToPersist.push({ name: '_fbp', value: fbp });
    }

    const nextFbc = fbclid ? `fb.1.${timestamp}.${fbclid}` : undefined;
    const fbc = nextFbc || existingFbc;
    if (nextFbc && nextFbc !== existingFbc) {
        cookiesToPersist.push({ name: '_fbc', value: nextFbc });
    }

    return {
        fbclid,
        fbp,
        fbc,
        cookiesToPersist
    };
};
