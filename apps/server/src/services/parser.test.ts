import { describe, it, expect } from 'vitest';
import { parseListingFromUrl } from './parser.js';

describe('Parser Service', () => {
  it('should be defined', () => {
    expect(parseListingFromUrl).toBeDefined();
  });

  // Since we mock nothing, this will fail on network if we try to fetch google.
  // We just test if it returns a failure object gracefully.
  it('should handle invalid urls gracefully', async () => {
    const result = await parseListingFromUrl('invalid-url');
    expect(result.confidence).toBe('low');
    expect(result.reason).toBeDefined();
  });
});
