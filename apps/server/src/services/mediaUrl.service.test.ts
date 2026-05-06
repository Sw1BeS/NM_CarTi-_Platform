import { describe, expect, it } from 'vitest';
import { collectNormalizedMediaUrls, normalizeMediaUrl } from './mediaUrl.service.js';

describe('mediaUrl.service', () => {
  it('rewrites localhost proxy URLs to same-origin paths for MiniApp API output', () => {
    expect(normalizeMediaUrl('http://localhost:3000/api/proxy/mtproto/bot/chat/1')).toBe('/api/proxy/mtproto/bot/chat/1');
    expect(normalizeMediaUrl('http://127.0.0.1:3000/storage/media/a.jpg')).toBe('/storage/media/a.jpg');
  });

  it('builds absolute public URLs for Telegram media sends', () => {
    const url = normalizeMediaUrl('/api/proxy/mtproto/bot/chat/1', {
      absolute: true,
      publicBaseUrl: 'https://cartie2.umanoff-analytics.space'
    });

    expect(url).toBe('https://cartie2.umanoff-analytics.space/api/proxy/mtproto/bot/chat/1');
  });

  it('deduplicates thumbnail, mediaUrls, and mediaItems while preserving order', () => {
    const media = collectNormalizedMediaUrls({
      thumbnail: 'http://localhost:3000/api/proxy/a',
      mediaUrls: ['http://localhost:3000/api/proxy/a', '/api/proxy/b'],
      mediaItems: [{ url: '/api/proxy/b' }, { previewUrl: '/api/proxy/c' }]
    });

    expect(media).toEqual(['/api/proxy/a', '/api/proxy/b', '/api/proxy/c']);
  });
});
