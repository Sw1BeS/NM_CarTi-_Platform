const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class DomainRateLimiter {
  private lastByDomain = new Map<string, number>();

  constructor(private readonly minIntervalMs: number = 1000) {}

  async waitTurn(url: string) {
    let domain = '';
    try {
      domain = new URL(url).hostname.toLowerCase();
    } catch {
      return;
    }

    const now = Date.now();
    const last = this.lastByDomain.get(domain) || 0;
    const remaining = this.minIntervalMs - (now - last);
    if (remaining > 0) {
      await sleep(remaining);
    }

    this.lastByDomain.set(domain, Date.now());
  }
}

export const externalDomainRateLimiter = new DomainRateLimiter(1000);
