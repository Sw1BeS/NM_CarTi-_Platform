import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTrackingRedirectRouter } from './trackingRedirect.routes.js';
import type { AttributionRedirectConfig } from '../../config/env.js';

const enabledConfig: AttributionRedirectConfig = {
  enabled: true,
  ttlDays: 30,
  defaultDestination: 'b2c_bot_sandbox',
  failMode: 'closed',
  botAllowlist: [
    {
      destination: 'b2c_bot_sandbox',
      botUsername: 'Cartie_Client_Bot'
    }
  ],
  webAllowlist: [
    {
      destination: 'adsquiz_usa',
      url: 'https://cartieua.adsquiz.io/1lCcazQtVN',
      appendAttributionParams: true
    }
  ]
};

const buildApp = (
  config: AttributionRedirectConfig,
  createSession = vi.fn(),
  trackMetaEvents = vi.fn().mockResolvedValue(undefined)
) => {
  const app = express();
  app.use('/r', createTrackingRedirectRouter({
    config,
    service: { createSession },
    trackMetaEvents
  }));
  return { app, createSession, trackMetaEvents };
};

describe('tracking redirect routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed when redirect bridge is disabled', async () => {
    const { app, createSession } = buildApp({
      ...enabledConfig,
      enabled: false
    });

    const res = await request(app).get('/r/bot?destination=b2c_bot_sandbox&fbclid=QAfbclid');

    expect(res.status).toBe(404);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('rejects unknown destinations without trusting raw bot username', async () => {
    const { app, createSession } = buildApp(enabledConfig);

    const res = await request(app).get('/r/bot?destination=evil&botUsername=Cartie_Client_Bot');

    expect(res.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('creates a session and redirects to the allowlisted Telegram bot', async () => {
    const createSession = vi.fn().mockResolvedValue({
      token: 'abcDEF_1234567890',
      redirectUrl: 'https://t.me/Cartie_Client_Bot?start=abcDEF_1234567890',
      snapshot: {},
      cookies: {
        fbp: 'fb.1.1779865200000.123456789',
        fbc: 'fb.1.1779865200000.QAfbclidCASE'
      }
    });
    const { app, trackMetaEvents } = buildApp(enabledConfig, createSession);

    const res = await request(app)
      .get('/r/bot?destination=b2c_bot_sandbox&utm_source=meta&fbclid=QAfbclidCASE')
      .set('user-agent', 'Mozilla/5.0')
      .set('x-forwarded-for', '203.0.113.10');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://t.me/Cartie_Client_Bot?start=abcDEF_1234567890');
    expect(res.headers['set-cookie'].join('\n')).toContain('_fbp=fb.1.1779865200000.123456789');
    expect(res.headers['set-cookie'].join('\n')).toContain('_fbc=fb.1.1779865200000.QAfbclidCASE');
    expect(res.headers['set-cookie'].join('\n')).toContain('HttpOnly');
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      destination: 'b2c_bot_sandbox',
      botUsername: 'Cartie_Client_Bot',
      source: 'meta',
      query: expect.objectContaining({
        fbclid: 'QAfbclidCASE'
      }),
      requestMeta: expect.objectContaining({
        ip: '203.0.113.10',
        userAgent: 'Mozilla/5.0'
      })
    }));
    expect(trackMetaEvents).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'bot',
      destination: 'b2c_bot_sandbox',
      result: expect.objectContaining({
        token: 'abcDEF_1234567890'
      })
    }));
  });

  it('fails closed when enabled without allowlist', async () => {
    const { app, createSession } = buildApp({
      ...enabledConfig,
      botAllowlist: []
    });

    const res = await request(app).get('/r/bot?destination=b2c_bot_sandbox');

    expect(res.status).toBe(503);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('creates a session and redirects to an allowlisted AdsQuiz URL', async () => {
    const createSession = vi.fn().mockResolvedValue({
      token: 'quizTOKEN_1234567890',
      redirectUrl: 'https://cartieua.adsquiz.io/1lCcazQtVN?cartie_attribution_token=quizTOKEN_1234567890&fbclid=QuizClick',
      snapshot: {},
      cookies: {
        fbp: 'fb.1.1779865200000.223456789',
        fbc: 'fb.1.1779865200000.QuizClick'
      }
    });
    const { app, trackMetaEvents } = buildApp(enabledConfig, createSession);

    const res = await request(app)
      .get('/r/quiz?destination=adsquiz_usa&utm_source=meta&fbclid=QuizClick')
      .set('user-agent', 'Mozilla/5.0 AdsQuiz')
      .set('x-forwarded-for', '203.0.113.42');

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://cartieua.adsquiz.io/1lCcazQtVN?cartie_attribution_token=quizTOKEN_1234567890&fbclid=QuizClick');
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({
      destination: 'adsquiz_usa',
      redirectUrl: 'https://cartieua.adsquiz.io/1lCcazQtVN',
      appendAttributionParams: true,
      source: 'meta',
      query: expect.objectContaining({
        fbclid: 'QuizClick'
      }),
      requestMeta: expect.objectContaining({
        ip: '203.0.113.42',
        userAgent: 'Mozilla/5.0 AdsQuiz'
      })
    }));
    expect(trackMetaEvents).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'web',
      destination: 'adsquiz_usa',
      result: expect.objectContaining({
        token: 'quizTOKEN_1234567890',
        cookies: expect.objectContaining({
          fbp: 'fb.1.1779865200000.223456789',
          fbc: 'fb.1.1779865200000.QuizClick'
        })
      })
    }));
  });
});
