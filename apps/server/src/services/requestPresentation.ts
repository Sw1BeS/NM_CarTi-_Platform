import { buildVehiclePresentation, type VehiclePresentation } from './vehiclePresentation.js';

type RequestIntent = 'PRICE_TERMS' | 'PICKUP' | 'SELL' | 'SUPPORT' | 'B2B_REQUEST' | 'B2B_VARIANT';
type OperatorSourceLabel = 'MiniApp' | 'Telegram Bot' | 'B2B Bot' | 'Admin';
type OperatorIntentLabel = 'Підбір авто' | 'Ціна/умови' | 'Продаж авто' | 'B2B заявка';

export type RequestPresentation = {
  title: string;
  sourceLabel: OperatorSourceLabel;
  customerLabel: string;
  contactLabel?: string;
  intentLabel: OperatorIntentLabel;
  selectedCarLabels: string[];
  criteriaChips: string[];
  timeline: Array<{ at: string; label: string }>;
};

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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

const toIsoString = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const normalizeIntentLabel = (value: unknown): OperatorIntentLabel | undefined => {
  const text = toOptionalString(value);
  if (!text) return undefined;
  const lower = text.toLowerCase();
  if (lower.includes('b2b')) return 'B2B заявка';
  if (lower.includes('продаж') || lower.includes('sell')) return 'Продаж авто';
  if (lower.includes('ціна') || lower.includes('умов') || lower.includes('price') || lower.includes('interest')) {
    return 'Ціна/умови';
  }
  if (lower.includes('підбір') || lower.includes('pickup') || lower === 'request' || lower === 'buy') {
    return 'Підбір авто';
  }
  return undefined;
};

const labelFromUnknown = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') return toOptionalString(value);
  if (!isRecord(value)) return undefined;
  return toOptionalString(value.label)
    || toOptionalString(value.title)
    || toOptionalString(value.name)
    || toOptionalString(value.value)
    || toOptionalString(value.id);
};

const labelsFromUnknown = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(labelFromUnknown).filter((item): item is string => Boolean(item));
  }
  const label = labelFromUnknown(value);
  return label ? [label] : [];
};

const readNestedRecord = (record: Record<string, unknown>, key: string) => {
  return isRecord(record[key]) ? record[key] as Record<string, unknown> : {};
};

const readSourceLabel = (request: any, payload: Record<string, unknown>): OperatorSourceLabel => {
  const nestedRequest = readNestedRecord(payload, 'request');
  const sourceText = [
    payload.source,
    payload.sourceContext,
    payload.surfaceMode,
    payload.surfaceType,
    payload.surfaceSource,
    payload.compatibilityMode,
    payload.requestType,
    nestedRequest.source,
    nestedRequest.type
  ].map((item) => toOptionalString(item)?.toLowerCase()).filter(Boolean).join(' ');

  if (sourceText.includes('miniapp') || sourceText.includes('mini app')) return 'MiniApp';
  if (sourceText.includes('b2b') || request?.requesterPartnerId || isRecord(payload.requesterPartner)) return 'B2B Bot';
  if (sourceText.includes('telegram') || request?.chatId || isRecord(payload.telegram)) return 'Telegram Bot';
  return 'Admin';
};

const readCustomerLabel = (request: any, payload: Record<string, unknown>) => {
  const telegram = readNestedRecord(payload, 'telegram');
  const requesterPartner = readNestedRecord(payload, 'requesterPartner');
  const username = toOptionalString(telegram.username)?.replace(/^@+/, '');
  return toOptionalString(requesterPartner.name)
    || (username ? `@${username}` : undefined)
    || toOptionalString(telegram.name)
    || toOptionalString(payload.telegramName)
    || toOptionalString(payload.name)
    || toOptionalString(request?.lead?.clientName)
    || (toOptionalString(telegram.userId) ? `TG ${toOptionalString(telegram.userId)}` : undefined)
    || (toOptionalString(request?.chatId) ? `TG ${toOptionalString(request.chatId)}` : undefined)
    || 'Клієнт';
};

const readContactLabel = (request: any, payload: Record<string, unknown>, includeContact: boolean) => {
  if (!includeContact) return undefined;
  const nestedRequest = readNestedRecord(payload, 'request');
  return toOptionalString(request?.contact)
    || toOptionalString(payload.contact)
    || toOptionalString(payload.phone)
    || toOptionalString(nestedRequest.contact)
    || toOptionalString(nestedRequest.phone);
};

const readSelectedCarLabels = (payload: Record<string, unknown>) => {
  const existingPresentation = readNestedRecord(payload, 'requestPresentation');
  const labels = [
    ...labelsFromUnknown(existingPresentation.selectedCars),
    ...labelsFromUnknown(payload.selectedCars),
    ...labelsFromUnknown(payload.vehiclePresentation)
  ].filter(Boolean);

  const vehicleLines = Array.isArray(existingPresentation.vehicleLines)
    ? existingPresentation.vehicleLines.map((line) => toOptionalString(line)?.replace(/^\d+\.\s*/, '').split(' • ')[0]).filter((item): item is string => Boolean(item))
    : [];

  return Array.from(new Set([...labels, ...vehicleLines]));
};

const readCriteriaChips = (request: any, payload: Record<string, unknown>) => {
  const existingPresentation = readNestedRecord(payload, 'requestPresentation');
  const presentationChips = Array.isArray(existingPresentation.criteriaChips)
    ? existingPresentation.criteriaChips.map(toOptionalString).filter((item): item is string => Boolean(item))
    : [];
  if (presentationChips.length) return presentationChips;

  const nestedRequest = readNestedRecord(payload, 'request');
  const criteria = isRecord(payload.criteria)
    ? payload.criteria
    : (isRecord(nestedRequest.criteria) ? nestedRequest.criteria as Record<string, unknown> : {});

  const chips = compact([
    ...labelsFromUnknown(criteria.brands || criteria.brand).map((item) => `Марка: ${item}`),
    ...labelsFromUnknown(criteria.models || criteria.model).map((item) => `Модель: ${item}`),
    criteria.yearFrom || criteria.yearTo || request?.yearMin || request?.yearMax
      ? `Рік ${criteria.yearFrom || request?.yearMin || '—'}-${criteria.yearTo || request?.yearMax || '—'}`
      : undefined,
    criteria.budgetMin || criteria.budgetMax || request?.budgetMin || request?.budgetMax
      ? `Бюджет ${criteria.budgetMin || request?.budgetMin || '—'}-${criteria.budgetMax || request?.budgetMax || '—'}`
      : undefined,
    ...labelsFromUnknown(criteria.bodyTypes || criteria.bodyType).map((item) => `Кузов: ${item}`),
    ...labelsFromUnknown(criteria.fuels || criteria.fuel).map((item) => `Пальне: ${item}`),
    ...labelsFromUnknown(criteria.cities || criteria.city || request?.city).map((item) => `Місто: ${item}`)
  ]);

  return Array.from(new Set(chips));
};

const readIntentLabel = (
  request: any,
  payload: Record<string, unknown>,
  sourceLabel: OperatorSourceLabel,
  selectedCarLabels: string[]
): OperatorIntentLabel => {
  if (sourceLabel === 'B2B Bot' || request?.requesterPartnerId || isRecord(payload.requesterPartner)) return 'B2B заявка';

  const existingPresentation = readNestedRecord(payload, 'requestPresentation');
  const nestedRequest = readNestedRecord(payload, 'request');
  const values = [
    existingPresentation.customerIntent,
    existingPresentation.intentLabel,
    payload.customerIntent,
    payload.intentType,
    payload.requestType,
    payload.sourceContext,
    nestedRequest.intentType,
    nestedRequest.type,
    request?.type
  ];

  for (const value of values) {
    const normalized = normalizeIntentLabel(value);
    if (normalized) return normalized;
  }

  return selectedCarLabels.length ? 'Ціна/умови' : 'Підбір авто';
};

const readTimeline = (request: any) => {
  const createdAt = toIsoString(request?.createdAt);
  const updatedAt = toIsoString(request?.updatedAt);
  const timeline: Array<{ at: string; label: string }> = [];
  if (createdAt) timeline.push({ at: createdAt, label: 'Створено' });
  if (updatedAt && updatedAt !== createdAt) {
    timeline.push({ at: updatedAt, label: request?.status ? `Оновлено: ${request.status}` : 'Оновлено' });
  }
  return timeline;
};

export const buildOperatorRequestPresentation = (
  request: any,
  opts: { includeContact?: boolean } = {}
): RequestPresentation => {
  const payload = isRecord(request?.payload) ? request.payload as Record<string, unknown> : {};
  const existing = isRecord(payload.operatorPresentation)
    ? payload.operatorPresentation as Partial<RequestPresentation>
    : (isRecord(payload.presentation) ? payload.presentation as Partial<RequestPresentation> : {});
  const selectedCarLabels = existing.selectedCarLabels?.length
    ? existing.selectedCarLabels.map(toOptionalString).filter((item): item is string => Boolean(item))
    : readSelectedCarLabels(payload);
  const criteriaChips = existing.criteriaChips?.length
    ? existing.criteriaChips.map(toOptionalString).filter((item): item is string => Boolean(item))
    : readCriteriaChips(request, payload);
  const sourceLabel = existing.sourceLabel || readSourceLabel(request, payload);
  const intentLabel = existing.intentLabel || readIntentLabel(request, payload, sourceLabel, selectedCarLabels);
  const title = toOptionalString(existing.title)
    || toOptionalString(readNestedRecord(payload, 'requestPresentation').requestTitle)
    || toOptionalString(request?.title)
    || intentLabel;

  return {
    title,
    sourceLabel,
    customerLabel: toOptionalString(existing.customerLabel) || readCustomerLabel(request, payload),
    contactLabel: opts.includeContact
      ? (toOptionalString(existing.contactLabel) || readContactLabel(request, payload, Boolean(opts.includeContact)))
      : undefined,
    intentLabel,
    selectedCarLabels,
    criteriaChips,
    timeline: existing.timeline?.length ? existing.timeline : readTimeline(request)
  };
};
