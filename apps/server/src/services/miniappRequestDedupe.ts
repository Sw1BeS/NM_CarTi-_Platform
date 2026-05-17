import { prisma } from './prisma.js';
import { RequestType } from '@prisma/client';

const MINIAPP_SELECTED_CAR_DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str ? str : undefined;
};

export const normalizeSelectedCarIdsForDedupe = (values: unknown[]): string[] => {
  return Array.from(new Set(
    values
      .map((value) => toOptionalString(value))
      .filter((value): value is string => Boolean(value))
  )).sort();
};

export const extractSelectedCarIdsForDedupe = (payload: unknown): string[] => {
  if (!isRecord(payload)) return [];
  const request = isRecord(payload.request) ? payload.request : {};
  const selectedCars = Array.isArray(payload.selectedCars) ? payload.selectedCars : [];
  const requestCarIds = Array.isArray(request.carListingIds) ? request.carListingIds : [];
  const selectedCarIds = selectedCars
    .map((car) => isRecord(car) ? toOptionalString(car.id) : undefined)
    .filter((value): value is string => Boolean(value));

  return normalizeSelectedCarIdsForDedupe([
    request.carListingId,
    ...requestCarIds,
    ...selectedCarIds
  ]);
};

const sameCarSet = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

export const findRecentMiniAppSelectedCarsDuplicate = async (params: {
  companyId: string;
  botId?: string | null;
  chatId?: string | null;
  requesterPartnerId?: string | null;
  requestType?: string | null;
  selectedCarIds: string[];
  now?: Date;
}) => {
  const companyId = toOptionalString(params.companyId);
  const chatId = toOptionalString(params.chatId);
  const requestType = String(toOptionalString(params.requestType) || 'BUY').toUpperCase() === 'SELL'
    ? RequestType.SELL
    : RequestType.BUY;
  const selectedCarIds = normalizeSelectedCarIdsForDedupe(params.selectedCarIds);
  if (!companyId || !chatId || !selectedCarIds.length) return null;

  const since = new Date((params.now?.getTime() ?? Date.now()) - MINIAPP_SELECTED_CAR_DUPLICATE_WINDOW_MS);
  const candidates = await prisma.b2bRequest.findMany({
    where: {
      companyId,
      ...(params.botId ? { botId: params.botId } : {}),
      chatId,
      ...(params.requesterPartnerId ? { requesterPartnerId: params.requesterPartnerId } : {}),
      type: requestType,
      createdAt: { gte: since }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  return candidates.find((request) =>
    sameCarSet(extractSelectedCarIdsForDedupe(request.payload), selectedCarIds)
  ) || null;
};
