const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const getStatus = (error: any) => Number(error?.response?.status || error?.status || 0);

export const withBackoff = async <T>(
  task: () => Promise<T>,
  opts: { maxAttempts?: number; initialDelayMs?: number } = {}
): Promise<T> => {
  const maxAttempts = Math.max(1, opts.maxAttempts || 4);
  let delay = Math.max(100, opts.initialDelayMs || 600);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error: any) {
      lastError = error;
      const status = getStatus(error);
      const retryable = status === 403 || status === 429 || status === 0;
      if (!retryable || attempt >= maxAttempts) break;
      await sleep(delay);
      delay = Math.min(delay * 2, 15_000);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Backoff execution failed');
};
