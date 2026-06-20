import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAttributionRedirectConfig, validateEnv } from './env.js';

describe('validateEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts B2C bot Meta CAPI and SalesDrive inbound webhook env keys without enabling them by default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('META_CAPI_ENABLED', 'false');
    vi.stubEnv('META_B2C_BOT_CAPI_ENABLED', 'false');
    vi.stubEnv('META_B2C_BOT_PURCHASE_ENABLED', 'false');
    vi.stubEnv('META_B2C_BOT_TEST_MODE', 'true');
    vi.stubEnv('META_B2C_BOT_DATASET_ID', '1152615213548168');
    vi.stubEnv('META_B2C_BOT_DESTINATION_KEY', 'b2c_bot_sandbox');
    vi.stubEnv('META_B2C_BOT_ACCESS_TOKEN', 'env-only-token');
    vi.stubEnv('META_B2C_BOT_TEST_EVENT_CODE', 'TEST46105');
    vi.stubEnv('SALESDRIVE_WEBHOOK_SECRET', 'webhook-secret');
    vi.stubEnv('SALESDRIVE_B2C_META_STATUS_MAP', '[{"statusIds":["2"],"eventName":"QualifiedLead"}]');
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST', 'cartie');
    vi.stubEnv('SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST', '1');
    vi.stubEnv('SALESDRIVE_DEFAULT_CURRENCY', 'USD');
    vi.stubEnv('SALESDRIVE_WEBHOOK_TIMEZONE_OFFSET_MINUTES', '180');

    const env = validateEnv();

    expect(env.META_CAPI_ENABLED).toBe('false');
    expect(env.META_B2C_BOT_CAPI_ENABLED).toBe('false');
    expect(env.META_B2C_BOT_PURCHASE_ENABLED).toBe('false');
    expect(env.META_B2C_BOT_TEST_MODE).toBe('true');
    expect(env.META_B2C_BOT_DATASET_ID).toBe('1152615213548168');
    expect(env.META_B2C_BOT_DESTINATION_KEY).toBe('b2c_bot_sandbox');
    expect(env.META_B2C_BOT_ACCESS_TOKEN).toBe('env-only-token');
    expect(env.META_B2C_BOT_TEST_EVENT_CODE).toBe('TEST46105');
    expect(env.SALESDRIVE_WEBHOOK_SECRET).toBe('webhook-secret');
    expect(env.SALESDRIVE_B2C_META_STATUS_MAP).toContain('QualifiedLead');
    expect(env.SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST).toBe('cartie');
    expect(env.SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST).toBe('1');
    expect(env.SALESDRIVE_DEFAULT_CURRENCY).toBe('USD');
    expect(env.SALESDRIVE_WEBHOOK_TIMEZONE_OFFSET_MINUTES).toBe(180);
  });

  it('accepts attribution redirect env keys and keeps redirect disabled by default', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ATTRIBUTION_REDIRECT_ENABLED', 'false');
    vi.stubEnv('ATTRIBUTION_SESSION_TTL_DAYS', '30');
    vi.stubEnv('ATTRIBUTION_BOT_ALLOWLIST', 'b2c_bot_sandbox:Cartie_Client_Bot');
    vi.stubEnv('ATTRIBUTION_WEB_ALLOWLIST', 'adsquiz_usa=https://cartieua.adsquiz.io/1lCcazQtVN');
    vi.stubEnv('ATTRIBUTION_REDIRECT_FAIL_MODE', 'closed');

    const env = validateEnv();
    const config = getAttributionRedirectConfig(env);

    expect(config).toEqual({
      enabled: false,
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
    });
  });
});
