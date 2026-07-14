import { describe, expect, it } from 'vitest';
import { buildSessionAttributionPayload, mergeSessionAttributionPayload } from './sessionAttribution.js';

const ctxWithAttribution = (): any => ({
  session: {
    variables: {
      attributionToken: 'AbC_token_123456',
      attribution: {
        token: 'AbC_token_123456',
        destination: 'b2c_bot_sandbox',
        query: {
          utm_source: 'meta',
          utm_campaign: 'spring',
          fbclid: 'ClickId'
        },
        identifiers: {
          fbclid: 'ClickId',
          fbp: 'fb.1.1779865200000.123456789',
          fbc: 'fb.1.1779865200000.ClickId',
          client_ip_address: '203.0.113.10',
          client_user_agent: 'Mozilla/5.0'
        },
        event_source_url: 'https://cartie.test/r/bot?fbclid=ClickId',
        created_at: '2026-05-27T07:00:00.000Z',
        expires_at: '2026-06-26T07:00:00.000Z'
      }
    }
  }
});

describe('session attribution payload helpers', () => {
  it('builds payload data that createOrMergeLead can resolve into Meta match keys', () => {
    const payload = buildSessionAttributionPayload(ctxWithAttribution());

    expect(payload).toMatchObject({
      attributionToken: 'AbC_token_123456',
      startParam: 'AbC_token_123456',
      attribution: expect.objectContaining({
        token: 'AbC_token_123456'
      }),
      tracking: expect.objectContaining({
        attributionToken: 'AbC_token_123456',
        fbclid: 'ClickId',
        fbp: 'fb.1.1779865200000.123456789',
        fbc: 'fb.1.1779865200000.ClickId',
        client_ip_address: '203.0.113.10',
        client_user_agent: 'Mozilla/5.0',
        eventSourceUrl: 'https://cartie.test/r/bot?fbclid=ClickId',
        utm_source: 'meta',
        utm_campaign: 'spring'
      })
    });
  });

  it('does not overwrite request-specific tracking values when merging', () => {
    const payload = mergeSessionAttributionPayload(ctxWithAttribution(), {
      comment: 'client note',
      tracking: {
        utm_campaign: 'manual_override'
      }
    });

    expect(payload).toMatchObject({
      comment: 'client note',
      attributionToken: 'AbC_token_123456',
      tracking: expect.objectContaining({
        fbp: 'fb.1.1779865200000.123456789',
        fbc: 'fb.1.1779865200000.ClickId',
        utm_campaign: 'manual_override'
      })
    });
  });

  it('returns the original payload when no session attribution exists', () => {
    const original = { comment: 'plain' };

    expect(mergeSessionAttributionPayload({ session: { variables: {} } } as any, original)).toBe(original);
  });
});
