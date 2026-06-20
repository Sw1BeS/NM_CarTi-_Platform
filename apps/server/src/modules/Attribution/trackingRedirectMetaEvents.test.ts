import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, trackEventMock } = vi.hoisted(() => ({
  prismaMock: {
    integration: {
      findFirst: vi.fn()
    }
  },
  trackEventMock: vi.fn()
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: prismaMock
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
    trackEvent: trackEventMock
  }))
}));

describe('trackAttributionRedirectMetaEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('META_B2C_BOT_DATASET_ID', '1152615213548168');
    prismaMock.integration.findFirst.mockResolvedValue({ companyId: 'company_1' });
    trackEventMock.mockResolvedValue({ success: true });
  });

  it('sends PageView and adsquiz_Start for AdsQuiz bridge clicks with browser match keys', async () => {
    const { trackAttributionRedirectMetaEvents } = await import('./trackingRedirect.routes.js');

    await trackAttributionRedirectMetaEvents({
      kind: 'web',
      destination: 'adsquiz_usa',
      result: {
        token: 'quizTOKEN_1234567890',
        redirectUrl: 'https://cartieua.adsquiz.io/1lCcazQtVN?cartie_attribution_token=quizTOKEN_1234567890',
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

    expect(prismaMock.integration.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: 'META_PIXEL',
        isActive: true,
        config: { path: ['pixelId'], equals: '1152615213548168' }
      })
    }));
    expect(trackEventMock).toHaveBeenCalledTimes(2);
    expect(trackEventMock).toHaveBeenNthCalledWith(1, 'company_1', 'PageView', expect.objectContaining({
      eventId: 'attribution:quizTOKEN_1234567890:PageView:adsquiz_usa',
      externalId: 'attribution:quizTOKEN_1234567890',
      fbp: 'fb.1.1779865200000.223456789',
      fbc: 'fb.1.1779865200000.QuizClick',
      ip: '203.0.113.42',
      userAgent: 'Mozilla/5.0 AdsQuiz',
      eventSourceUrl: 'https://cartie2.umanoff-analytics.space/r/quiz?destination=adsquiz_usa&fbclid=QuizClick',
      actionSource: 'website',
      entityType: 'attribution_redirect',
      entityId: 'quizTOKEN_1234567890',
      stage: 'adsquiz_usa:pageview',
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
    expect(trackEventMock).toHaveBeenNthCalledWith(2, 'company_1', 'adsquiz_Start', expect.objectContaining({
      eventId: 'attribution:quizTOKEN_1234567890:adsquiz_Start:adsquiz_usa',
      stage: 'adsquiz_usa:adsquiz_start',
      customData: expect.objectContaining({
        event_role: 'adsquiz_start'
      })
    }));
    expect(JSON.stringify(trackEventMock.mock.calls)).not.toContain('cartie_attribution_token');
  });
});
