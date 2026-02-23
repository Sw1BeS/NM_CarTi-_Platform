import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const ttlArg = process.argv.find((arg) => arg.startsWith('--ttlDays='));
const ttlDaysRaw = ttlArg ? Number(ttlArg.split('=')[1]) : 14;
const ttlDays = Number.isFinite(ttlDaysRaw) && ttlDaysRaw > 0 ? Math.floor(ttlDaysRaw) : 14;

const BATCH_SIZE = 500;

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

async function main() {
  const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
  console.log(`[cleanup_external_hidden_listings] mode=${APPLY ? 'APPLY' : 'DRY_RUN'} ttlDays=${ttlDays} cutoff=${cutoff.toISOString()}`);

  const requiredColumns: Array<[string, string]> = [
    ['CarListing', 'external'],
    ['CarListing', 'status']
  ];
  for (const [table, column] of requiredColumns) {
    const ok = await hasColumn(table, column);
    if (!ok) {
      console.log(`[cleanup_external_hidden_listings] skip: missing column ${table}.${column}. Run prisma:migrate first.`);
      return;
    }
  }

  const candidates = await prisma.carListing.findMany({
    where: {
      external: true,
      status: 'HIDDEN',
      updatedAt: { lt: cutoff }
    },
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' }
  });

  if (!candidates.length) {
    console.log('[cleanup_external_hidden_listings] no candidates found');
    return;
  }

  console.log(`[cleanup_external_hidden_listings] candidates=${candidates.length}`);

  if (!APPLY) {
    const preview = candidates.slice(0, 20).map((x) => `${x.id}@${x.updatedAt.toISOString()}`);
    console.log('[cleanup_external_hidden_listings] sample:', preview.join(', '));
    return;
  }

  let deleted = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const ids = batch.map((x) => x.id);
    const result = await prisma.carListing.deleteMany({ where: { id: { in: ids } } });
    deleted += result.count;
    console.log(`[cleanup_external_hidden_listings] batch_deleted=${result.count} total_deleted=${deleted}`);
  }

  console.log(`[cleanup_external_hidden_listings] done deleted=${deleted}`);
}

main()
  .catch((error) => {
    console.error('[cleanup_external_hidden_listings] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
