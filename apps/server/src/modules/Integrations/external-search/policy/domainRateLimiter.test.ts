import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainRateLimiter } from './domainRateLimiter.js';

describe('DomainRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enforces max 1 request per second for the same domain', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-23T00:00:00.000Z'));

    const limiter = new DomainRateLimiter(1000);
    await limiter.waitTurn('https://example.com/search?q=1');

    let finished = false;
    const secondTurn = limiter.waitTurn('https://example.com/search?q=2').then(() => {
      finished = true;
    });

    await Promise.resolve();
    expect(finished).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(finished).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await secondTurn;
    expect(finished).toBe(true);
  });

  it('does not throttle different domains with shared limiter', async () => {
    const limiter = new DomainRateLimiter(1000);
    await limiter.waitTurn('https://example.com/a');
    await expect(limiter.waitTurn('https://olx.ua/b')).resolves.toBeUndefined();
  });
});
