import { describe, expect, it, vi } from 'vitest';
import { MTProtoService } from './mtproto.service.js';

describe('MTProtoService.extractMediaItems', () => {
  it('keeps refs only for DRAFT_ONLY policy without downloading media', async () => {
    const downloadMedia = vi.fn();
    const client = { downloadMedia };

    const result = await MTProtoService.extractMediaItems(client as any, {
      id: 101,
      media: {
        photo: {
          id: 123456n,
          accessHash: 98765n,
          fileReference: Buffer.from('ref')
        }
      }
    }, {
      sourceChatId: '-100123',
      sourceMessageId: 101,
      mediaPolicy: 'refs_only'
    });

    expect(downloadMedia).not.toHaveBeenCalled();
    expect(result.mediaUrls).toEqual([]);
    expect(result.mediaItems.length).toBe(1);
    expect(result.mediaItems[0].tgFileId).toBe('123456');
    expect(result.mediaItems[0].url).toBeUndefined();
  });
});
