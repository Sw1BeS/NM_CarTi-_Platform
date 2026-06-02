import { apiFetch } from './apiClient';
import type { CarListing, B2BRequest } from '../types';

export const MINIAPP_INIT_DATA_HEADER = 'X-Telegram-Init-Data';

export const buildMiniAppInitDataHeaders = (initData: string): HeadersInit => ({
  [MINIAPP_INIT_DATA_HEADER]: initData
});

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
  fbclid?: string;
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
  initData?: string;
  keyboardAuth?: string;
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

export type MiniAppB2BPartnerPortalResponse = {
  ok: boolean;
  approved: boolean;
  reason?: string;
  user?: {
    telegramUserId?: string;
    username?: string;
    name?: string;
  };
  partner?: {
    id: string;
    name: string;
    code?: string;
    showcaseSlug?: string;
    role?: string;
  };
  stats?: {
    ownRequests: number;
    receivedVariants: number;
  };
};

export type MiniAppB2BAccessRequestResponse = {
  ok: boolean;
  approved: boolean;
  accessRequest?: {
    id: string;
    status?: string;
  } | null;
};

export type MiniAppLeadRequestItem = {
  id: string;
  publicId?: string;
  title?: string;
  status?: string;
  statusLabel?: string;
  type?: string;
  source?: string;
  intentType?: string;
  pending?: boolean;
  requiresContact?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MiniAppB2bMyRequestItem = {
  id: string;
  publicId?: string;
  title?: string;
  status?: string;
  channelPostUrl?: string;
  createdAt?: string;
};

export type MiniAppB2bActiveRequestItem = {
  id: string;
  publicId?: string;
  title?: string;
  description?: string;
  status?: string;
  budgetMin?: number;
  budgetMax?: number;
  yearMin?: number;
  yearMax?: number;
  city?: string;
  channelPostUrl?: string;
  variantsCount?: number;
  criteria?: Record<string, unknown>;
  createdAt?: string;
};

export type MiniAppB2bReceivedVariantItem = {
  id: string;
  requestId?: string;
  requestPublicId?: string;
  status?: string;
  requesterDecision?: 'PENDING' | 'FIT' | 'NOT_FIT' | string;
  fitQueueStatus?: 'NEW' | 'IN_PROGRESS' | 'AGREED' | 'MEETING_SCHEDULED' | 'CLOSED' | string | null;
  title?: string;
  price?: number;
  currency?: string;
  year?: number;
  mileage?: number;
  location?: string;
  thumbnail?: string;
  mediaUrls?: string[];
  specs?: Record<string, unknown>;
  createdAt?: string;
};

export type MiniAppB2bListResponse<T> = {
  ok: boolean;
  items: T[];
};

export type MiniAppB2bOfferPayload = {
  slug: string;
  initData: string;
  title: string;
  price?: number;
  currency?: string;
  year?: number;
  mileage?: number;
  location?: string;
  condition?: string;
  vin?: string;
  comment?: string;
  contact?: string;
  thumbnail?: string;
  mediaUrls?: string[];
  sourceUrl?: string;
  submitId?: string;
  specs?: Record<string, unknown>;
  tracking?: MiniAppTrackingMeta;
};

export type MiniAppB2bOfferSubmitResponse = {
  ok: boolean;
  duplicate?: boolean;
  variant?: MiniAppB2bReceivedVariantItem;
};

export type VehicleTaxonomyOption = {
  id: string;
  label: string;
  aliases?: string[];
};

export type VehicleTaxonomyModel = VehicleTaxonomyOption & {
  brandId?: string;
};

export type VehicleTaxonomyBrand = VehicleTaxonomyOption & {
  models: VehicleTaxonomyModel[];
};

export type VehicleTaxonomyResponse = {
  brands: VehicleTaxonomyBrand[];
  bodyTypes: VehicleTaxonomyOption[];
  fuels: VehicleTaxonomyOption[];
  transmissions: VehicleTaxonomyOption[];
  drives: VehicleTaxonomyOption[];
  cities: VehicleTaxonomyOption[];
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
  contactActionRequired?: boolean;
  contactRequestFailed?: boolean;
  contactKnown?: boolean;
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

export function buildMiniAppRequestStatusPath(params: { slug: string; requestId?: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  if (params.requestId) query.append('requestId', params.requestId);
  return `/miniapp/requests/status?${query.toString()}`;
}

export async function getMiniAppRequestStatus(params: { slug: string; initData: string; requestId?: string }) {
  return await apiFetch(buildMiniAppRequestStatusPath(params), {
    method: 'GET',
    skipAuth: true,
    headers: buildMiniAppInitDataHeaders(params.initData)
  });
}

export function buildMiniAppMyRequestsPath(params: { slug: string; limit?: number }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  if (params.limit) query.append('limit', String(params.limit));
  return `/miniapp/requests/my?${query.toString()}`;
}

export async function getMiniAppMyRequests(params: { slug: string; initData: string; limit?: number }): Promise<{
  ok: boolean;
  items: MiniAppLeadRequestItem[];
}> {
  return await apiFetch(buildMiniAppMyRequestsPath(params), {
    method: 'GET',
    skipAuth: true,
    headers: buildMiniAppInitDataHeaders(params.initData)
  });
}

export function buildMiniAppB2BPartnerPortalPath(params: { slug: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  return `/miniapp/b2b/me?${query.toString()}`;
}

export async function getMiniAppB2BPartnerPortal(params: { slug: string; initData: string }): Promise<MiniAppB2BPartnerPortalResponse> {
  return await apiFetch(buildMiniAppB2BPartnerPortalPath(params), {
    method: 'GET',
    skipAuth: true,
    headers: buildMiniAppInitDataHeaders(params.initData)
  });
}

export async function requestMiniAppB2BAccess(payload: { slug: string; initData: string }): Promise<MiniAppB2BAccessRequestResponse> {
  return await apiFetch('/miniapp/b2b/access/request', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
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

export async function getMiniAppVehicleTaxonomy(params?: { slug?: string }): Promise<VehicleTaxonomyResponse> {
  const query = new URLSearchParams();
  if (params?.slug) query.append('slug', params.slug);
  const response = await apiFetch(`/miniapp/vehicle-taxonomy?${query.toString()}`, {
    method: 'GET',
    skipAuth: true
  });
  return response as VehicleTaxonomyResponse;
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
  availabilityState?: 'IN_STOCK' | 'IN_TRANSIT' | 'IMPORT_TO_ORDER' | 'RESERVED' | 'SOLD' | 'UNKNOWN';
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
  if (params.availabilityState) query.append('availabilityState', params.availabilityState);
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

export function buildMiniAppB2bMyRequestsPath(params: { slug: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  return `/miniapp/b2b/requests/my?${query.toString()}`;
}

export async function getMiniAppB2bMyRequests(params: { slug: string; initData: string }): Promise<MiniAppB2bListResponse<MiniAppB2bMyRequestItem>> {
  return await apiFetch(buildMiniAppB2bMyRequestsPath(params), {
    method: 'GET',
    skipAuth: true,
    headers: buildMiniAppInitDataHeaders(params.initData)
  });
}

export function buildMiniAppB2bActiveRequestsPath(params: { slug: string; limit?: number }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  if (params.limit) query.append('limit', String(params.limit));
  return `/miniapp/b2b/requests/active?${query.toString()}`;
}

export async function getMiniAppB2bActiveRequests(params: { slug: string; initData: string; limit?: number }): Promise<MiniAppB2bListResponse<MiniAppB2bActiveRequestItem>> {
  return await apiFetch(buildMiniAppB2bActiveRequestsPath(params), {
    method: 'GET',
    skipAuth: true,
    headers: buildMiniAppInitDataHeaders(params.initData)
  });
}

export function buildMiniAppB2bReceivedVariantsPath(params: { slug: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  return `/miniapp/b2b/variants/received?${query.toString()}`;
}

export async function getMiniAppB2bReceivedVariants(params: { slug: string; initData: string }): Promise<MiniAppB2bListResponse<MiniAppB2bReceivedVariantItem>> {
  return await apiFetch(buildMiniAppB2bReceivedVariantsPath(params), {
    method: 'GET',
    skipAuth: true,
    headers: buildMiniAppInitDataHeaders(params.initData)
  });
}

export function buildMiniAppB2bVariantDecisionPath(variantId: string) {
  return `/miniapp/b2b/variants/${encodeURIComponent(variantId)}/decision`;
}

export function buildMiniAppB2bOfferSubmitPath(requestRef: string) {
  return `/miniapp/b2b/requests/${encodeURIComponent(requestRef)}/variants`;
}

export async function submitMiniAppB2bOffer(requestRef: string, payload: MiniAppB2bOfferPayload): Promise<MiniAppB2bOfferSubmitResponse> {
  return await apiFetch(buildMiniAppB2bOfferSubmitPath(requestRef), {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function setMiniAppB2bVariantDecision(variantId: string, payload: { slug: string; initData: string; decision: 'FIT' | 'NOT_FIT' }): Promise<{
  ok: boolean;
  variant?: {
    id: string;
    requesterDecision?: string;
    fitQueueStatus?: string | null;
  };
}> {
  return await apiFetch(buildMiniAppB2bVariantDecisionPath(variantId), {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export function buildMiniAppB2bAdminFitQueuePath(params: { slug: string; status?: string }) {
  const query = new URLSearchParams();
  query.append('slug', params.slug);
  if (params.status) query.append('status', params.status);
  return `/miniapp/b2b/admin/fit-queue?${query.toString()}`;
}

export async function getMiniAppB2bAdminFitQueue(params: { slug: string; initData: string; status?: string }) {
  return await apiFetch(buildMiniAppB2bAdminFitQueuePath(params), {
    method: 'GET',
    skipAuth: true,
    headers: buildMiniAppInitDataHeaders(params.initData)
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
