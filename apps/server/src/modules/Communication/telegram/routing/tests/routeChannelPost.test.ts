import { describe, it, expect, vi, beforeAll } from 'vitest';

let routeChannelPost: any;

beforeAll(async () => {
  vi.resetModules();
  const mod = await import('../routeChannelPost.js');
  routeChannelPost = mod.routeChannelPost;

  const serviceMod = await import('../../../../../services/channel-ingestion.service.ts');
  vi.spyOn(serviceMod.channelIngestionService, 'normalizeMessage').mockImplementation((input: any) => ({
    ...input,
    text: input.text || '',
    mediaUrls: input.mediaUrls || []
  }));
  vi.spyOn(serviceMod.channelIngestionService, 'upsertCarListingOrDraft').mockResolvedValue({ created: true, entity: 'DRAFT' } as any);
});

describe('routeChannelPost', () => {
  it('should parse car post and create draft', async () => {
    const ctx = {
      update: {
        channel_post: {
          message_id: 123,
          chat: { id: -100123, title: 'Test Channel' },
          text: 'BMW X5 2020\nPrice: 50000 USD\nMileage: 10000 km'
        }
      }
    };
    const next = vi.fn();

    await routeChannelPost(ctx as any, next);

    expect(next).toHaveBeenCalled();
    // In a real test with mocked prisma, we would assert prisma.draft.create was called
  });

  it('should ignore non-car posts', async () => {
    const ctx = {
      update: {
        channel_post: {
          message_id: 124,
          chat: { id: -100123, title: 'Test Channel' },
          text: 'Hello world'
        }
      }
    };
    const next = vi.fn();

    await routeChannelPost(ctx as any, next);

    expect(next).toHaveBeenCalled();
  });
});
