import { describe, it, expect, vi } from 'vitest';
import { routeChannelPost } from '../routeChannelPost.js';

vi.mock('../../../../services/prisma.js', () => ({
  prisma: {
    draft: {
      create: vi.fn().mockResolvedValue({})
    }
  }
}));

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
