import { PrismaClient } from '@prisma/client';
import { sanitizeB2bRequestTrackingPayload } from '../src/scripts/sanitize_b2b_request_tracking_event_source_url.helpers.js';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const apply = args.includes('--apply');

type CandidateRow = {
  id: string;
  payload: unknown;
};

const log = (message: string, meta?: unknown) => {
  if (meta === undefined) {
    console.log(`[cleanup:b2b-request-tracking-urls] ${message}`);
    return;
  }
  console.log(`[cleanup:b2b-request-tracking-urls] ${message} ${JSON.stringify(meta)}`);
};

const main = async () => {
  const rows = await prisma.$queryRaw<CandidateRow[]>`
    select id, payload
    from "B2bRequest"
    where payload::text ilike '%tgWebAppData%'
       or payload::text ilike '%initData%'
       or payload::text ilike '%init_data%'
       or payload::text ilike '%telegramInitData%'
       or payload::text ilike '%telegram_init_data%'
    order by "createdAt" asc
  `;

  const results = rows.map((row) => sanitizeB2bRequestTrackingPayload(row));
  const changed = results.filter((result) => result.changed);

  log(`mode=${apply ? 'APPLY' : 'DRY_RUN'}`);
  log(`candidates=${rows.length} changed=${changed.length}`);

  for (const result of changed) {
    log('change', {
      id: result.id,
      beforeUrlCount: result.beforeUrls.length,
      afterUrls: result.afterUrls
    });
  }

  if (!apply) {
    log('dry-run complete. Create a DB backup, review the preview, then rerun with --apply.');
    return;
  }

  for (const result of changed) {
    await prisma.b2bRequest.update({
      where: { id: result.id },
      data: { payload: result.payload as any }
    });
  }

  log(`updated=${changed.length}`);
};

main()
  .catch((error) => {
    console.error('[cleanup:b2b-request-tracking-urls] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
