import { describe, expect, it } from 'vitest';
import { buildTelegramPhotoMedia, collectCarMediaSources } from './carMedia.js';

describe('carMedia utils', () => {
  it('collects thumbnail + mediaUrls + mediaItems and deduplicates', () => {
    const media = collectCarMediaSources({
      thumbnail: 'https://cdn/cover.jpg',
      mediaUrls: ['https://cdn/cover.jpg', 'https://cdn/2.jpg', '  '],
      mediaItems: [
        { url: 'https://cdn/3.jpg' },
        { previewUrl: 'https://cdn/4.jpg' },
        { tgFileId: 'AgACAgQAAxk...' },
        'https://cdn/2.jpg'
      ]
    });

    expect(media).toEqual([
      'https://cdn/cover.jpg',
      'https://cdn/2.jpg',
      'https://cdn/3.jpg',
      'https://cdn/4.jpg',
      'AgACAgQAAxk...'
    ]);
  });

  it('respects media limit', () => {
    const media = collectCarMediaSources({
      mediaUrls: ['1', '2', '3', '4']
    }, 2);

    expect(media).toEqual(['1', '2']);
  });

  it('returns empty array for invalid payloads', () => {
    expect(collectCarMediaSources(null)).toEqual([]);
    expect(collectCarMediaSources({})).toEqual([]);
  });

  it('builds media group with caption only on first item', () => {
    const media = buildTelegramPhotoMedia(['a', 'b'], '<b>Caption</b>');
    expect(media).toEqual([
      { type: 'photo', media: 'a', caption: '<b>Caption</b>', parse_mode: 'HTML' },
      { type: 'photo', media: 'b', caption: undefined, parse_mode: undefined }
    ]);
  });
});
