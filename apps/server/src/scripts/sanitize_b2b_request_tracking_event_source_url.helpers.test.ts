import { describe, expect, it } from 'vitest';
import { sanitizeB2bRequestTrackingPayload } from './sanitize_b2b_request_tracking_event_source_url.helpers.js';

describe('sanitizeB2bRequestTrackingPayload', () => {
  it('sanitizes historical tracking eventSourceUrl fields and preserves campaign params', () => {
    const result = sanitizeB2bRequestTrackingPayload({
      id: 'request_1',
      payload: {
        tracking: {
          eventSourceUrl: 'https://cartie.test/p/app/cartie?utm_source=meta&fbclid=ClickId&tgWebAppData=secret&initData=raw#tgWebAppData=fragment',
          meta: {
            event_source_url: 'https://cartie.test/p/app/cartie?utm_campaign=lead&telegram_init_data=raw&hash=hash'
          }
        },
        untouched: {
          eventSourceUrl: 'https://external.test/keep?tgWebAppData=not-in-owned-path'
        }
      }
    });

    expect(result.changed).toBe(true);
    expect(result.beforeUrls).toHaveLength(2);
    expect(result.afterUrls).toEqual([
      'https://cartie.test/p/app/cartie?utm_source=meta&fbclid=ClickId',
      'https://cartie.test/p/app/cartie?utm_campaign=lead'
    ]);
    expect(result.payload).toMatchObject({
      tracking: {
        eventSourceUrl: 'https://cartie.test/p/app/cartie?utm_source=meta&fbclid=ClickId',
        meta: {
          event_source_url: 'https://cartie.test/p/app/cartie?utm_campaign=lead'
        }
      },
      untouched: {
        eventSourceUrl: 'https://external.test/keep?tgWebAppData=not-in-owned-path'
      }
    });
  });

  it('reports unchanged payloads without rewriting them', () => {
    const payload = {
      tracking: {
        eventSourceUrl: 'https://cartie.test/p/app/cartie?utm_source=meta&fbclid=ClickId'
      }
    };

    const result = sanitizeB2bRequestTrackingPayload({ id: 'request_2', payload });

    expect(result.changed).toBe(false);
    expect(result.payload).toBe(payload);
  });
});
