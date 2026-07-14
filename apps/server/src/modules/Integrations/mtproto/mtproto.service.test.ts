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

  it('collects all media refs from the same Telegram album', async () => {
    const downloadMedia = vi.fn();
    const client = { downloadMedia };
    const messages = [
      {
        id: 202,
        groupedId: 777n,
        media: { photo: { id: 2020n, accessHash: 1n, fileReference: Buffer.from('a') } }
      },
      {
        id: 201,
        groupedId: 777n,
        message: 'BMW X5 2020\n50 000 $',
        media: { photo: { id: 2010n, accessHash: 2n, fileReference: Buffer.from('b') } }
      },
      {
        id: 200,
        groupedId: 123n,
        media: { photo: { id: 2000n, accessHash: 3n, fileReference: Buffer.from('c') } }
      }
    ];

    const group = MTProtoService.collectMediaGroupMessages(messages, messages[1]);
    const result = await MTProtoService.extractMediaItemsFromMessages(client as any, group, {
      sourceChatId: '-100123',
      sourceMessageId: 201,
      mediaPolicy: 'refs_only'
    });

    expect(downloadMedia).not.toHaveBeenCalled();
    expect(group.map((msg) => msg.id).sort()).toEqual([201, 202]);
    expect(result.mediaItems.map((item) => item.tgFileId).sort()).toEqual(['2010', '2020']);
  });
});
