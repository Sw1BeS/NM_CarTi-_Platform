import { prisma } from '../src/services/prisma.js';
import { buildRequestPresentationSnapshot } from '../src/services/requestPresentation.js';

const APPLY = process.argv.includes('--apply');
const NOISY_TITLE_RE = /перевірений\s+vin|проверенн(?:ый|ий)\s+vin|verified\s+vin/i;
const PAGE_SIZE = 100;

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toText = (value: unknown) => String(value || '').trim();

const isNoisyTitle = (value: unknown) => {
  const text = toText(value);
  return !text || NOISY_TITLE_RE.test(text);
};

const firstCleanTitle = (...values: unknown[]) => {
  for (const value of values) {
    const text = toText(value);
    if (text && !isNoisyTitle(text)) return text;
  }
  return '';
};

const readArray = (value: unknown): any[] => Array.isArray(value) ? value : [];

const extractSelectedCars = (payload: Record<string, any>) => [
  ...readArray(payload.selectedCars),
  ...readArray(payload.requestPresentation?.selectedCars),
  ...readArray(payload.payload?.selectedCars),
  ...readArray(payload.payload?.requestPresentation?.selectedCars)
];

const extractCarIds = (payload: Record<string, any>) => {
  const ids = [
    payload.request?.carListingId,
    payload.payload?.request?.carListingId,
    ...readArray(payload.request?.carListingIds),
    ...readArray(payload.payload?.request?.carListingIds),
    ...extractSelectedCars(payload).map((car) => car?.id)
  ]
    .map((item) => toText(item))
    .filter(Boolean);
  return Array.from(new Set(ids));
};

const patchPayloadTitle = (payload: unknown, cleanTitle: string) => {
  if (!isRecord(payload)) return payload;
  const next = JSON.parse(JSON.stringify(payload));
  if (isRecord(next.request) && isNoisyTitle(next.request.title)) {
    next.request.title = cleanTitle;
  }
  if (isRecord(next.payload?.request) && isNoisyTitle(next.payload.request.title)) {
    next.payload.request.title = cleanTitle;
  }
  return next;
};

const resolveCleanTitle = async (row: { payload: unknown; companyId?: string | null }) => {
  const payload = isRecord(row.payload) ? row.payload : {};
  const selectedCars = extractSelectedCars(payload);
  const titleFromPayload = firstCleanTitle(
    payload.request?.title,
    payload.payload?.request?.title,
    selectedCars[0]?.title,
    selectedCars[0]?.presentation?.title,
    payload.vehiclePresentation?.title,
    payload.payload?.vehiclePresentation?.title
  );
  if (titleFromPayload) return titleFromPayload;

  const carIds = extractCarIds(payload);
  if (!carIds.length) return '';

  const cars = await prisma.carListing.findMany({
    where: {
      id: { in: carIds },
      ...(row.companyId ? { companyId: row.companyId } : {})
    },
    select: {
      id: true,
      title: true,
      price: true,
      currency: true,
      year: true,
      mileage: true,
      location: true,
      thumbnail: true,
      mediaUrls: true,
      mediaItems: true,
      specs: true,
      status: true
    }
  });
  const carMap = new Map(cars.map((car) => [car.id, car]));
  const orderedCars = carIds.map((id) => carMap.get(id)).filter((item): item is typeof cars[number] => Boolean(item));
  const snapshot = buildRequestPresentationSnapshot({
    cars: orderedCars,
    slug: 'cartie',
    customerIntent: 'PRICE_TERMS'
  });
  return firstCleanTitle(snapshot.selectedCars[0]?.title, snapshot.vehiclePresentation?.title);
};

async function main() {
  console.log(`[repair_miniapp_request_titles] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);

  let cursor: string | undefined;
  let scanned = 0;
  let candidates = 0;
  let changed = 0;

  while (true) {
    const rows = await prisma.b2bRequest.findMany({
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        title: { contains: 'VIN', mode: 'insensitive' }
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE
    });
    if (!rows.length) break;

    for (const row of rows) {
      cursor = row.id;
      scanned += 1;
      if (!isNoisyTitle(row.title)) continue;
      candidates += 1;

      const cleanTitle = await resolveCleanTitle(row);
      if (!cleanTitle || isNoisyTitle(cleanTitle)) {
        console.log(`[repair_miniapp_request_titles] skip request=${row.publicId || row.id} no_clean_title`);
        continue;
      }

      changed += 1;
      console.log(`[repair_miniapp_request_titles] ${APPLY ? 'update' : 'would_update'} request=${row.publicId || row.id} title="${row.title}" -> "${cleanTitle}"`);
      if (APPLY) {
        await prisma.b2bRequest.update({
          where: { id: row.id },
          data: {
            title: cleanTitle,
            payload: patchPayloadTitle(row.payload, cleanTitle) as any
          }
        });
      }
    }
  }

  console.log(`[repair_miniapp_request_titles] done scanned=${scanned} candidates=${candidates} changed=${changed} mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);
}

main()
  .catch((err) => {
    console.error('[repair_miniapp_request_titles] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
