import { describe, expect, it } from 'vitest';
import {
  buildMiniAppB2BPartnerPortalPath,
  buildMiniAppB2bAdminFitQueuePath,
  buildMiniAppB2bMyRequestsPath,
  buildMiniAppB2bReceivedVariantsPath,
  buildMiniAppB2bVariantDecisionPath,
  buildMiniAppRequestStatusPath
} from '../../../web/src/services/miniappApi.ts';

const initData = new URLSearchParams({
  query_id: 'query_1',
  user: JSON.stringify({ id: 1001, first_name: 'Ivan', username: 'dealer_ivan' }),
  auth_date: '1779070000',
  hash: 'hash_1'
}).toString();

describe('MiniApp API web client contract', () => {
  it('builds request status reads with signed initData and no spoofable identity params', () => {
    const path = buildMiniAppRequestStatusPath({
      slug: 'cardealer_lviv_bot',
      initData,
      requestId: 'CD-2026-000123',
      telegramUserId: '9999',
      phone: '+380000000000'
    } as any);
    const url = new URL(path, 'https://cartie.local');

    expect(url.pathname).toBe('/miniapp/requests/status');
    expect(url.searchParams.get('slug')).toBe('cardealer_lviv_bot');
    expect(url.searchParams.get('initData')).toBe(initData);
    expect(url.searchParams.get('requestId')).toBe('CD-2026-000123');
    expect(url.searchParams.has('telegramUserId')).toBe(false);
    expect(url.searchParams.has('phone')).toBe(false);
  });

  it('builds B2B partner portal reads with signed initData', () => {
    const path = buildMiniAppB2BPartnerPortalPath({
      slug: 'cardealer_lviv_bot',
      initData
    });
    const url = new URL(path, 'https://cartie.local');

    expect(url.pathname).toBe('/miniapp/b2b/me');
    expect(url.searchParams.get('slug')).toBe('cardealer_lviv_bot');
    expect(url.searchParams.get('initData')).toBe(initData);
  });

  it('builds B2B activity reads with signed initData', () => {
    const myRequests = new URL(
      buildMiniAppB2bMyRequestsPath({
        slug: 'b2b_bot',
        initData,
        telegramUserId: 'spoofed'
      } as any),
      'https://cartie.local'
    );
    const receivedVariants = new URL(
      buildMiniAppB2bReceivedVariantsPath({ slug: 'b2b_bot', initData }),
      'https://cartie.local'
    );

    expect(myRequests.pathname).toBe('/miniapp/b2b/requests/my');
    expect(myRequests.searchParams.get('slug')).toBe('b2b_bot');
    expect(myRequests.searchParams.get('initData')).toBe(initData);
    expect(myRequests.searchParams.has('telegramUserId')).toBe(false);
    expect(receivedVariants.pathname).toBe('/miniapp/b2b/variants/received');
    expect(receivedVariants.searchParams.get('slug')).toBe('b2b_bot');
    expect(receivedVariants.searchParams.get('initData')).toBe(initData);
  });

  it('builds B2B decision and admin queue paths without leaking identities into query params', () => {
    const decision = new URL(buildMiniAppB2bVariantDecisionPath('variant/with space'), 'https://cartie.local');
    const adminQueue = new URL(
      buildMiniAppB2bAdminFitQueuePath({
        slug: 'b2b_bot',
        initData,
        status: 'NEW',
        phone: '+380000000000'
      } as any),
      'https://cartie.local'
    );

    expect(decision.pathname).toBe('/miniapp/b2b/variants/variant%2Fwith%20space/decision');
    expect(adminQueue.pathname).toBe('/miniapp/b2b/admin/fit-queue');
    expect(adminQueue.searchParams.get('slug')).toBe('b2b_bot');
    expect(adminQueue.searchParams.get('initData')).toBe(initData);
    expect(adminQueue.searchParams.get('status')).toBe('NEW');
    expect(adminQueue.searchParams.has('phone')).toBe(false);
  });
});
