import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEnv } from './env.js';

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
  });
});
