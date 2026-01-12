import { apiFetch } from './apiClient';
import type { Lead, B2BRequest } from '../types';

export async function createPublicLead(payload: Partial<Lead>): Promise<Lead> {
  return await apiFetch('/public/leads', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function createPublicRequest(payload: Partial<B2BRequest>): Promise<B2BRequest> {
  return await apiFetch('/public/requests', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function addPublicVariant(requestId: string, payload: any): Promise<any> {
  return await apiFetch(`/public/requests/${requestId}/variants`, {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function createDealerSession(initData: string): Promise<{ user: any }> {
  return await apiFetch('/public/dealer/session', {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ initData })
  });
}

export async function getPublicBots(): Promise<any[]> {
  return await apiFetch('/public/bots', {
    method: 'GET',
    skipAuth: true
  });
}
