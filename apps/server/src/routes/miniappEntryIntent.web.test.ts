import { describe, expect, it } from 'vitest';
import {
  isMiniAppReadOnlyLaunch,
  parseMiniAppEntryIntent,
  resolveMiniAppInternalLinkIntent
} from '../../../web/src/pages/public/miniapp/entryIntent.ts';

describe('MiniApp entry intent parser', () => {
  it('routes Lead sell deep links to bot flow instead of the request form', () => {
    expect(parseMiniAppEntryIntent(new URLSearchParams('entry=request&type=SELL'), undefined, 'LEAD')).toMatchObject({
      botFlow: 'SELL'
    });
    expect(parseMiniAppEntryIntent(new URLSearchParams(), 'sell_car', 'LEAD')).toMatchObject({
      botFlow: 'SELL',
      consumedStartParam: true
    });
  });

  it('keeps B2B sell intents inside the request form', () => {
    expect(parseMiniAppEntryIntent(new URLSearchParams('entry=request&type=SELL'), undefined, 'B2B')).toMatchObject({
      view: 'REQUEST',
      requestType: 'SELL'
    });
  });

  it('parses inventory and contacts aliases', () => {
    expect(parseMiniAppEntryIntent(new URLSearchParams('entry=inventory&status=PENDING'))).toMatchObject({
      view: 'INVENTORY',
      tab: 'IN_TRANSIT'
    });
    expect(parseMiniAppEntryIntent(new URLSearchParams('entry=inventory&availabilityState=IN_TRANSIT'))).toMatchObject({
      view: 'INVENTORY',
      tab: 'IN_TRANSIT'
    });
    expect(parseMiniAppEntryIntent(new URLSearchParams('entry=inventory&availabilityState=IN_STOCK'))).toMatchObject({
      view: 'INVENTORY',
      tab: 'IN_STOCK'
    });
    expect(parseMiniAppEntryIntent(new URLSearchParams(), 'contacts')).toMatchObject({
      view: 'CONTACTS',
      consumedStartParam: true
    });
  });

  it('treats direct car links from admin chat as read-only preview launches', () => {
    const params = new URLSearchParams('entry=inventory&carId=car_1');

    expect(isMiniAppReadOnlyLaunch(params)).toBe(true);
    expect(isMiniAppReadOnlyLaunch(new URLSearchParams('entry=inventory&availabilityState=IN_TRANSIT'))).toBe(true);
    expect(isMiniAppReadOnlyLaunch(new URLSearchParams(), 'view_transit')).toBe(true);
    expect(parseMiniAppEntryIntent(params)).toMatchObject({
      view: 'INVENTORY'
    });
  });

  it('treats bare direct /p/app/:slug browser launches as read-only home previews', () => {
    expect(isMiniAppReadOnlyLaunch(new URLSearchParams())).toBe(true);
    expect(parseMiniAppEntryIntent(new URLSearchParams())).toEqual({});
  });

  it('treats explicit admin preview links as read-only even when they only carry preview mode', () => {
    expect(isMiniAppReadOnlyLaunch(new URLSearchParams('preview=admin_chat'))).toBe(true);
    expect(isMiniAppReadOnlyLaunch(new URLSearchParams('entry=request&type=BUY&preview=admin_chat'))).toBe(false);
  });

  it('does not treat request/profile/favorites launches as read-only', () => {
    expect(isMiniAppReadOnlyLaunch(new URLSearchParams('entry=request&type=BUY'))).toBe(false);
    expect(isMiniAppReadOnlyLaunch(new URLSearchParams('entry=favorites'))).toBe(false);
    expect(isMiniAppReadOnlyLaunch(new URLSearchParams('entry=profile'))).toBe(false);
  });

  it('resolves internal MiniApp action links without reopening the app as an external link', () => {
    expect(resolveMiniAppInternalLinkIntent('/p/app/cartie?entry=contacts', 'LEAD')).toEqual({
      slug: 'cartie',
      carId: undefined,
      intent: { view: 'CONTACTS' }
    });

    expect(resolveMiniAppInternalLinkIntent('https://cartie.test/p/app/cartie?entry=inventory&carId=car_1', 'LEAD')).toMatchObject({
      slug: 'cartie',
      carId: 'car_1',
      intent: { view: 'INVENTORY' }
    });
  });
});
