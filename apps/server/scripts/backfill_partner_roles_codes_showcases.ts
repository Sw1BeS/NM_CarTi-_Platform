import { PrismaClient, PartnerUserRole } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

const hasColumn = async (tableName: string, columnName: string) => {
  const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `;
  return Boolean(result[0]?.exists);
};

const slugify = (value: string) => {
  const base = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return base || 'partner';
};

const randomCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'P-';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)] || 'X';
  }
  return out;
};

const ensureUniquePartnerCode = async (used: Set<string>) => {
  for (let i = 0; i < 200; i += 1) {
    const code = randomCode();
    if (used.has(code)) continue;
    const existing = await prisma.partnerCompany.findFirst({ where: { partnerCode: code }, select: { id: true } });
    if (!existing) {
      used.add(code);
      return code;
    }
  }
  throw new Error('Failed to generate unique partner code');
};

const ensureUniqueShowcaseSlug = async (seed: string, used: Set<string>) => {
  const normalized = slugify(seed);

  for (let i = 0; i < 200; i += 1) {
    const suffix = i === 0 ? '' : `-${i + 1}`;
    const slug = `${normalized}${suffix}`.slice(0, 50);
    if (used.has(slug)) continue;

    const [showcase, company] = await Promise.all([
      prisma.showcase.findUnique({ where: { slug }, select: { id: true } }),
      prisma.partnerCompany.findFirst({ where: { showcaseSlug: slug }, select: { id: true } })
    ]);

    if (!showcase && !company) {
      used.add(slug);
      return slug;
    }
  }

  throw new Error(`Failed to generate unique showcase slug for seed: ${seed}`);
};

async function main() {
  console.log(`[backfill_partner_roles_codes_showcases] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`);

  const requiredColumns: Array<[string, string]> = [
    ['PartnerCompany', 'partnerCode'],
    ['PartnerCompany', 'showcaseSlug'],
    ['PartnerUser', 'role']
  ];
  for (const [table, column] of requiredColumns) {
    const ok = await hasColumn(table, column);
    if (!ok) {
      console.log(`[backfill_partner_roles_codes_showcases] skip: missing column ${table}.${column}. Run prisma:migrate first.`);
      return;
    }
  }

  const partners = await prisma.partnerCompany.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      users: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!partners.length) {
    console.log('[backfill_partner_roles_codes_showcases] no partner companies found');
    return;
  }

  const usedCodes = new Set(
    (await prisma.partnerCompany.findMany({ where: { partnerCode: { not: null } }, select: { partnerCode: true } }))
      .map((x) => String(x.partnerCode || '').trim())
      .filter(Boolean)
  );

  const usedSlugs = new Set(
    (await prisma.showcase.findMany({ select: { slug: true } }))
      .map((x) => String(x.slug || '').trim())
      .filter(Boolean)
  );

  let updatedPartners = 0;
  let updatedUsers = 0;
  let upsertedShowcases = 0;

  for (const partner of partners) {
    const patch: Record<string, unknown> = {};

    const partnerCode = String(partner.partnerCode || '').trim();
    if (!partnerCode) {
      patch.partnerCode = await ensureUniquePartnerCode(usedCodes);
    } else {
      usedCodes.add(partnerCode);
    }

    const showcaseSlug = String(partner.showcaseSlug || '').trim();
    if (!showcaseSlug) {
      patch.showcaseSlug = await ensureUniqueShowcaseSlug(partner.name || partner.id, usedSlugs);
    } else {
      usedSlugs.add(showcaseSlug);
    }

    if (Object.keys(patch).length > 0) {
      updatedPartners += 1;
      console.log(`[partner] ${APPLY ? 'update' : 'would_update'} id=${partner.id} patch=${JSON.stringify(patch)}`);
      if (APPLY) {
        await prisma.partnerCompany.update({ where: { id: partner.id }, data: patch });
      }
    }

    const ownerUser = partner.users[0];
    if (ownerUser) {
      for (const user of partner.users) {
        const targetRole = user.id === ownerUser.id ? PartnerUserRole.OWNER : PartnerUserRole.AGENT;
        if (user.role !== targetRole) {
          updatedUsers += 1;
          console.log(`[partner-user] ${APPLY ? 'update' : 'would_update'} id=${user.id} role=${user.role} -> ${targetRole}`);
          if (APPLY) {
            await prisma.partnerUser.update({ where: { id: user.id }, data: { role: targetRole } });
          }
        }
      }
    }

    const finalShowcaseSlug = String((patch.showcaseSlug || partner.showcaseSlug || '')).trim();
    const workspaceId = String(partner.companyId || '').trim();

    if (workspaceId && finalShowcaseSlug) {
      const showcaseName = `Партнер: ${partner.name}`;
      const showcaseRules = {
        mode: 'FILTER',
        filters: {
          status: ['AVAILABLE']
        },
        partnerCompanyId: partner.id
      };

      upsertedShowcases += 1;
      console.log(`[showcase] ${APPLY ? 'upsert' : 'would_upsert'} slug=${finalShowcaseSlug} workspace=${workspaceId}`);
      if (APPLY) {
        await prisma.showcase.upsert({
          where: { slug: finalShowcaseSlug },
          create: {
            workspaceId,
            name: showcaseName,
            slug: finalShowcaseSlug,
            isPublic: true,
            rules: showcaseRules as any
          },
          update: {
            workspaceId,
            name: showcaseName,
            isPublic: true,
            rules: showcaseRules as any
          }
        });
      }
    } else {
      console.log(`[showcase] skip partner=${partner.id} reason=missing_workspace_or_slug`);
    }
  }

  console.log(
    `[backfill_partner_roles_codes_showcases] done partners=${partners.length} ` +
    `partners_changed=${updatedPartners} users_changed=${updatedUsers} showcases=${upsertedShowcases} mode=${APPLY ? 'APPLY' : 'DRY_RUN'}`
  );
}

main()
  .catch((error) => {
    console.error('[backfill_partner_roles_codes_showcases] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
