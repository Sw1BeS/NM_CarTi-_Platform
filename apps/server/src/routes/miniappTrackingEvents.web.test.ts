import { describe, expect, it } from 'vitest';
import {
    resolveMiniAppMetaTracking,
    resolveMiniAppSubmitEventType,
    resolveMiniAppViewEventType,
    sanitizeMiniAppEventSourceUrl
} from '../../../web/src/pages/public/miniapp/trackingEvents';

describe('MiniApp web tracking event names', () => {
    it('maps MiniApp views to business funnel event names', () => {
        expect(resolveMiniAppViewEventType('HOME')).toBe('MiniAppOpen');
        expect(resolveMiniAppViewEventType('INVENTORY')).toBe('ViewInventory');
        expect(resolveMiniAppViewEventType('CATALOG')).toBe('ViewInventory');
        expect(resolveMiniAppViewEventType('FAVORITES')).toBe('ViewInventory');
        expect(resolveMiniAppViewEventType('LISTING')).toBe('ViewCar');
        expect(resolveMiniAppViewEventType('B2B_REQUESTS')).toBe('ViewShowcase');
        expect(resolveMiniAppViewEventType('REQUEST')).toBe('LeadFormStart');
        expect(resolveMiniAppViewEventType('UNKNOWN')).toBe('MiniAppOpen');
    });

    it('maps submit flows to lead or B2B business event names', () => {
        expect(resolveMiniAppSubmitEventType({ isB2BMode: false, requestType: 'BUY' })).toBe('LeadSubmit');
        expect(resolveMiniAppSubmitEventType({ isB2BMode: true, requestType: 'BUY' })).toBe('B2BRequestCreate');
        expect(resolveMiniAppSubmitEventType({ isB2BMode: true, requestType: 'SELL' })).toBe('B2BRequestCreate');
    });

    it('creates Meta fbp and fbc identifiers from fbclid when cookies are missing', () => {
        const result = resolveMiniAppMetaTracking({
            fbclid: 'fbclid_123',
            nowMs: 1710000000000,
            randomPart: '987654321'
        });

        expect(result.fbp).toBe('fb.1.1710000000000.987654321');
        expect(result.fbc).toBe('fb.1.1710000000000.fbclid_123');
        expect(result.cookiesToPersist).toEqual([
            { name: '_fbp', value: 'fb.1.1710000000000.987654321' },
            { name: '_fbc', value: 'fb.1.1710000000000.fbclid_123' }
        ]);
    });

    it('keeps existing Meta identifiers when there is no new fbclid', () => {
        const result = resolveMiniAppMetaTracking({
            existingFbp: 'fb.1.1700000000000.111',
            existingFbc: 'fb.1.1700000000000.fbclid_old',
            nowMs: 1710000000000,
            randomPart: '987654321'
        });

        expect(result.fbp).toBe('fb.1.1700000000000.111');
        expect(result.fbc).toBe('fb.1.1700000000000.fbclid_old');
        expect(result.cookiesToPersist).toEqual([]);
    });

    it('keeps existing fbp but refreshes fbc for a new fbclid', () => {
        const result = resolveMiniAppMetaTracking({
            fbclid: 'fbclid_new',
            existingFbp: 'fb.1.1700000000000.111',
            existingFbc: 'fb.1.1700000000000.fbclid_old',
            nowMs: 1710000000000,
            randomPart: '987654321'
        });

        expect(result.fbp).toBe('fb.1.1700000000000.111');
        expect(result.fbc).toBe('fb.1.1710000000000.fbclid_new');
        expect(result.cookiesToPersist).toEqual([
            { name: '_fbc', value: 'fb.1.1710000000000.fbclid_new' }
        ]);
    });

    it('removes Telegram initData hash from Meta event source URLs', () => {
        expect(sanitizeMiniAppEventSourceUrl(
            'https://cartie.test/p/app/cartie?v=build#tgWebAppData=query_id%3D1%26user%3D%257B%257D%26hash%3Dsecret&tgWebAppPlatform=macos'
        )).toBe('https://cartie.test/p/app/cartie?v=build');
    });

    it('removes Telegram auth query params but keeps campaign params', () => {
        expect(sanitizeMiniAppEventSourceUrl(
            'https://cartie.test/p/app/cartie?utm_source=meta&tgWebAppData=secret&user=secret&fbclid=ClickId'
        )).toBe('https://cartie.test/p/app/cartie?utm_source=meta&fbclid=ClickId');
    });
});
