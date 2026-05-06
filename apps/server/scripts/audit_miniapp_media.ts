import { prisma } from '../src/services/prisma.js';
import { collectNormalizedMediaUrls, normalizeMediaUrl } from '../src/services/mediaUrl.service.js';

const isLocalhostUrl = (value: unknown): boolean => {
  return typeof value === 'string' && /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\//i.test(value.trim());
};

const collectRawMediaValues = (value: unknown, out: string[] = []): string[] => {
  if (!value) return out;
  if (typeof value === 'string') {
    if (value.trim()) out.push(value.trim());
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectRawMediaValues(item, out));
    return out;
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (['url', 'previewUrl', 'tgFileId', 'fileId', 'media', 'thumbnail'].includes(key)) {
        collectRawMediaValues(item, out);
      }
    });
  }
  return out;
};

const main = async () => {
  const listings = await prisma.carListing.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      thumbnail: true,
      mediaUrls: true,
      mediaItems: true,
      specs: true
    },
    orderBy: { updatedAt: 'desc' }
  });

  const totals = {
    listings: listings.length,
    withMedia: 0,
    withLocalhost: 0,
    withDuplicateMedia: 0,
    rawMediaValues: 0,
    normalizedMediaValues: 0,
    missingTransmission: 0,
    missingDrive: 0,
    missingColor: 0,
    missingVin: 0
  };

  const worstMedia = listings
    .map((listing) => {
      const rawValues = [
        ...(listing.thumbnail ? [listing.thumbnail] : []),
        ...collectRawMediaValues(listing.mediaUrls),
        ...collectRawMediaValues(listing.mediaItems)
      ];
      const normalized = collectNormalizedMediaUrls(listing as unknown as Record<string, unknown>);
      const hasLocalhost = rawValues.some(isLocalhostUrl);
      const rawNormalized = rawValues.map((value) => normalizeMediaUrl(value)).filter(Boolean);
      const hasDuplicates = new Set(rawNormalized).size !== rawNormalized.length;
      const specs = listing.specs && typeof listing.specs === 'object' && !Array.isArray(listing.specs)
        ? listing.specs as Record<string, unknown>
        : {};

      if (rawValues.length) totals.withMedia += 1;
      if (hasLocalhost) totals.withLocalhost += 1;
      if (hasDuplicates) totals.withDuplicateMedia += 1;
      if (!specs.transmission) totals.missingTransmission += 1;
      if (!specs.drive) totals.missingDrive += 1;
      if (!specs.color) totals.missingColor += 1;
      if (!specs.vin) totals.missingVin += 1;
      totals.rawMediaValues += rawValues.length;
      totals.normalizedMediaValues += normalized.length;

      return {
        id: listing.id,
        title: listing.title,
        status: listing.status,
        rawCount: rawValues.length,
        normalizedCount: normalized.length,
        localhostCount: rawValues.filter(isLocalhostUrl).length
      };
    })
    .sort((a, b) => (b.rawCount - b.normalizedCount) - (a.rawCount - a.normalizedCount))
    .slice(0, 20);

  console.log(JSON.stringify({ totals, worstMedia }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
