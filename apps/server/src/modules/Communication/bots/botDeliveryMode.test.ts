import { describe, expect, it } from 'vitest';
import { normalizeBotDeliveryModeColumn, resolveRuntimeBotDeliveryMode } from './botDeliveryMode.js';

describe('botDeliveryMode', () => {
  it('prefers the typed Prisma deliveryMode column over legacy JSON config', () => {
    expect(resolveRuntimeBotDeliveryMode({
      deliveryMode: 'WEBHOOK',
      config: { deliveryMode: 'polling' }
    })).toBe('webhook');

    expect(resolveRuntimeBotDeliveryMode({
      deliveryMode: 'POLLING',
      config: { deliveryMode: 'webhook' }
    })).toBe('polling');
  });

  it('falls back to legacy JSON deliveryMode only when the column is missing', () => {
    expect(resolveRuntimeBotDeliveryMode({ config: { deliveryMode: 'webhook' } })).toBe('webhook');
    expect(resolveRuntimeBotDeliveryMode({ config: { deliveryMode: 'polling' } })).toBe('polling');
    expect(resolveRuntimeBotDeliveryMode({ config: {} })).toBe('polling');
  });

  it('normalizes deliveryMode input for Prisma writes', () => {
    expect(normalizeBotDeliveryModeColumn('webhook')).toBe('WEBHOOK');
    expect(normalizeBotDeliveryModeColumn('POLLING')).toBe('POLLING');
    expect(normalizeBotDeliveryModeColumn('invalid')).toBeUndefined();
  });
});
