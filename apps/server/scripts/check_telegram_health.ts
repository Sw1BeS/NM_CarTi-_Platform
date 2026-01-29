import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Checking Telegram Integration Health...\n");

    // 1. Bots
    const bots = await prisma.botConfig.findMany({ where: { isEnabled: true } });
    console.log(`🤖 Active Bots: ${bots.length}`);
    bots.forEach(b => {
        console.log(`   - ${b.name} (${b.deliveryMode}) | Channel: ${b.channelId || 'N/A'} | Admin: ${b.adminChatId || 'N/A'}`);
    });

    // 2. MTProto Connectors
    const connectors = await prisma.mTProtoConnector.findMany();
    console.log(`\n📡 MTProto Connectors: ${connectors.length}`);
    connectors.forEach(c => {
        const hasSession = !!c.sessionString;
        console.log(`   - ${c.name} | Status: ${c.status} | Session: ${hasSession ? '✅' : '❌'}`);
    });

    // 3. Channel Sources
    const sources = await prisma.channelSource.findMany();
    console.log(`\n📺 Channel Sources: ${sources.length}`);
    sources.forEach(s => {
        console.log(`   - ${s.title} | Last Sync: ${s.lastSyncedAt ? s.lastSyncedAt.toISOString() : 'Never'}`);
    });

    // 4. Data Stats
    const tgCars = await prisma.carListing.count({ where: { source: 'TELEGRAM' } });
    const tgLeads = await prisma.lead.count({ where: { source: { contains: 'Telegram', mode: 'insensitive' } } });

    console.log(`\n📊 Data Stats:`);
    console.log(`   - Imported Cars (TG): ${tgCars}`);
    console.log(`   - Telegram Leads: ${tgLeads}`);

    console.log("\n✅ Health Check Complete");
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
