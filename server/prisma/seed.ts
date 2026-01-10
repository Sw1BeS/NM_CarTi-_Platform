// @ts-ignore
import { PrismaClient, Role, BotType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // 1. Create Admin
  const adminEmail = 'admin@cartie.com';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  
  if (!existingAdmin) {
    const hash = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password: hash,
        name: 'Super Admin',
        role: Role.ADMIN,
      },
    });
    console.log('✅ Admin user created');
  } else {
    console.log('ℹ️ Admin user already exists');
  }

  // 2. Init Bot Configs
  const botTypes = [BotType.CLIENT_LEAD, BotType.CATALOG, BotType.B2B];
  
  for (const type of botTypes) {
    const existing = await prisma.botConfig.findUnique({ where: { type } });
    if (!existing) {
      await prisma.botConfig.create({
        data: {
          type,
          token: '',
          isEnabled: false
        }
      });
      console.log(`✅ Config for ${type} created`);
    }
  }

  // 3. Init System Settings
  const settingsCount = await prisma.systemSettings.count();
  if (settingsCount === 0) {
      await prisma.systemSettings.create({ data: {} });
      console.log('✅ System Settings initialized');
  }

  console.log('🏁 Seed finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });