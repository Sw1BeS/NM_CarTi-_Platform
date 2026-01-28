
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Showcase...');

  // 1. Get default workspace
  let workspace = await prisma.workspace.findUnique({ where: { slug: 'system' } });
  if (!workspace) {
    workspace = await prisma.workspace.findFirst();
  }

  if (!workspace) {
    console.error('❌ No workspace found. Cannot seed Showcase.');
    return;
  }

  // 2. Check/Create 'system' Showcase
  const systemSlug = 'system';
  const existing = await prisma.showcase.findUnique({ where: { slug: systemSlug } });

  if (!existing) {
    await prisma.showcase.create({
      data: {
        workspaceId: workspace.id,
        name: 'System Default',
        slug: systemSlug,
        isPublic: true,
        rules: { mode: 'FILTER', filters: { status: ['AVAILABLE'] } }, // Default rule
      }
    });
    console.log(`✅ Created default Showcase: ${systemSlug}`);
  } else {
    console.log(`ℹ️ Showcase '${systemSlug}' already exists.`);
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
