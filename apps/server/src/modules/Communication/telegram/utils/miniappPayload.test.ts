import { describe, expect, it } from 'vitest';
import { parseMiniAppPayload } from './miniappPayload.js';

describe('miniappPayload', () => {
  it('accepts valid v1 payload', () => {
    const result = parseMiniAppPayload({
      v: 1,
      type: 'lead_submit',
      carId: 'car_1',
      fields: { name: 'Alex', phone: '+380991112233' },
      meta: { source: 'miniapp' }
    });
    expect(result.ok).toBe(true);
  });

  it('rejects unsupported version', () => {
    const result = parseMiniAppPayload({ v: 2, type: 'lead_submit' });
    expect(result.ok).toBe(false);
  });

  it('rejects unknown type', () => {
    const result = parseMiniAppPayload({ v: 1, type: 'unknown' });
    expect(result.ok).toBe(false);
  });
});
