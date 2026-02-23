import { afterEach, describe, expect, it, vi } from 'vitest';
import { withBackoff } from './backoff.js';

describe('withBackoff', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries on 403/429 with exponential delays', async () => {
    vi.useFakeTimers();

    const task = vi.fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce({ response: { status: 403 } })
      .mockResolvedValue('ok');

    const execution = withBackoff(task, {
      maxAttempts: 4,
      initialDelayMs: 100
    });

    await vi.runAllTimersAsync();
    await expect(execution).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable statuses', async () => {
    const error = Object.assign(new Error('HTTP_500'), { response: { status: 500 } });
    const task = vi.fn().mockRejectedValue(error);

    await expect(withBackoff(task, {
      maxAttempts: 4,
      initialDelayMs: 100
    })).rejects.toBe(error);

    expect(task).toHaveBeenCalledTimes(1);
  });
});
