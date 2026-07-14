import { beforeEach, describe, expect, it, vi } from 'vitest';

const { trackDatasetWebsiteEventMock } = vi.hoisted(() => ({
  trackDatasetWebsiteEventMock: vi.fn()
}));

vi.mock('../../services/featureFlags.js', () => ({
  isEnvFlagEnabled: vi.fn((name: string, defaultValue = false) => (
    name === 'META_CAPI_ENABLED' ? true : defaultValue
  ))
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    warn: vi.fn()
  }
}));

vi.mock('../Integrations/meta/metaCapi.service.js', () => ({
  MetaCapiService: vi.fn().mockImplementation(() => ({
    trackDatasetWebsiteEvent: trackDatasetWebsiteEventMock
  }))
}));

describe('trackAttributionRedirectMetaEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ATTRIBUTION_META_COMPANY_ID', 'company_1');
    trackDatasetWebsiteEventMock.mockResolvedValue({ success: true });
  });

  it('routes AdsQuiz web bridge events to the main quiz target with browser match keys', async () => {
    const { trackAttributionRedirectMetaEvents } = await import('./trackingRedirect.routes.js');

    await trackAttributionRedirectMetaEvents({
      kind: 'web',
      destination: 'adsquiz_usa',
      result: {
        token: 'quizTOKEN_1234567890',
        redirectUrl: 'https://cartieua.adsquiz.io/?cartie_attribution_token=quizTOKEN_1234567890',
        cookies: {},
        snapshot: {
          token: 'quizTOKEN_1234567890',
          destination: 'adsquiz_usa',
          query: {
            utm_source: 'meta',
            utm_medium: 'cpc',
            utm_campaign: 'TOF|Quiz',
            ad_id: 'ad_1'
          },
          identifiers: {
            fbp: 'fb.1.1779865200000.223456789',
            fbc: 'fb.1.1779865200000.QuizClick',
            client_ip_address: '203.0.113.42',
            client_user_agent: 'Mozilla/5.0 AdsQuiz'
          },
          event_source_url: 'https://cartie2.umanoff-analytics.space/r/quiz?destination=adsquiz_usa&fbclid=QuizClick',
          created_at: '2026-06-17T13:00:00.000Z',
          expires_at: '2026-07-17T13:00:00.000Z'
        }
      },
      req: {
        get: vi.fn(),
        protocol: 'https',
        originalUrl: '/r/quiz?destination=adsquiz_usa',
        ip: '203.0.113.99',
        socket: {}
      } as any
    });

    expect(trackDatasetWebsiteEventMock).toHaveBeenCalledTimes(2);
    expect(trackDatasetWebsiteEventMock).toHaveBeenNthCalledWith(1, 'main_quiz', 'company_1', 'PageView', expect.objectContaining({
      eventId: 'attribution:quizTOKEN_1234567890:PageView:adsquiz_usa:main_quiz',
      externalId: 'attribution:quizTOKEN_1234567890',
      fbp: 'fb.1.1779865200000.223456789',
      fbc: 'fb.1.1779865200000.QuizClick',
      ip: '203.0.113.42',
      userAgent: 'Mozilla/5.0 AdsQuiz',
      eventSourceUrl: 'https://cartie2.umanoff-analytics.space/r/quiz?destination=adsquiz_usa&fbclid=QuizClick',
      actionSource: 'website',
      entityType: 'attribution_redirect',
      entityId: 'quizTOKEN_1234567890',
      stage: 'adsquiz_usa:pageview:main_quiz',
      customData: expect.objectContaining({
        source: 'attribution_redirect',
        event_role: 'bridge_pageview',
        destination: 'adsquiz_usa',
        redirect_kind: 'web',
        redirect_host: 'cartieua.adsquiz.io',
        utm_source: 'meta',
        utm_campaign: 'TOF|Quiz',
        ad_id: 'ad_1'
      })
    }));
    expect(trackDatasetWebsiteEventMock).toHaveBeenNthCalledWith(2, 'main_quiz', 'company_1', 'adsquiz_Start', expect.objectContaining({
      eventId: 'attribution:quizTOKEN_1234567890:adsquiz_Start:adsquiz_usa:main_quiz',
      stage: 'adsquiz_usa:adsquiz_start:main_quiz',
      customData: expect.objectContaining({
        event_role: 'adsquiz_start'
      })
    }));
    expect(JSON.stringify(trackDatasetWebsiteEventMock.mock.calls)).not.toContain('cartie_attribution_token');
  });

  it('routes bot bridge PageView to the b2c bot target without adsquiz_Start', async () => {
    const { trackAttributionRedirectMetaEvents } = await import('./trackingRedirect.routes.js');

    await trackAttributionRedirectMetaEvents({
      kind: 'bot',
      destination: 'b2c_bot_sandbox',
      result: {
        token: 'botTOKEN_1234567890',
        redirectUrl: 'https://t.me/cartie_client_bot?start=botTOKEN_1234567890',
        cookies: {
          fbp: 'fb.1.1779865200000.223456789',
          fbc: 'fb.1.1779865200000.BotClick'
        },
        snapshot: {
          token: 'botTOKEN_1234567890',
          destination: 'b2c_bot_sandbox',
          query: {
            utm_source: 'meta',
            utm_campaign: 'TOF|Bot'
          },
          identifiers: {
            client_ip_address: '203.0.113.43',
            client_user_agent: 'Mozilla/5.0 Telegram'
          },
          event_source_url: 'https://cartie2.umanoff-analytics.space/r/bot?destination=b2c_bot_sandbox&fbclid=BotClick',
          created_at: '2026-06-17T13:00:00.000Z',
          expires_at: '2026-07-17T13:00:00.000Z'
        }
      },
      req: {
        get: vi.fn(),
        protocol: 'https',
        originalUrl: '/r/bot?destination=b2c_bot_sandbox',
        ip: '203.0.113.99',
        socket: {}
      } as any
    });

    expect(trackDatasetWebsiteEventMock).toHaveBeenCalledTimes(1);
    expect(trackDatasetWebsiteEventMock).toHaveBeenCalledWith('b2c_bot', 'company_1', 'PageView', expect.objectContaining({
      eventId: 'attribution:botTOKEN_1234567890:PageView:b2c_bot_sandbox:b2c_bot',
      stage: 'b2c_bot_sandbox:pageview:b2c_bot',
      actionSource: 'website',
      eventSourceUrl: 'https://cartie2.umanoff-analytics.space/r/bot?destination=b2c_bot_sandbox&fbclid=BotClick',
      customData: expect.objectContaining({
        event_role: 'bridge_pageview',
        redirect_kind: 'bot'
      })
    }));
  });
});
