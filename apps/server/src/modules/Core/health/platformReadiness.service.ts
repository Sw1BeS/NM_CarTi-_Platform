import { prisma as defaultPrisma } from '../../../services/prisma.js';

export type ReadinessStatus = 'OK' | 'WARN' | 'ERROR';

export type ReadinessCheck = {
  status: ReadinessStatus;
  label: string;
  summary: string;
  details?: Record<string, unknown>;
};

export type PlatformReadinessReport = {
  status: ReadinessStatus;
  generatedAt: string;
  companyId?: string;
  sections: {
    bots: ReadinessCheck;
    miniapp: ReadinessCheck;
    crm: ReadinessCheck;
    inventory: ReadinessCheck;
    b2b: ReadinessCheck;
    integrations: ReadinessCheck;
  };
  metrics: Record<string, unknown>;
};

type PrismaLike = typeof defaultPrisma;

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeString = (value: unknown) => String(value || '').trim();

const countRows = <T extends Record<string, any>>(rows: T[], key: keyof T) =>
  rows.reduce<Record<string, number>>((acc, row) => {
    const value = normalizeString(row[key]) || 'UNKNOWN';
    const count = Number(row._count?._all || row._count || 0);
    acc[value] = count;
    return acc;
  }, {});

const sectionStatus = (problems: string[], hasData = true): ReadinessStatus => {
  if (!hasData) return 'WARN';
  return problems.length ? 'WARN' : 'OK';
};

const botSlug = (bot: any) => {
  const config = isRecord(bot.config) ? bot.config : {};
  const miniAppConfig = isRecord(config.miniAppConfig) ? config.miniAppConfig : {};
  return normalizeString(config.defaultShowcaseSlug)
    || normalizeString(miniAppConfig.showcaseSlug)
    || normalizeString(bot.defaultShowcase?.slug)
    || 'system';
};

const botSurfaceMode = (bot: any) => {
  const config = isRecord(bot.config) ? bot.config : {};
  const miniAppConfig = isRecord(config.miniAppConfig) ? config.miniAppConfig : {};
  return normalizeString(miniAppConfig.surfaceMode).toUpperCase();
};

const botHasMiniAppUrl = (bot: any) => {
  const config = isRecord(bot.config) ? bot.config : {};
  const miniAppConfig = isRecord(config.miniAppConfig) ? config.miniAppConfig : {};
  return Boolean(normalizeString(miniAppConfig.url) || normalizeString(miniAppConfig.baseUrl) || normalizeString(config.publicBaseUrl));
};

const summarizeBotContracts = (bots: any[], showcases: any[]) => {
  const showcaseBySlug = new Map(showcases.map(showcase => [showcase.slug, showcase]));
  const details = bots.map((bot) => {
    const slug = botSlug(bot);
    const mode = botSurfaceMode(bot);
    const expectedMode = bot.template === 'B2B' ? 'B2B' : bot.template === 'CLIENT_LEAD' ? 'LEAD' : '';
    const config = isRecord(bot.config) ? bot.config : {};
    const buttons = Array.isArray(config.menuConfig?.buttons) ? config.menuConfig.buttons : [];
    const webAppButtons = buttons.filter((button: any) => ['WEB_APP', 'LINK'].includes(normalizeString(button?.type).toUpperCase()));
    const staleButtons = webAppButtons.filter((button: any) => {
      const value = normalizeString(button?.value);
      return value.includes('/p/app/') && slug && !value.includes(`/p/app/${slug}`);
    });
    const writeButtons = webAppButtons.filter((button: any) => {
      const value = normalizeString(button?.value);
      return value.includes('entry=request') || value.includes('type=SELL') || value.includes('type=BUY');
    });
    const showcase = showcaseBySlug.get(slug);
    const problems: string[] = [];

    if (!bot.isEnabled) problems.push('bot_disabled');
    if (!botHasMiniAppUrl(bot)) problems.push('missing_miniapp_url');
    if (expectedMode && mode !== expectedMode) problems.push(`surface_mode_${mode || 'missing'}_expected_${expectedMode}`);
    if (!showcase) problems.push('showcase_not_found_for_slug');
    if (showcase && showcase.workspaceId !== bot.companyId) problems.push('showcase_workspace_mismatch');
    if (staleButtons.length) problems.push('stale_menu_button_slug');
    if (!bot.adminChatId) problems.push('admin_chat_missing');

    return {
      id: bot.id,
      name: bot.name || bot.template,
      template: bot.template,
      slug,
      surfaceMode: mode || null,
      enabled: Boolean(bot.isEnabled),
      adminChatConfigured: Boolean(bot.adminChatId),
      channelConfigured: Boolean(bot.channelId),
      webAppButtonCount: webAppButtons.length,
      writeButtonCount: writeButtons.length,
      problems
    };
  });

  return details;
};

const statusFromSections = (sections: Record<string, ReadinessCheck>): ReadinessStatus => {
  if (Object.values(sections).some(section => section.status === 'ERROR')) return 'ERROR';
  if (Object.values(sections).some(section => section.status === 'WARN')) return 'WARN';
  return 'OK';
};

export const getPlatformReadinessReport = async (params: {
  companyId?: string;
  prisma?: PrismaLike;
} = {}): Promise<PlatformReadinessReport> => {
  const db = params.prisma || defaultPrisma;
  const companyId = normalizeString(params.companyId) || undefined;
  const companyWhere = companyId ? { companyId } : {};
  const workspaceWhere = companyId ? { workspaceId: companyId } : {};
  const contactWhere = companyId ? { workspace_id: companyId } : {};
  const connectorWhere = companyId ? { companyId } : {};
  const channelSourceWhere = companyId ? { connector: { companyId } } : {};

  const [
    bots,
    showcases,
    leadStatusRows,
    leadIdentityCount,
    contactCount,
    caseCount,
    requestStatusRows,
    requestTypeRows,
    variantDecisionRows,
    inventoryAvailabilityRows,
    inventoryPublicationRows,
    integrationRows,
    integrationLogRows,
    mtprotoConnectorRows,
    channelSourceRows,
    partnerCount,
    partnerUserCount,
    accessRequestRows
  ] = await Promise.all([
    db.botConfig.findMany({
      where: {
        ...companyWhere,
        template: { in: ['CLIENT_LEAD', 'B2B'] }
      },
      select: {
        id: true,
        name: true,
        template: true,
        isEnabled: true,
        companyId: true,
        channelId: true,
        adminChatId: true,
        config: true,
        defaultShowcase: { select: { slug: true } }
      },
      orderBy: { createdAt: 'asc' }
    }),
    db.showcase.findMany({
      where: workspaceWhere,
      select: { id: true, name: true, slug: true, workspaceId: true, botId: true, isPublic: true, rules: true }
    }),
    db.lead.groupBy({ by: ['status'], where: companyWhere, _count: { _all: true } }),
    db.leadIdentity.count({ where: companyWhere }),
    db.contact.count({ where: contactWhere }),
    db.case.count({ where: contactWhere }),
    db.b2bRequest.groupBy({ by: ['status'], where: companyWhere, _count: { _all: true } }),
    db.b2bRequest.groupBy({ by: ['type'], where: companyWhere, _count: { _all: true } }),
    db.requestVariant.groupBy({
      by: ['requesterDecision'],
      where: companyId ? { request: { companyId } } : {},
      _count: { _all: true }
    }),
    db.carListing.groupBy({ by: ['availabilityState'], where: companyWhere, _count: { _all: true } }),
    db.carListing.groupBy({ by: ['publicationStatus'], where: companyWhere, _count: { _all: true } }),
    db.integration.findMany({
      where: companyWhere,
      select: {
        type: true,
        isActive: true,
        healthStatus: true,
        healthCheckedAt: true,
        retryCount: true,
        lastError: true
      }
    }),
    db.integrationEventLog.groupBy({
      by: ['integration', 'status'],
      where: companyWhere,
      _count: { _all: true },
      orderBy: { integration: 'asc' }
    }),
    db.mTProtoConnector.findMany({
      where: connectorWhere,
      select: { id: true, name: true, status: true, connectedAt: true, lastHealthCheckAt: true, lastError: true }
    }),
    db.channelSource.groupBy({ by: ['status'], where: channelSourceWhere, _count: { _all: true } }),
    db.partnerCompany.count({ where: companyWhere }),
    db.partnerUser.count({ where: companyWhere }),
    db.b2bAccessRequest.groupBy({ by: ['status'], where: companyWhere, _count: { _all: true } })
  ]);

  const botContracts = summarizeBotContracts(bots, showcases);
  const leadBot = botContracts.find(bot => bot.template === 'CLIENT_LEAD');
  const b2bBot = botContracts.find(bot => bot.template === 'B2B');
  const botProblems = botContracts.flatMap(bot => bot.problems.map(problem => `${bot.template}:${problem}`));
  if (!leadBot) botProblems.push('CLIENT_LEAD:missing');
  if (!b2bBot) botProblems.push('B2B:missing');

  const integrationProblems = integrationRows
    .filter(row => row.isActive && ['ERROR', 'FAILED'].includes(normalizeString(row.healthStatus).toUpperCase()))
    .map(row => `${row.type}:health_error`);
  const connectorProblems = mtprotoConnectorRows
    .filter(row => ['ERROR', 'DISCONNECTED'].includes(normalizeString(row.status).toUpperCase()))
    .map(row => `${row.name}:mtproto_${normalizeString(row.status).toLowerCase()}`);

  const leadCounts = countRows(leadStatusRows as any[], 'status');
  const requestCounts = countRows(requestStatusRows as any[], 'status');
  const inventoryAvailability = countRows(inventoryAvailabilityRows as any[], 'availabilityState');
  const inventoryPublication = countRows(inventoryPublicationRows as any[], 'publicationStatus');
  const accessRequests = countRows(accessRequestRows as any[], 'status');
  const channelSources = countRows(channelSourceRows as any[], 'status');
  const requestTypes = countRows(requestTypeRows as any[], 'type');
  const variantDecisions = countRows(variantDecisionRows as any[], 'requesterDecision');

  const sections = {
    bots: {
      status: sectionStatus(botProblems, botContracts.length > 0),
      label: 'Telegram bot contracts',
      summary: `${botContracts.length} core bot(s), ${botProblems.length} issue(s)`,
      details: { bots: botContracts, problems: botProblems }
    },
    miniapp: {
      status: sectionStatus(botProblems.filter(problem => problem.includes('showcase') || problem.includes('miniapp') || problem.includes('surface_mode')), botContracts.length > 0),
      label: 'MiniApp surfaces',
      summary: `Lead=${leadBot?.slug || 'missing'}, B2B=${b2bBot?.slug || 'missing'}`,
      details: {
        slugs: botContracts.map(bot => ({ template: bot.template, slug: bot.slug, surfaceMode: bot.surfaceMode })),
        showcaseCount: showcases.length
      }
    },
    crm: {
      status: sectionStatus([], Boolean(leadIdentityCount || contactCount || caseCount || Object.keys(leadCounts).length || Object.keys(requestCounts).length)),
      label: 'CRM pipeline',
      summary: `${Object.values(leadCounts).reduce((sum, value) => sum + value, 0)} lead(s), ${Object.values(requestCounts).reduce((sum, value) => sum + value, 0)} request(s)`,
      details: { leadsByStatus: leadCounts, requestsByStatus: requestCounts, leadIdentityCount, contactCount, caseCount }
    },
    inventory: {
      status: sectionStatus([], Boolean(Object.keys(inventoryAvailability).length || Object.keys(inventoryPublication).length)),
      label: 'Inventory states',
      summary: `${Object.values(inventoryAvailability).reduce((sum, value) => sum + value, 0)} listing(s)`,
      details: { availabilityState: inventoryAvailability, publicationStatus: inventoryPublication }
    },
    b2b: {
      status: sectionStatus([], Boolean(b2bBot || partnerCount || partnerUserCount || Object.keys(accessRequests).length)),
      label: 'B2B partner workflow',
      summary: `${partnerCount} partner(s), ${partnerUserCount} partner user(s)`,
      details: { partnerCount, partnerUserCount, accessRequestsByStatus: accessRequests, requestTypes, variantDecisions }
    },
    integrations: {
      status: sectionStatus([...integrationProblems, ...connectorProblems], Boolean(integrationRows.length || mtprotoConnectorRows.length || Object.keys(channelSources).length)),
      label: 'Integration health',
      summary: `${integrationRows.length} integration config(s), ${mtprotoConnectorRows.length} MTProto connector(s)`,
      details: {
        integrations: integrationRows.map(row => ({
          type: row.type,
          active: row.isActive,
          healthStatus: row.healthStatus || 'UNKNOWN',
          healthCheckedAt: row.healthCheckedAt,
          retryCount: row.retryCount,
          hasLastError: Boolean(row.lastError)
        })),
        integrationLogs: integrationLogRows.map(row => ({
          integration: row.integration,
          status: row.status,
          count: row._count._all
        })),
        mtprotoConnectors: mtprotoConnectorRows.map(row => ({
          id: row.id,
          name: row.name,
          status: row.status,
          connectedAt: row.connectedAt,
          lastHealthCheckAt: row.lastHealthCheckAt,
          hasLastError: Boolean(row.lastError)
        })),
        channelSourcesByStatus: channelSources,
        problems: [...integrationProblems, ...connectorProblems]
      }
    }
  } satisfies PlatformReadinessReport['sections'];

  return {
    status: statusFromSections(sections),
    generatedAt: new Date().toISOString(),
    companyId,
    sections,
    metrics: {
      bots: { total: botContracts.length },
      miniapp: { showcaseCount: showcases.length },
      crm: { leadsByStatus: leadCounts, requestsByStatus: requestCounts, leadIdentityCount, contactCount, caseCount },
      inventory: { availabilityState: inventoryAvailability, publicationStatus: inventoryPublication },
      b2b: { partnerCount, partnerUserCount, accessRequestsByStatus: accessRequests },
      integrations: { integrationCount: integrationRows.length, mtprotoConnectorCount: mtprotoConnectorRows.length, channelSourcesByStatus: channelSources }
    }
  };
};
