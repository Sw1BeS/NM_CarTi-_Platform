import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isGroupChatId = (chatId?: string | null) => String(chatId || '').startsWith('-');

async function main() {
  const partners = await prisma.partnerCompany.findMany({
    where: {
      OR: [{ adminGroupChatId: null }, { adminGroupChatId: '' }]
    },
    select: { id: true, name: true, adminGroupChatId: true }
  });

  if (!partners.length) {
    console.log('No partners to backfill.');
    return;
  }

  let updated = 0;
  for (const partner of partners) {
    const request = await prisma.b2bRequest.findFirst({
      where: {
        requesterPartnerId: partner.id,
        chatId: { not: null }
      },
      orderBy: { createdAt: 'desc' },
      select: { chatId: true }
    });

    const candidate = request?.chatId || null;
    if (!isGroupChatId(candidate)) continue;

    await prisma.partnerCompany.update({
      where: { id: partner.id },
      data: { adminGroupChatId: candidate }
    });
    updated += 1;
    console.log(`Backfilled ${partner.name}: ${candidate}`);
  }

  console.log(`Done. Updated: ${updated}/${partners.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
