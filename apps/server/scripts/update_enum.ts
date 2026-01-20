
import { PrismaClient } from '@prisma/client';

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
