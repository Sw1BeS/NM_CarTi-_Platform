import { describe, expect, it } from 'vitest';
import { parseMiniAppEntryIntent } from '../../../web/src/pages/public/miniapp/entryIntent.ts';

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
    expect(parseMiniAppEntryIntent(new URLSearchParams(), 'contacts')).toMatchObject({
      view: 'CONTACTS',
      consumedStartParam: true
    });
  });
});
