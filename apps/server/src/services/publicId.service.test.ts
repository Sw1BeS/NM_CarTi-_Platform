import { describe, expect, it, vi } from 'vitest';

const upsertMock = vi.fn();

vi.mock('./prisma.js', () => ({
  prisma: {
    $transaction: async (fn: any) => fn({
      publicSequence: {
        upsert: upsertMock
      }
    })
  }
}));

describe('publicId.service', () => {
  it('builds CD-YYYY-###### format from sequence', async () => {
    upsertMock.mockResolvedValueOnce({ lastValue: 123 });
    const { publicIdService } = await import('./publicId.service.js');

    const result = await publicIdService.nextB2bRequestId('CD', new Date('2026-02-20T00:00:00Z'));
    expect(result).toBe('CD-2026-000123');
  });
});
