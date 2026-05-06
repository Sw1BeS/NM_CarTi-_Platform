import { prisma } from '../src/services/prisma.js';
import { collectNormalizedMediaUrls, normalizeMediaUrl } from '../src/services/mediaUrl.service.js';

type Options = {
  apply: boolean;
  limit: number;
};

const parseArgs = (): Options => {
  const args = process.argv.slice(2);
  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const parsedLimit = limitArg ? Number(limitArg.split('=').slice(1).join('=')) : 500;
  return {
    apply: args.includes('--apply'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 500
  };
};

const normalizeMediaItem = (item: unknown): unknown => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const raw = item as Record<string, unknown>;
  return {
    ...raw,
    url: normalizeMediaUrl(raw.url),
    previewUrl: normalizeMediaUrl(raw.previewUrl)
  };
};

const normalizeMediaItems = (value: unknown): unknown => {
  if (!Array.isArray(value)) return value;
  const seen = new Set<string>();
  const result: unknown[] = [];

  for (const item of value) {
    const normalized = normalizeMediaItem(item);
    const urls = collectNormalizedMediaUrls({ mediaItems: [normalized] }, { limit: 5 });
    const key = urls[0] || JSON.stringify(normalized);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
};

const main = async () => {
  const options = parseArgs();
  const listings = await prisma.carListing.findMany({
    select: {
      id: true,
      title: true,
      thumbnail: true,
      mediaUrls: true,
      mediaItems: true
    },
    orderBy: { updatedAt: 'desc' },
    take: options.limit
  });

  let changed = 0;
  const samples: Array<{ id: string; title: string; before: number; after: number }> = [];

  for (const listing of listings) {
    const nextMediaItems = normalizeMediaItems(listing.mediaItems);
    const nextMediaUrls = collectNormalizedMediaUrls({
      thumbnail: listing.thumbnail,
      mediaUrls: listing.mediaUrls,
      mediaItems: nextMediaItems
    });
    const nextThumbnail = normalizeMediaUrl(listing.thumbnail) || nextMediaUrls[0] || null;
    const currentMediaUrls = listing.mediaUrls || [];
    const currentMediaItems = Array.isArray(listing.mediaItems) ? listing.mediaItems : [];

    const hasDiff = nextThumbnail !== listing.thumbnail
      || JSON.stringify(nextMediaUrls) !== JSON.stringify(currentMediaUrls)
      || JSON.stringify(nextMediaItems) !== JSON.stringify(listing.mediaItems);

    if (!hasDiff) continue;

    changed += 1;
    samples.push({
      id: listing.id,
      title: listing.title,
      before: currentMediaUrls.length + currentMediaItems.length + (listing.thumbnail ? 1 : 0),
      after: nextMediaUrls.length + (Array.isArray(nextMediaItems) ? nextMediaItems.length : 0) + (nextThumbnail ? 1 : 0)
    });

    if (options.apply) {
      await prisma.carListing.update({
        where: { id: listing.id },
        data: {
          thumbnail: nextThumbnail,
          mediaUrls: nextMediaUrls,
          mediaItems: nextMediaItems === undefined ? undefined : nextMediaItems as never
        }
      });
    }
  }

  console.log(JSON.stringify({
    mode: options.apply ? 'apply' : 'dry-run',
    scanned: listings.length,
    changed,
    samples: samples.slice(0, 20)
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
