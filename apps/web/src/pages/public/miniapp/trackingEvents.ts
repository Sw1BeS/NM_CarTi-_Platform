export type MiniAppBusinessEvent =
    | 'MiniAppOpen'
    | 'ViewShowcase'
    | 'ViewInventoryItem'
    | 'LeadFormStart'
    | 'LeadSubmit'
    | 'B2BRequestCreate';

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
