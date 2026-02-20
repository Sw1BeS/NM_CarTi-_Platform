
import { PrismaClient } from '@prisma/client';

if (process.env.ALLOW_DEPRECATED !== '1') {
    console.error('[DEPRECATED] update_enum.ts is one-off migration helper. Set ALLOW_DEPRECATED=1 to run intentionally.');
    process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
    try {
        await prisma.$executeRawUnsafe(`ALTER TYPE "IntegrationType" ADD VALUE IF NOT EXISTS 'TELEGRAM_CHANNEL'`);
        console.log('Successfully added TELEGRAM_CHANNEL to IntegrationType enum');
    } catch (e) {
        console.error('Error updating enum:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
