import { describe, expect, it } from 'vitest';
import {
    resolveMiniAppSubmitEventType,
    resolveMiniAppViewEventType
} from '../../../web/src/pages/public/miniapp/trackingEvents';

describe('MiniApp web tracking event names', () => {
    it('maps MiniApp views to business funnel event names', () => {
        expect(resolveMiniAppViewEventType('HOME')).toBe('MiniAppOpen');
        expect(resolveMiniAppViewEventType('CATALOG')).toBe('ViewShowcase');
        expect(resolveMiniAppViewEventType('FAVORITES')).toBe('ViewShowcase');
        expect(resolveMiniAppViewEventType('LISTING')).toBe('ViewInventoryItem');
        expect(resolveMiniAppViewEventType('REQUEST')).toBe('LeadFormStart');
        expect(resolveMiniAppViewEventType('UNKNOWN')).toBe('MiniAppOpen');
    });

    it('maps submit flows to lead or B2B business event names', () => {
        expect(resolveMiniAppSubmitEventType({ isB2BMode: false, requestType: 'BUY' })).toBe('LeadSubmit');
        expect(resolveMiniAppSubmitEventType({ isB2BMode: true, requestType: 'BUY' })).toBe('B2BRequestCreate');
        expect(resolveMiniAppSubmitEventType({ isB2BMode: true, requestType: 'SELL' })).toBe('B2BRequestCreate');
    });
});
