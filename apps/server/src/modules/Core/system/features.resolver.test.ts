import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES, resolveFeatures } from './features.resolver.js';

describe('features.resolver', () => {
  it('uses server defaults when payload is empty', () => {
    const resolved = resolveFeatures(undefined);
    expect(resolved).toEqual(DEFAULT_FEATURES);
  });

  it('overrides known flags from payload', () => {
    const resolved = resolveFeatures({
      MODULE_COMPANIES: true,
      MODULE_INTEGRATIONS: true
    });

    expect(resolved.MODULE_COMPANIES).toBe(true);
    expect(resolved.MODULE_INTEGRATIONS).toBe(true);
    expect(resolved.MODULE_SCENARIOS).toBe(true);
  });

  it('keeps unknown flags as booleans for forward compatibility', () => {
    const resolved = resolveFeatures({
      CUSTOM_EXPERIMENT: true,
      CUSTOM_DISABLED: 'false'
    });

    expect(resolved.CUSTOM_EXPERIMENT).toBe(true);
    expect(resolved.CUSTOM_DISABLED).toBe(false);
  });
});
