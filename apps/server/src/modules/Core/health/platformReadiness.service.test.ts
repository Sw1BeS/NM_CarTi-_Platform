import { describe, expect, it } from 'vitest';
import { getPlatformReadinessReport } from './platformReadiness.service.js';

const rows = (key: string, values: Record<string, number>) =>
  Object.entries(values).map(([value, count]) => ({ [key]: value, _count: { _all: count } }));

const buildPrismaMock = (overrides: Record<string, unknown> = {}) => ({
  botConfig: {
    findMany: async () => [
      {
        id: 'lead_bot',
        name: 'Cartie Client Bot',
        template: 'CLIENT_LEAD',
        isEnabled: true,
        companyId: 'company_1',
        channelId: '-1001',
        adminChatId: '-1002',
        defaultShowcase: { slug: 'cartie' },
        config: {
          defaultShowcaseSlug: 'cartie',
          miniAppConfig: {
            url: 'https://cartie.test/p/app/cartie',
            showcaseSlug: 'cartie',
            surfaceMode: 'LEAD'
          },
          menuConfig: {
            buttons: [
              { type: 'WEB_APP', value: 'https://cartie.test/p/app/cartie?entry=request&type=BUY' },
              { type: 'WEB_APP', value: 'https://cartie.test/p/app/cartie?entry=inventory&status=AVAILABLE' }
            ]
          }
        }
      },
      {
        id: 'b2b_bot',
        name: 'B2B',
        template: 'B2B',
        isEnabled: true,
        companyId: 'company_1',
        channelId: '-1003',
        adminChatId: '-1004',
        defaultShowcase: { slug: 'cardealer_lviv_bot' },
        config: {
          defaultShowcaseSlug: 'cardealer_lviv_bot',
          miniAppConfig: {
            url: 'https://cartie.test/p/app/cardealer_lviv_bot',
            showcaseSlug: 'cardealer_lviv_bot',
            surfaceMode: 'B2B'
          },
          menuConfig: {
            buttons: [
              { type: 'WEB_APP', value: 'https://cartie.test/p/app/cardealer_lviv_bot?entry=request' },
              { type: 'WEB_APP', value: 'https://cartie.test/p/app/cardealer_lviv_bot?entry=status' }
            ]
          }
        }
      }
    ]
  },
  showcase: {
    findMany: async () => [
      { id: 'showcase_1', name: 'Cartie', slug: 'cartie', workspaceId: 'company_1', botId: null, isPublic: true, rules: {} },
      { id: 'showcase_2', name: 'B2B', slug: 'cardealer_lviv_bot', workspaceId: 'company_1', botId: null, isPublic: true, rules: {} }
    ]
  },
  lead: { groupBy: async () => rows('status', { NEW: 2, CONTACTED: 1 }) },
  leadIdentity: { count: async () => 3 },
  contact: { count: async () => 2 },
  case: { count: async () => 1 },
  b2bRequest: {
    groupBy: async ({ by }: any) => by.includes('type') ? rows('type', { BUY: 4, SELL: 1 }) : rows('status', { DRAFT: 1, PUBLISHED: 2 })
  },
  requestVariant: { groupBy: async () => rows('requesterDecision', { PENDING: 2, FIT: 1 }) },
  carListing: {
    groupBy: async ({ by }: any) => by.includes('publicationStatus')
      ? rows('publicationStatus', { PUBLISHED: 5, REVIEW: 1 })
      : rows('availabilityState', { IN_STOCK: 4, IN_TRANSIT: 2 })
  },
  integration: {
    findMany: async () => [
      { type: 'META_PIXEL', isActive: true, healthStatus: 'OK', healthCheckedAt: new Date('2026-05-18T00:00:00Z'), retryCount: 0, lastError: null }
    ]
  },
  integrationEventLog: { groupBy: async () => [{ integration: 'META_PIXEL', status: 'SUCCESS', _count: { _all: 3 } }] },
  mTProtoConnector: {
    findMany: async () => [
      { id: 'mt_1', name: 'Import', status: 'READY', connectedAt: new Date('2026-05-18T00:00:00Z'), lastHealthCheckAt: null, lastError: null }
    ]
  },
  channelSource: { groupBy: async () => rows('status', { ACTIVE: 2 }) },
  partnerCompany: { count: async () => 2 },
  partnerUser: { count: async () => 2 },
  b2bAccessRequest: { groupBy: async () => rows('status', { NEW: 1 }) },
  ...overrides
});

describe('platform readiness service', () => {
  it('builds an OK read-only report without leaking raw bot secrets or integration config', async () => {
    const report = await getPlatformReadinessReport({
      companyId: 'company_1',
      prisma: buildPrismaMock() as any
    });

    expect(report.status).toBe('OK');
    expect(report.sections.bots.status).toBe('OK');
    expect(report.sections.miniapp.summary).toContain('Lead=cartie');
    expect(report.sections.crm.details).toMatchObject({
      leadIdentityCount: 3,
      contactCount: 2,
      caseCount: 1
    });
    expect(report.sections.inventory.details).toMatchObject({
      availabilityState: { IN_STOCK: 4, IN_TRANSIT: 2 }
    });
    expect(JSON.stringify(report)).not.toContain('telegram-token');
    expect(JSON.stringify(report)).not.toContain('accessToken');
    expect(JSON.stringify(report)).not.toContain('sessionString');
  });

  it('warns when core bot contracts drift from expected MiniApp surface rules', async () => {
    const prisma = buildPrismaMock({
      botConfig: {
        findMany: async () => [
          {
            id: 'lead_bot',
            name: 'Cartie Client Bot',
            template: 'CLIENT_LEAD',
            isEnabled: true,
            companyId: 'company_1',
            channelId: null,
            adminChatId: null,
            defaultShowcase: { slug: 'cartie' },
            config: {
              defaultShowcaseSlug: 'cartie',
              miniAppConfig: { url: 'https://cartie.test/p/app/cartie', surfaceMode: 'B2B' },
              menuConfig: {
                buttons: [{ type: 'WEB_APP', value: 'https://cartie.test/p/app/old?entry=request&type=BUY' }]
              }
            }
          }
        ]
      }
    });

    const report = await getPlatformReadinessReport({
      companyId: 'company_1',
      prisma: prisma as any
    });

    expect(report.status).toBe('WARN');
    expect(report.sections.bots.status).toBe('WARN');
    expect(report.sections.bots.details?.problems).toEqual(expect.arrayContaining([
      'CLIENT_LEAD:surface_mode_B2B_expected_LEAD',
      'CLIENT_LEAD:stale_menu_button_slug',
      'CLIENT_LEAD:admin_chat_missing',
      'B2B:missing'
    ]));
  });
});
