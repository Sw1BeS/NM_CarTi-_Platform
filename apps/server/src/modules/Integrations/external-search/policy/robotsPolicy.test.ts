import { beforeEach, describe, expect, it, vi } from 'vitest';

const { axiosGetMock, waitTurnMock } = vi.hoisted(() => ({
  axiosGetMock: vi.fn(),
  waitTurnMock: vi.fn()
}));

vi.mock('axios', () => ({
  default: {
    get: axiosGetMock
  }
}));

vi.mock('./domainRateLimiter.js', () => ({
  externalDomainRateLimiter: {
    waitTurn: waitTurnMock
  }
}));

vi.mock('./backoff.js', () => ({
  withBackoff: async <T>(task: () => Promise<T>) => task()
}));

import { isRobotsAllowed } from './robotsPolicy.js';

describe('robotsPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    waitTurnMock.mockResolvedValue(undefined);
  });

  it('blocks URL when robots has explicit disallow rule', async () => {
    axiosGetMock.mockResolvedValueOnce({
      status: 200,
      data: 'User-agent: *\nDisallow: /uk/car/\n'
    });

    const result = await isRobotsAllowed('https://auto.ria.com/uk/car/bmw/');
    expect(result).toEqual({ allowed: false, reason: 'disallow' });
  });

  it('allows URL when allow rule overrides disallow with longer match', async () => {
    axiosGetMock.mockResolvedValueOnce({
      status: 200,
      data: 'User-agent: *\nDisallow: /uk/\nAllow: /uk/car/\n'
    });

    const result = await isRobotsAllowed('https://www.olx.ua/uk/car/');
    expect(result).toEqual({ allowed: true, reason: 'allow_override' });
  });
});
