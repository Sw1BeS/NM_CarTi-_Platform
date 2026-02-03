import { apiFetch } from './apiClient';
import type { CarListing, B2BRequest } from '../types';

export type MiniAppFavoritesResponse = {
  ids: string[];
  items: CarListing[];
};

export type MiniAppFavoriteToggleResponse = {
  ok: boolean;
  action: 'added' | 'removed';
  favoriteId?: string;
};

export type MiniAppTrackingMeta = {
  startParam?: string;
  ref?: string;
  utm?: Record<string, string | undefined>;
  entrypoint?: string;
  referrer?: string;
  miniappVersion?: string;
  buildSha?: string;
};

export type MiniAppRequestPayload = {
  slug: string;
  initData?: string;
  title?: string;
  description?: string;
  budgetMax?: number;
  yearMin?: number;
  phone?: string;
  comment?: string;
  carListingId?: string;
  tracking?: MiniAppTrackingMeta;
  telegram?: {
    userId?: string;
    username?: string;
    name?: string;
  };
  payload?: Record<string, unknown>;
};

export async function getMiniAppFavorites(params: { slug: string; tgUserId?: string; visitorId?: string }): Promise<MiniAppFavoritesResponse> {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  if (params.tgUserId) query.append('tgUserId', params.tgUserId);
  if (params.visitorId) query.append('visitorId', params.visitorId);

  return await apiFetch(`/miniapp/favorites?${query.toString()}`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function toggleMiniAppFavorite(carListingId: string, payload: { slug?: string; tgUserId?: string; visitorId?: string; initData?: string }): Promise<MiniAppFavoriteToggleResponse> {
  return await apiFetch(`/miniapp/favorites/${carListingId}`, {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function createMiniAppRequest(payload: MiniAppRequestPayload): Promise<{ request: B2BRequest }> {
  return await apiFetch('/miniapp/requests', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function getMiniAppRequestStatus(params: { slug: string; requestId?: string; phone?: string; telegramUserId?: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  if (params.requestId) query.append('requestId', params.requestId);
  if (params.phone) query.append('phone', params.phone);
  if (params.telegramUserId) query.append('telegramUserId', params.telegramUserId);

  return await apiFetch(`/miniapp/requests/status?${query.toString()}`, {
    method: 'GET',
    skipAuth: true
  });
}
