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
  submitId?: string;
  requestType?: 'BUY' | 'SELL';
  eventId?: string;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
  actionSource?: 'website' | 'chat' | string;
};

export type MiniAppRequestSubtype = 'GENERAL' | 'SPECIFIC' | 'MULTI_SELECT';

export type MiniAppRequestPayload = {
  slug: string;
  initData?: string;
  requestType?: 'BUY' | 'SELL';
  requestSubtype?: MiniAppRequestSubtype;
  title?: string;
  description?: string;
  budgetMax?: number;
  yearMin?: number;
  phone?: string;
  comment?: string;
  carListingId?: string;
  carListingIds?: string[];
  tracking?: MiniAppTrackingMeta;
  telegram?: {
    userId?: string;
    username?: string;
    name?: string;
  };
  payload?: Record<string, unknown>;
};

export type MiniAppLeadIntentPayload = {
  slug: string;
  initData: string;
  kind: 'PICK' | 'PRICE_TERMS';
  carListingId?: string;
  carListingIds?: string[];
  criteria?: Record<string, unknown>;
  comment?: string;
  tracking?: MiniAppTrackingMeta;
};

export type MiniAppBotFlowPayload = {
  slug: string;
  initData: string;
  flow: 'SELL' | 'SUPPORT';
};

export type MiniAppEventPayload = {
  slug: string;
  eventType: string;
  initData?: string;
  visitorId?: string;
  tgUserId?: string;
  carListingId?: string;
  view?: string;
  payload?: Record<string, unknown>;
  tracking?: MiniAppTrackingMeta;
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

export async function createMiniAppLeadIntent(payload: MiniAppLeadIntentPayload): Promise<{
  ok: boolean;
  contactRequested: boolean;
  contactRequestFailed?: boolean;
  closeMiniApp: boolean;
  openBotUrl?: string;
  duplicate?: boolean;
  intent?: { kind?: string; type?: string; title?: string };
}> {
  return await apiFetch('/miniapp/lead-intents', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function startMiniAppBotFlow(payload: MiniAppBotFlowPayload): Promise<{
  ok: boolean;
  flow: 'SELL' | 'SUPPORT';
  closeMiniApp: boolean;
}> {
  return await apiFetch('/miniapp/bot-flows', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function trackMiniAppEvent(payload: MiniAppEventPayload): Promise<{ ok: boolean }> {
  return await apiFetch('/miniapp/events', {
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

export type MiniAppConfigResponse = {
  companyId: string;
  botId: string;
  publicSlug: string;
  template?: string;
  miniapp?: any;
  botUsername?: string;
  appName?: string;
  modeHints?: {
    requiresTelegram?: boolean;
    previewReadOnly?: boolean;
    requiresInitDataForWrites?: boolean;
  };
  diagnostics?: {
    presetStatus?: string;
    presetVersion?: string;
    buildSha?: string;
  };
};

export async function getMiniAppConfig(slug: string): Promise<MiniAppConfigResponse> {
  const response = await apiFetch(`/miniapp/config?slug=${slug}`, {
    method: 'GET',
    skipAuth: true
  });
  if (response && typeof response === 'object' && 'config' in response && response.config) {
    return response.config as MiniAppConfigResponse;
  }
  return response as MiniAppConfigResponse;
}

export async function getMiniAppShowcases(slug: string) {
  return await apiFetch(`/miniapp/showcases?slug=${encodeURIComponent(slug)}`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function getMiniAppShowcaseInventory(params: {
  slug: string;
  page?: number;
  limit?: number;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  status?: 'AVAILABLE' | 'PENDING';
}) {
  const query = new URLSearchParams();
  if (params.page) query.append('page', String(params.page));
  if (params.limit) query.append('limit', String(params.limit));
  if (params.search) query.append('search', params.search);
  if (typeof params.minPrice === 'number') query.append('minPrice', String(params.minPrice));
  if (typeof params.maxPrice === 'number') query.append('maxPrice', String(params.maxPrice));
  if (typeof params.minYear === 'number') query.append('minYear', String(params.minYear));
  if (typeof params.maxYear === 'number') query.append('maxYear', String(params.maxYear));
  if (params.status) query.append('status', params.status);
  return await apiFetch(`/miniapp/showcases/${encodeURIComponent(params.slug)}/inventory?${query.toString()}`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function getMiniAppCar(carId: string) {
  const response = await apiFetch(`/miniapp/cars/${encodeURIComponent(carId)}`, {
    method: 'GET',
    skipAuth: true
  });
  if (response && typeof response === 'object' && 'car' in response && response.car) {
    return response.car;
  }
  return response;
}

export async function shareMiniAppCar(carId: string, payload: { slug: string; initData: string; chatId?: string; botId?: string }) {
  return await apiFetch(`/miniapp/cars/${encodeURIComponent(carId)}/share`, {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function getMiniAppB2bMyRequests(params: { slug: string; initData: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  query.append('initData', params.initData);
  return await apiFetch(`/miniapp/b2b/requests/my?${query.toString()}`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function getMiniAppB2bReceivedVariants(params: { slug: string; initData: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  query.append('initData', params.initData);
  return await apiFetch(`/miniapp/b2b/variants/received?${query.toString()}`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function setMiniAppB2bVariantDecision(variantId: string, payload: { slug: string; initData: string; decision: 'FIT' | 'NOT_FIT' }) {
  return await apiFetch(`/miniapp/b2b/variants/${encodeURIComponent(variantId)}/decision`, {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function getMiniAppB2bAdminFitQueue(params: { slug: string; initData: string; status?: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  query.append('initData', params.initData);
  if (params.status) query.append('status', params.status);
  return await apiFetch(`/miniapp/b2b/admin/fit-queue?${query.toString()}`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function patchMiniAppB2bAdminFitQueue(variantId: string, payload: {
  slug: string;
  initData: string;
  fitQueueStatus: 'NEW' | 'IN_PROGRESS' | 'AGREED' | 'MEETING_SCHEDULED' | 'CLOSED';
  location?: string;
  meetingAt?: string;
  result?: string;
}) {
  return await apiFetch(`/miniapp/b2b/admin/fit-queue/${encodeURIComponent(variantId)}`, {
    method: 'PATCH',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}
