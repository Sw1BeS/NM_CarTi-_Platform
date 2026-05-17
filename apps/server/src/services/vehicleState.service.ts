import type {
  VehicleAvailabilityState as PrismaVehicleAvailabilityState,
  VehiclePublicationStatus as PrismaVehiclePublicationStatus
} from '@prisma/client';

export type VehicleAvailabilityState =
  PrismaVehicleAvailabilityState;

export type VehiclePublicationStatus = PrismaVehiclePublicationStatus;

const toText = (value: unknown) => String(value || '').trim();

const TRANSIT_TEXT_RE = /#вдорозі|в\s+дорозі|in[_\s-]?transit|прямує|в\s+пути|on\s+the\s+way/i;
const IMPORT_TO_ORDER_RE = /під\s+замовлення|под\s+заказ|to\s+order|import\s+to\s+order/i;

export const hasTransitSignal = (...values: unknown[]) =>
  values.some((value) => TRANSIT_TEXT_RE.test(toText(value)));

export const hasImportToOrderSignal = (...values: unknown[]) =>
  values.some((value) => IMPORT_TO_ORDER_RE.test(toText(value)));

export const deriveVehicleAvailabilityState = (input: {
  availabilityState?: unknown;
  status?: unknown;
  title?: unknown;
  description?: unknown;
  specs?: unknown;
}): VehicleAvailabilityState => {
  const explicit = toText(input.availabilityState).toUpperCase();
  if (['IN_STOCK', 'IN_TRANSIT', 'IMPORT_TO_ORDER', 'RESERVED', 'SOLD', 'UNKNOWN'].includes(explicit)) {
    return explicit as VehicleAvailabilityState;
  }

  const status = toText(input.status).toUpperCase();
  const specs = input.specs && typeof input.specs === 'object' && !Array.isArray(input.specs)
    ? input.specs as Record<string, unknown>
    : {};
  const textValues = [
    input.title,
    input.description,
    specs.condition,
    specs.status,
    specs.rawText
  ];

  if (hasImportToOrderSignal(...textValues)) return 'IMPORT_TO_ORDER';
  if (hasTransitSignal(...textValues)) return 'IN_TRANSIT';
  if (status === 'RESERVED') return 'RESERVED';
  if (status === 'SOLD') return 'SOLD';
  if (status === 'HIDDEN') return 'UNKNOWN';
  if (status === 'PENDING') return 'UNKNOWN';
  return 'IN_STOCK';
};

export const deriveVehiclePublicationStatus = (input: {
  publicationStatus?: unknown;
  status?: unknown;
  autoPublish?: unknown;
}): VehiclePublicationStatus => {
  const explicit = toText(input.publicationStatus).toUpperCase();
  if (['DRAFT', 'REVIEW', 'PUBLISHED', 'HIDDEN'].includes(explicit)) {
    return explicit as VehiclePublicationStatus;
  }

  if (input.autoPublish === false) return 'REVIEW';
  const status = toText(input.status).toUpperCase();
  if (status === 'HIDDEN') return 'HIDDEN';
  if (status === 'PENDING') return 'REVIEW';
  return 'PUBLISHED';
};

export const vehicleAvailabilityLabel = (state?: unknown, legacyStatus?: unknown) => {
  const normalized = deriveVehicleAvailabilityState({ availabilityState: state, status: legacyStatus });
  if (normalized === 'IN_TRANSIT') return 'В дорозі';
  if (normalized === 'IMPORT_TO_ORDER') return 'Під замовлення';
  if (normalized === 'RESERVED') return 'Заброньовано';
  if (normalized === 'SOLD') return 'Продано';
  if (normalized === 'UNKNOWN') return 'Статус уточнюється';
  return 'В наявності';
};
