import { describe, expect, it } from 'vitest';
import { detectMakeFromKnownList } from './taxonomy.js';

describe('taxonomy helpers', () => {
  it('detects longer make names before shorter aliases', () => {
    expect(detectMakeFromKnownList('Mercedes-Benz GLE 350', ['Mercedes', 'Mercedes-Benz'])).toBe('Mercedes-Benz');
  });

  it('treats hyphen and space variants as the same make token', () => {
    expect(detectMakeFromKnownList('Mercedes Benz GLE 350', ['Mercedes-Benz'])).toBe('Mercedes-Benz');
  });
});
