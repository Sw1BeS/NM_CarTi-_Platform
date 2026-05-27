import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    attributionSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock('../../services/prisma.js', () => ({
  prisma: prismaMock
}));

const fixedNow = new Date('2026-05-27T07:00:00.000Z');

const buildRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 'attr_1',
  token: 'abcDEF_1234567890',
  companyId: 'company_1',
  botId: 'bot_1',
  destination: 'b2c_bot_sandbox',
  source: 'meta',
  query: {},
  identifiers: {},
  requestMeta: {},
  expiresAt: new Date('2026-06-26T07:00:00.000Z'),
  consumedAt: null,
  createdAt: fixedNow,
  updatedAt: fixedNow,
  ...overrides
});

describe('AttributionSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.attributionSession.create.mockImplementation(({ data }) => Promise.resolve(buildRecord({
      ...data,
      createdAt: fixedNow,
      updatedAt: fixedNow
    })));
  });

  it('creates a base64url-safe Telegram token and sanitized snapshot', async () => {
    const { AttributionSessionService } = await import('./attributionSession.service.js');
    const service = new AttributionSessionService(prismaMock, 30);

    const result = await service.createSession({
      companyId: 'company_1',
      botId: 'bot_1',
      destination: 'b2c_bot_sandbox',
      botUsername: 'Cartie_Client_Bot',
      query: {
        fbclid: 'AbC123_case_sensitive',
        utm_source: 'meta',
        utm_campaign: 'spring',
        phone: '+380635055252',
        email: 'client@example.com'
      },
      requestMeta: {
        ip: '203.0.113.10',
        userAgent: 'Mozilla/5.0',
        eventSourceUrl: 'https://cartie.example/r/bot?fbclid=AbC123_case_sensitive',
        referrer: 'https://facebook.com/'
      },
      now: fixedNow
    });

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{12,64}$/);
    expect(result.token.length).toBeLessThanOrEqual(64);
    expect(result.redirectUrl).toBe(`https://t.me/Cartie_Client_Bot?start=${result.token}`);
    expect(result.snapshot.query).toEqual({
      fbclid: 'AbC123_case_sensitive',
      utm_source: 'meta',
      utm_campaign: 'spring'
    });
    expect(result.snapshot.identifiers).toMatchObject({
      fbclid: 'AbC123_case_sensitive',
      fbc: `fb.1.${fixedNow.getTime()}.AbC123_case_sensitive`,
      client_ip_address: '203.0.113.10',
      client_user_agent: 'Mozilla/5.0'
    });
    expect(result.snapshot.identifiers.fbp).toMatch(/^fb\.1\.1779865200000\.\d+$/);
    const createData = prismaMock.attributionSession.create.mock.calls[0][0].data;
    expect(JSON.stringify(createData)).not.toContain('+380635055252');
    expect(JSON.stringify(createData)).not.toContain('client@example.com');
  });

  it('reuses existing fbp and fbc cookies when present', async () => {
    const { AttributionSessionService } = await import('./attributionSession.service.js');
    const service = new AttributionSessionService(prismaMock, 30);

    const result = await service.createSession({
      destination: 'b2c_bot_sandbox',
      botUsername: 'Cartie_Client_Bot',
      query: { fbclid: 'NewClick' },
      requestMeta: {},
      cookies: {
        fbp: 'fb.1.1111111111111.123456789',
        fbc: 'fb.1.1111111111111.ExistingClick'
      },
      now: fixedNow
    });

    expect(result.snapshot.identifiers).toMatchObject({
      fbp: 'fb.1.1111111111111.123456789',
      fbc: 'fb.1.1111111111111.ExistingClick'
    });
  });

  it('rejects expired token lookup', async () => {
    const { AttributionSessionService } = await import('./attributionSession.service.js');
    prismaMock.attributionSession.findUnique.mockResolvedValue(buildRecord({
      expiresAt: new Date('2026-05-26T07:00:00.000Z')
    }));
    const service = new AttributionSessionService(prismaMock, 30);

    const snapshot = await service.lookupToken('abcDEF_1234567890', { now: fixedNow });

    expect(snapshot).toBeNull();
  });

  it('marks a token consumed only when requested', async () => {
    const { AttributionSessionService } = await import('./attributionSession.service.js');
    prismaMock.attributionSession.findUnique.mockResolvedValue(buildRecord({
      query: { utm_source: 'meta' },
      identifiers: { fbc: 'fb.1.111.Click' }
    }));
    prismaMock.attributionSession.update.mockResolvedValue(buildRecord({
      consumedAt: fixedNow,
      query: { utm_source: 'meta' },
      identifiers: { fbc: 'fb.1.111.Click' }
    }));
    const service = new AttributionSessionService(prismaMock, 30);

    const snapshot = await service.lookupToken('abcDEF_1234567890', { consume: true, now: fixedNow });

    expect(snapshot).toMatchObject({
      token: 'abcDEF_1234567890',
      query: { utm_source: 'meta' },
      identifiers: { fbc: 'fb.1.111.Click' }
    });
    expect(prismaMock.attributionSession.update).toHaveBeenCalledWith({
      where: { token: 'abcDEF_1234567890' },
      data: { consumedAt: fixedNow }
    });
  });
});
