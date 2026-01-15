import { describe, expect, it, vi } from 'vitest';

vi.mock('./normalizationStore.js', async () => {
  const actual = await vi.importActual<any>('./normalizationStore.js');
  return {
    ...actual,
    lookupAlias: vi.fn(async () => undefined)
  };
});

import { normalizeBrand } from './normalizeBrand.js';

describe('normalizeBrand', () => {
  it('maps Cyrillic alias to canonical brand', async () => {
    const result = await normalizeBrand('БМВ');
    expect(result).toBe('BMW');
  });
});
