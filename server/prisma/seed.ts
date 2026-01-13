// @ts-ignore
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // 1. Create Admin
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@cartie.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hash,
        name: 'Super Admin',
        role: 'ADMIN',
      },
    });
    console.log('✅ Admin user created');
  } else {
    console.log('ℹ️ Admin user already exists');
  }

  // 2. Init System Settings
  const settingsCount = await prisma.systemSettings.count();
  if (settingsCount === 0) {
    await prisma.systemSettings.create({ data: {} });
    console.log('✅ System Settings initialized');
  }

  // 3. Init Generic Entities (Stage D/E)
  await seedEntities();

  console.log('🏁 Seed finished.');
}

async function seedEntities() {
  console.log('📦 Seeding Entity Definitions...');

  const definitions = [
    {
      slug: 'bot_session',
      name: 'Bot Session',
      fields: [
        { key: 'chatId', label: 'Chat ID', type: 'text', required: true },
        { key: 'botId', label: 'Bot ID', type: 'text', required: true },
        { key: 'platform', label: 'Platform', type: 'text' },
        { key: 'state', label: 'State', type: 'text' },
        { key: 'variables', label: 'Variables', type: 'json' },
        { key: 'history', label: 'History', type: 'json' },
        { key: 'lastActive', label: 'Last Active', type: 'datetime' },
        { key: 'messageCount', label: 'Msg Count', type: 'number' }
      ]
    },
    {
      slug: 'tg_message',
      name: 'Telegram Message',
      fields: [
        { key: 'messageId', label: 'Message ID', type: 'number' },
        { key: 'chatId', label: 'Chat ID', type: 'text' },
        { key: 'platform', label: 'Platform', type: 'text' },
        { key: 'direction', label: 'Direction', type: 'text' }, // INCOMING / OUTGOING
        { key: 'from', label: 'From', type: 'text' },
        { key: 'text', label: 'Text', type: 'text' },
        { key: 'date', label: 'Date', type: 'datetime' },
        { key: 'status', label: 'Status', type: 'text' }
      ]
    },
    {
      slug: 'tg_destination',
      name: 'Telegram Destination',
      fields: [
        { key: 'identifier', label: 'Chat ID', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' }, // USER / GROUP / CHANNEL
        { key: 'tags', label: 'Tags', type: 'multiselect' },
        { key: 'verified', label: 'Verified', type: 'boolean' }
      ]
    },
    {
      slug: 'tg_content',
      name: 'Telegram Content',
      fields: [
        { key: 'title', label: 'Title', type: 'text' },
        { key: 'body', label: 'Body', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' }, // POST / STORY
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'mediaUrls', label: 'Media', type: 'json' },
        { key: 'actions', label: 'Actions', type: 'json' },
        { key: 'scheduledAt', label: 'Scheduled At', type: 'datetime' },
        { key: 'postedAt', label: 'Posted At', type: 'datetime' }
      ]
    },
    {
      slug: 'tg_campaign',
      name: 'Telegram Campaign',
      fields: [
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'botId', label: 'Bot ID', type: 'text' },
        { key: 'content', label: 'Content', type: 'json' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'scheduledAt', label: 'Scheduled At', type: 'datetime' },
        { key: 'stats', label: 'Stats', type: 'json' },
        { key: 'targetAudience', label: 'Target', type: 'json' }
      ]
    },
    {
      slug: 'b2b_proposal',
      name: 'B2B Proposal',
      fields: [
        { key: 'requestId', label: 'Request ID', type: 'text', required: true },
        { key: 'dealerId', label: 'Dealer ID', type: 'text', required: true },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'offerPrice', label: 'Offer Price', type: 'number' },
        { key: 'comment', label: 'Comment', type: 'text' },
        { key: 'validUntil', label: 'Valid Until', type: 'datetime' }
      ]
    }
  ];

  for (const def of definitions) {
    const existing = await prisma.entityDefinition.findUnique({ where: { slug: def.slug } });
    if (!existing) {
      const created = await prisma.entityDefinition.create({
        data: {
          slug: def.slug,
          name: def.name,
          status: 'ACTIVE'
        }
      });

      await prisma.entityField.createMany({
        data: def.fields.map((f: any, idx: number) => ({
          entityId: created.id,
          key: f.key,
          label: f.label,
          type: f.type,
          required: !!f.required,
          order: idx
        }))
      });
      console.log(`   + Created ${def.slug}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
