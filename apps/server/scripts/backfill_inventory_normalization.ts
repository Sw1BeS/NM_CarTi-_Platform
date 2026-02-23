import { prisma } from '../src/services/prisma.js';
import { mapInventoryOutput } from '../src/services/dto.js';

const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 500;

const normalizeJson = (value: unknown) => JSON.stringify(value ?? null);

const main = async () => {
  console.log(`[backfill_inventory_normalization] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);

  let cursor: string | undefined;
  let scanned = 0;
  let changed = 0;

  while (true) {
    const rows = await prisma.carListing.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: PAGE_SIZE
    });
    if (!rows.length) break;

    for (const row of rows) {
      scanned += 1;
      cursor = row.id;

      const normalized = mapInventoryOutput(row as any);
      const nextSpecs = (normalized.specs || {}) as Record<string, unknown>;
      const nextMediaUrls = Array.isArray(normalized.mediaUrls) ? normalized.mediaUrls : [];
      const nextThumbnail = String(normalized.thumbnail || '').trim() || null;
      const nextLocation = normalized.location ? String(normalized.location) : null;

      const specsChanged = normalizeJson(row.specs) !== normalizeJson(nextSpecs);
      const mediaChanged = normalizeJson(row.mediaUrls || []) !== normalizeJson(nextMediaUrls);
      const thumbnailChanged = (row.thumbnail || null) !== nextThumbnail;
      const locationChanged = (row.location || null) !== nextLocation;
      const needsUpdate = specsChanged || mediaChanged || thumbnailChanged || locationChanged;
      if (!needsUpdate) continue;

      changed += 1;
      console.log(`[backfill_inventory_normalization] ${APPLY ? 'update' : 'would_update'} car=${row.id}`);

      if (APPLY) {
        await prisma.carListing.update({
          where: { id: row.id },
          data: {
            specs: nextSpecs,
            mediaUrls: nextMediaUrls,
            thumbnail: nextThumbnail,
            location: nextLocation
          }
        });
      }
    }
  }

  console.log(`[backfill_inventory_normalization] done scanned=${scanned} changed=${changed} mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);
};

main()
  .catch((error) => {
    console.error('[backfill_inventory_normalization] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
