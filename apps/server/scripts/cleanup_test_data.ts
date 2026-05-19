import { PrismaClient } from '@prisma/client';
import {
  buildCleanupTestDataUsage,
  parseCleanupTestDataArgs,
  validateCleanupTestDataOptions
} from '../src/scripts/cleanup_test_data.helpers.js';

const prisma = new PrismaClient();

const options = parseCleanupTestDataArgs(process.argv.slice(2));
const errors = validateCleanupTestDataOptions(options);

type CompanyScope = {
  id: string;
  slug: string;
  name: string;
};

type CleanupCounts = Record<string, number>;

const log = (message: string) => console.log(`[cleanup:test-data] ${message}`);

const collectIds = <T extends { id: string }>(items: T[]) => items.map((item) => item.id);

const maybeIn = (values: string[]) => values.length ? { in: values } : { in: ['__none__'] };

const resolveCompanies = async (): Promise<CompanyScope[]> => {
  const where = options.companyId ? { id: options.companyId } : {};
  const companies = await prisma.workspace.findMany({
    where,
    select: { id: true, slug: true, name: true },
    orderBy: { created_at: 'asc' }
  });
  return companies.map((company) => ({
    id: company.id,
    slug: String(company.slug),
    name: company.name
  }));
};

const collectScope = async (companyId: string) => {
  const [bots, requests, leads, partners] = await Promise.all([
    prisma.botConfig.findMany({ where: { companyId }, select: { id: true } }),
    prisma.b2bRequest.findMany({ where: { companyId }, select: { id: true } }),
    prisma.lead.findMany({ where: { companyId }, select: { id: true } }),
    prisma.partnerCompany.findMany({ where: { companyId }, select: { id: true } })
  ]);

  const requestIds = collectIds(requests);
  const partnerIds = collectIds(partners);
  const variants = await prisma.requestVariant.findMany({
    where: {
      OR: [
        { requestId: maybeIn(requestIds) },
        ...(options.includePartners ? [{ sellerPartnerId: maybeIn(partnerIds) }] : [])
      ]
    },
    select: { id: true }
  });

  return {
    botIds: collectIds(bots),
    requestIds,
    leadIds: collectIds(leads),
    partnerIds,
    variantIds: collectIds(variants)
  };
};

const countCompany = async (company: CompanyScope): Promise<CleanupCounts> => {
  const scope = await collectScope(company.id);
  const botIdFilter = maybeIn(scope.botIds);
  const requestIdFilter = maybeIn(scope.requestIds);
  const variantIdFilter = maybeIn(scope.variantIds);
  const leadIdFilter = maybeIn(scope.leadIds);
  const partnerIdFilter = maybeIn(scope.partnerIds);

  const counts: CleanupCounts = {
    b2bRequests: await prisma.b2bRequest.count({ where: { companyId: company.id } }),
    requestVariants: await prisma.requestVariant.count({ where: { id: variantIdFilter } }),
    leads: await prisma.lead.count({ where: { companyId: company.id } }),
    leadIdentities: await prisma.leadIdentity.count({ where: { leadId: leadIdFilter } }),
    leadActivities: await prisma.leadActivity.count({ where: { leadId: leadIdFilter } }),
    messageLogs: await prisma.messageLog.count({
      where: {
        OR: [
          { requestId: requestIdFilter },
          { variantId: variantIdFilter },
          { botId: botIdFilter }
        ]
      }
    }),
    channelPostsForRequests: await prisma.channelPost.count({ where: { requestId: requestIdFilter } }),
    miniAppFavorites: await prisma.miniAppFavorite.count({ where: { companyId: company.id } }),
    supportTickets: await prisma.supportTicket.count({ where: { companyId: company.id } }),
    b2bAccessRequests: await prisma.b2bAccessRequest.count({ where: { companyId: company.id } }),
    botSessions: await prisma.botSession.count({ where: { botId: botIdFilter } })
  };

  if (options.includePartners) {
    counts.partnerUsers = await prisma.partnerUser.count({ where: { companyId: company.id } });
    counts.partnerCompanies = await prisma.partnerCompany.count({ where: { companyId: company.id } });
    counts.partnerInventoryReferencesPreserved = await prisma.carListing.count({ where: { partnerCompanyId: partnerIdFilter } });
  }

  if (options.includeLogs) {
    counts.platformEvents = await prisma.platformEvent.count({ where: { companyId: company.id } });
    counts.telegramUpdates = await prisma.telegramUpdate.count({ where: { botId: botIdFilter } });
    counts.integrationEventLogs = await prisma.integrationEventLog.count({ where: { companyId: company.id } });
  }

  if (options.includeCrm) {
    counts.crmContacts = await prisma.contact.count({ where: { workspace_id: company.id } });
    counts.crmCases = await prisma.case.count({ where: { workspace_id: company.id } });
    counts.crmCaseContactLinks = await prisma.caseContactLink.count({ where: { workspace_id: company.id } });
    counts.crmConversations = await prisma.conversation.count({ where: { workspace_id: company.id } });
    counts.crmMessages = await prisma.message.count({ where: { workspace_id: company.id } });
    counts.crmMessageDeliveries = await prisma.messageDelivery.count({ where: { workspace_id: company.id } });
  }

  return counts;
};

const deleteCompany = async (company: CompanyScope) => {
  const scope = await collectScope(company.id);
  const botIdFilter = maybeIn(scope.botIds);
  const requestIdFilter = maybeIn(scope.requestIds);
  const variantIdFilter = maybeIn(scope.variantIds);

  const deleted: CleanupCounts = {};

  if (options.includeLogs) {
    deleted.platformEvents = (await prisma.platformEvent.deleteMany({ where: { companyId: company.id } })).count;
    deleted.telegramUpdates = (await prisma.telegramUpdate.deleteMany({ where: { botId: botIdFilter } })).count;
    deleted.integrationEventLogs = (await prisma.integrationEventLog.deleteMany({ where: { companyId: company.id } })).count;
  }

  if (options.includeCrm) {
    deleted.crmMessageDeliveries = (await prisma.messageDelivery.deleteMany({ where: { workspace_id: company.id } })).count;
    deleted.crmMessages = (await prisma.message.deleteMany({ where: { workspace_id: company.id } })).count;
    deleted.crmConversations = (await prisma.conversation.deleteMany({ where: { workspace_id: company.id } })).count;
    deleted.crmCaseContactLinks = (await prisma.caseContactLink.deleteMany({ where: { workspace_id: company.id } })).count;
    deleted.crmCases = (await prisma.case.deleteMany({ where: { workspace_id: company.id } })).count;
    deleted.crmContacts = (await prisma.contact.deleteMany({ where: { workspace_id: company.id } })).count;
  }

  deleted.messageLogs = (await prisma.messageLog.deleteMany({
    where: {
      OR: [
        { requestId: requestIdFilter },
        { variantId: variantIdFilter },
        { botId: botIdFilter }
      ]
    }
  })).count;
  deleted.channelPostsForRequests = (await prisma.channelPost.deleteMany({ where: { requestId: requestIdFilter } })).count;
  deleted.miniAppFavorites = (await prisma.miniAppFavorite.deleteMany({ where: { companyId: company.id } })).count;
  deleted.supportTickets = (await prisma.supportTicket.deleteMany({ where: { companyId: company.id } })).count;
  deleted.b2bAccessRequests = (await prisma.b2bAccessRequest.deleteMany({ where: { companyId: company.id } })).count;
  deleted.botSessions = (await prisma.botSession.deleteMany({ where: { botId: botIdFilter } })).count;
  deleted.b2bRequests = (await prisma.b2bRequest.deleteMany({ where: { companyId: company.id } })).count;
  deleted.leads = (await prisma.lead.deleteMany({ where: { companyId: company.id } })).count;

  if (options.includePartners) {
    deleted.partnerUsers = (await prisma.partnerUser.deleteMany({ where: { companyId: company.id } })).count;
    deleted.partnerCompanies = (await prisma.partnerCompany.deleteMany({ where: { companyId: company.id } })).count;
  }

  return deleted;
};

const printCounts = (company: CompanyScope, counts: CleanupCounts, label: string) => {
  log(`${label} company=${company.slug} (${company.id}) name="${company.name}"`);
  for (const [key, value] of Object.entries(counts)) {
    log(`  ${key}: ${value}`);
  }
};

async function main() {
  if (errors.length) {
    console.error(buildCleanupTestDataUsage());
    for (const error of errors) console.error(`[cleanup:test-data] error: ${error}`);
    process.exitCode = 1;
    return;
  }

  log(`mode=${options.execute ? 'EXECUTE' : 'DRY_RUN'}`);
  log(`includePartners=${options.includePartners ? 'yes' : 'no'} includeLogs=${options.includeLogs ? 'yes' : 'no'} includeCrm=${options.includeCrm ? 'yes' : 'no'}`);
  log('preserved: inventory/car listings, showcases, bot configs, admin users, memberships');

  const companies = await resolveCompanies();
  if (!companies.length) {
    log('no matching companies found');
    return;
  }

  for (const company of companies) {
    const before = await countCompany(company);
    printCounts(company, before, 'planned');

    if (!options.execute) continue;

    const deleted = await deleteCompany(company);
    printCounts(company, deleted, 'deleted');
  }

  if (!options.execute) {
    log('dry-run complete. Re-run with --execute and the confirm phrase to delete.');
  }
}

main()
  .catch((error) => {
    console.error('[cleanup:test-data] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
