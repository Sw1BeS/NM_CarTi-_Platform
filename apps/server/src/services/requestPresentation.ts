import { buildVehiclePresentation, type VehiclePresentation } from './vehiclePresentation.js';

type RequestIntent = 'PRICE_TERMS' | 'PICKUP' | 'SELL' | 'SUPPORT' | 'B2B_REQUEST' | 'B2B_VARIANT';

type VehicleSnapshot = {
  id: string;
  title: string;
  year?: number;
  priceLabel: string;
  mileageLabel: string;
  statusLabel: string;
  location?: string;
  thumbnail?: string;
  mediaUrls: string[];
  publicUrl?: string;
  presentation: VehiclePresentation;
};

type RequestPresentationInput = {
  cars?: any[];
  slug?: string;
  publicId?: string | null;
  customerIntent: RequestIntent;
  sourceView?: string;
  comment?: string | null;
  criteria?: Record<string, unknown> | null;
  managerAction?: string;
};

const toOptionalString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : undefined;
};

const toNumber = (value: unknown): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const compact = (items: Array<string | undefined | null | false>) =>
  items.filter((item): item is string => Boolean(item && String(item).trim()));

const titleAlreadyHasYear = (title: string, year?: number) =>
  Boolean(year && new RegExp(`\\b${year}\\b`).test(title));

const intentLabel = (intent: RequestIntent) => {
  if (intent === 'PICKUP') return 'Підбір авто';
  if (intent === 'PRICE_TERMS') return 'Ціна / умови';
  if (intent === 'SELL') return 'Продаж авто';
  if (intent === 'SUPPORT') return 'Підтримка';
  if (intent === 'B2B_VARIANT') return 'B2B варіант';
  return 'B2B запит';
};

const defaultManagerAction = (intent: RequestIntent) => {
  if (intent === 'PICKUP') return 'Підібрати релевантні авто і звʼязатися з клієнтом';
  if (intent === 'PRICE_TERMS') return 'Уточнити ціну, умови, лізинг або розстрочку';
  if (intent === 'SELL') return 'Оцінити авто клієнта і узгодити наступний крок';
  if (intent === 'B2B_VARIANT') return 'Перевірити варіант і маршрутизувати рішення';
  if (intent === 'B2B_REQUEST') return 'Очікувати варіанти від партнерів';
  return 'Опрацювати звернення';
};

export const buildVehicleSnapshot = (car: any, opts: { slug?: string } = {}): VehicleSnapshot => {
  const presentation = buildVehiclePresentation(car);
  const id = toOptionalString(car?.id) || '';
  const title = presentation.title || toOptionalString(car?.title) || 'Авто';
  const thumbnail = presentation.mediaUrls[0] || toOptionalString(car?.thumbnail);
  const publicUrl = id && opts.slug
    ? `/p/app/${encodeURIComponent(opts.slug)}?entry=inventory&carId=${encodeURIComponent(id)}&preview=admin_chat`
    : undefined;

  return {
    id,
    title,
    year: toNumber(car?.year),
    priceLabel: presentation.priceLabel,
    mileageLabel: presentation.mileageLabel,
    statusLabel: presentation.statusLabel,
    location: toOptionalString(car?.location),
    thumbnail,
    mediaUrls: presentation.mediaUrls,
    publicUrl,
    presentation
  };
};

export const buildRequestPresentationSnapshot = (input: RequestPresentationInput) => {
  const selectedCars = (input.cars || [])
    .map((car) => buildVehicleSnapshot(car, { slug: input.slug }))
    .filter((car) => car.id || car.title);

  const criteria = input.criteria && typeof input.criteria === 'object' ? input.criteria : {};
  const criteriaChips = compact([
    toOptionalString(criteria.brand) || (Array.isArray(criteria.brands) ? criteria.brands.join(', ') : undefined),
    toOptionalString(criteria.model) || (Array.isArray(criteria.models) ? criteria.models.join(', ') : undefined),
    criteria.yearFrom || criteria.yearTo ? `Рік ${criteria.yearFrom || '—'}-${criteria.yearTo || '—'}` : undefined,
    criteria.budgetMin || criteria.budgetMax ? `Бюджет ${criteria.budgetMin || '—'}-${criteria.budgetMax || '—'}` : undefined,
    toOptionalString(criteria.bodyType),
    toOptionalString(criteria.fuel),
    toOptionalString(criteria.city)
  ]);
  const label = intentLabel(input.customerIntent);
  const managerAction = input.managerAction || defaultManagerAction(input.customerIntent);
  const vehicleLines = selectedCars.length
    ? selectedCars.map((car, index) => compact([
      `${index + 1}. ${car.title}${car.year && !titleAlreadyHasYear(car.title, car.year) ? ` (${car.year})` : ''}`,
      car.priceLabel,
      car.mileageLabel !== 'Пробіг не вказано' ? car.mileageLabel : undefined,
      car.statusLabel,
      car.location
    ]).join(' • '))
    : [];

  const requestTitle = selectedCars.length === 1
    ? `${label}: ${selectedCars[0].title}`
    : selectedCars.length > 1
      ? `${label}: ${selectedCars.length} авто`
      : label;

  const requestSummary = compact([
    input.publicId ? `Запит ${input.publicId}` : undefined,
    requestTitle,
    vehicleLines.length ? `Авто:\n${vehicleLines.join('\n')}` : undefined,
    criteriaChips.length ? `Критерії: ${criteriaChips.join(' • ')}` : undefined,
    toOptionalString(input.comment) ? `Коментар: ${toOptionalString(input.comment)}` : undefined,
    `Наступна дія: ${managerAction}`
  ]).join('\n');

  const telegramText = compact([
    `🎯 ${requestTitle}`,
    input.publicId ? `ID: ${input.publicId}` : undefined,
    vehicleLines.length ? `🚗 ${vehicleLines.join('\n')}` : undefined,
    criteriaChips.length ? `🔎 ${criteriaChips.join(' • ')}` : undefined,
    toOptionalString(input.comment) ? `📝 ${toOptionalString(input.comment)}` : undefined,
    `➡️ ${managerAction}`
  ]).join('\n');

  return {
    requestTitle,
    intentLabel: label,
    sourceView: input.sourceView,
    customerIntent: input.customerIntent,
    managerAction,
    selectedCars,
    vehiclePresentation: selectedCars[0]?.presentation,
    vehicleLines,
    criteriaChips,
    requestSummary,
    telegramText,
    miniAppCard: {
      title: requestTitle,
      subtitle: selectedCars[0]
        ? compact([selectedCars[0].year ? String(selectedCars[0].year) : undefined, selectedCars[0].priceLabel, selectedCars[0].statusLabel]).join(' • ')
        : criteriaChips.join(' • ') || label,
      selectedCarsCount: selectedCars.length,
      thumbnail: selectedCars[0]?.thumbnail
    }
  };
};
