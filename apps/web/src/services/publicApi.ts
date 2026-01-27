import { apiFetch } from './apiClient';
import type { Lead, B2BRequest, Proposal, Variant } from '../types';

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

export async function getPublicRequests(): Promise<{ items: B2BRequest[] }> {
  return await apiFetch('/public/requests', {
    method: 'GET',
    skipAuth: true
  });
}

export async function getPublicInventory(slug: string): Promise<{ items: any[] }> {
  return await apiFetch(`/public/${slug}/inventory`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function createPublicRequestWithSlug(slug: string, payload: Partial<B2BRequest>): Promise<B2BRequest> {
  return await apiFetch(`/public/${slug}/requests`, {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify(payload)
  });
}

export async function getPublicProposal(id: string): Promise<{ proposal: Proposal | null; variants: Variant[] }> {
  return await apiFetch(`/public/proposals/${id}`, {
    method: 'GET',
    skipAuth: true
  });
}

export async function trackPublicProposalView(id: string): Promise<void> {
  await apiFetch(`/public/proposals/${id}/view`, {
    method: 'POST',
    skipAuth: true
  });
}

export async function sendPublicProposalFeedback(id: string, variantId: string, type: 'LIKE' | 'DISLIKE' | 'INTERESTED'): Promise<void> {
  await apiFetch(`/public/proposals/${id}/feedback`, {
    method: 'POST',
    skipAuth: true,
    body: JSON.stringify({ variantId, type })
  });
}
