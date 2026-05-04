import { beforeEach, describe, expect, it, vi } from 'vitest';

const findManyMock = vi.fn();

vi.mock('../../services/prisma.js', () => ({
  prisma: {
    normalizationAlias: {
      findMany: findManyMock
    }
  }
}));

vi.mock('./policy.service.js', () => ({
  orchestrationPolicyService: {
    ensureBaseSetup: vi.fn(async () => ({ policy: {}, aliases: [] }))
  }
}));

describe('promptIntentService.detect', () => {
  beforeEach(() => {
    findManyMock.mockReset();
    findManyMock.mockResolvedValue([
      { alias: 'prompt', canonical: 'prompt' },
      { alias: 'promt', canonical: 'prompt' },
      { alias: 'промт', canonical: 'prompt' },
      { alias: 'промпт', canonical: 'prompt' }
    ]);
  });

  it.each([
    'prompt: improve this task',
    'PROMT please rewrite it',
    'промт для лендинга',
    '  Промпт!!! сделай лучше  '
  ])('matches prompt intent for "%s"', async (text) => {
    const { promptIntentService } = await import('./promptIntent.service.js');
    const result = await promptIntentService.detect('company_123', text);

    expect(result.matched).toBe(true);
    expect(result.matchedAliases.length).toBeGreaterThan(0);
    expect(result.canonical).toBe('prompt');
  });

  it('does not match unrelated words', async () => {
    const { promptIntentService } = await import('./promptIntent.service.js');
    const result = await promptIntentService.detect('company_123', 'Schedule an impromptu meeting tomorrow');

    expect(result.matched).toBe(false);
    expect(result.matchedAliases).toEqual([]);
    expect(result.canonical).toBeNull();
  });
});
