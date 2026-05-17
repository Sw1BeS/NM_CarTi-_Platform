import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../src/modules/Inventory/normalization/normalizePhone.js';
import { generateULID } from '../src/utils/ulid.js';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const PAGE_SIZE = 200;

type Candidate = {
  provider: 'TELEGRAM' | 'PHONE';
  externalId: string;
  source: string;
};

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toText = (value: unknown) => String(value || '').trim();

const addCandidate = (items: Candidate[], provider: Candidate['provider'], value: unknown, source: string) => {
  const raw = toText(value);
  if (!raw) return;
  const externalId = provider === 'PHONE' ? normalizePhone(raw) : raw;
  if (!externalId) return;
  if (items.some((item) => item.provider === provider && item.externalId === externalId)) return;
  items.push({ provider, externalId, source });
};

const extractCandidates = (lead: { userTgId?: string | null; phone?: string | null; payload?: unknown }) => {
  const payload = isRecord(lead.payload) ? lead.payload : {};
  const telegram = isRecord(payload.telegram) ? payload.telegram : {};
  const candidates: Candidate[] = [];

  addCandidate(candidates, 'TELEGRAM', lead.userTgId, 'Lead.userTgId');
  addCandidate(candidates, 'TELEGRAM', payload.telegramUserId, 'Lead.payload.telegramUserId');
  addCandidate(candidates, 'TELEGRAM', telegram.userId || telegram.id, 'Lead.payload.telegram.userId');
  addCandidate(candidates, 'PHONE', lead.phone, 'Lead.phone');
  addCandidate(candidates, 'PHONE', payload.phone, 'Lead.payload.phone');

  return candidates;
};

const leadIdentityTableExists = async () => {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('"LeadIdentity"') IS NOT NULL AS "exists"
  `;
  return Boolean(rows[0]?.exists);
};

async function main() {
  console.log(`[audit_lead_identities] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);
  const tableExists = await leadIdentityTableExists();
  if (APPLY && !tableExists) {
    throw new Error('LeadIdentity table does not exist. Run the migration before --apply.');
  }

  let cursorId: string | undefined;
  let scanned = 0;
  let candidates = 0;
  let wouldCreate = 0;
  let existing = 0;

  while (true) {
    const leads = await prisma.lead.findMany({
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        companyId: true,
        userTgId: true,
        phone: true,
        payload: true,
        createdAt: true,
        updatedAt: true
      }
    });
    if (!leads.length) break;

    for (const lead of leads) {
      scanned += 1;
      const leadCandidates = extractCandidates(lead);
      candidates += leadCandidates.length;
      for (const candidate of leadCandidates) {
        const hasIdentity = tableExists
          ? await prisma.leadIdentity.findUnique({
              where: {
                companyId_provider_externalId: {
                  companyId: lead.companyId,
                  provider: candidate.provider,
                  externalId: candidate.externalId
                }
              },
              select: { id: true }
            })
          : null;
        if (hasIdentity) {
          existing += 1;
          continue;
        }

        wouldCreate += 1;
        console.log(
          `[audit_lead_identities] ${APPLY ? 'create' : 'would_create'} ` +
          `lead=${lead.id} provider=${candidate.provider} source=${candidate.source}`
        );

        if (APPLY) {
          await prisma.leadIdentity.upsert({
            where: {
              companyId_provider_externalId: {
                companyId: lead.companyId,
                provider: candidate.provider,
                externalId: candidate.externalId
              }
            },
            create: {
              id: generateULID(),
              companyId: lead.companyId,
              leadId: lead.id,
              provider: candidate.provider,
              externalId: candidate.externalId,
              confidence: 'HIGH',
              firstSeenAt: lead.createdAt,
              payload: {
                source: candidate.source,
                backfilledAt: new Date().toISOString()
              }
            },
            update: {
              leadId: lead.id,
              confidence: 'HIGH',
              payload: {
                source: candidate.source,
                backfilledAt: new Date().toISOString()
              }
            }
          });
        }
      }
    }

    cursorId = leads[leads.length - 1]?.id;
  }

  console.log(
    `[audit_lead_identities] done scanned=${scanned} candidates=${candidates} ` +
    `existing=${existing} ${APPLY ? 'created_or_updated' : 'would_create'}=${wouldCreate}`
  );
}

main()
  .catch((error) => {
    console.error('[audit_lead_identities] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
