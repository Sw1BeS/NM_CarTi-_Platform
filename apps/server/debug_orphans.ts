
import { prisma } from './src/services/prisma';

async function checkAndClean() {
    try {
        const workspaces = await prisma.workspace.findMany();
        const workspaceIds = new Set(workspaces.map(w => w.id));
        console.log(`Found ${workspaces.length} workspaces.`);

        // List of models to check that have 'companyId'
        // Note: TypeScript might complain if models don't exist in client yet?
        // But they DO exist in the client I'm running (because I haven't generated new one properly yet? NO, I haven't).
        // Actually, if 'Company' is gone, 'Integration' and 'BotConfig' still exist in DB.
        // The previous run confirmed 'Integration' exists.

        // Helper to clean
        const clean = async (modelName: string, prismaModel: any) => {
            try {
                console.log(`Checking ${modelName}...`);
                const records = await prismaModel.findMany({ select: { id: true, companyId: true } });
                const orphans = records.filter((r: any) => r.companyId && !workspaceIds.has(r.companyId));

                if (orphans.length > 0) {
                    console.log(`Found ${orphans.length} orphans in ${modelName}. Deleting...`);
                    await prismaModel.deleteMany({
                        where: { id: { in: orphans.map((o: any) => o.id) } }
                    });
                    console.log(`Cleaned ${modelName}.`);
                } else {
                    console.log(`${modelName} is clean.`);
                }
            } catch (e: any) {
                console.log(`Skipping ${modelName}:`, e.message?.split('\n')[0]);
            }
        };

        await clean('BotConfig', prisma.botConfig);
        await clean('Scenario', prisma.scenario);
        await clean('CompanyTemplate', prisma.companyTemplate);
        await clean('PartnerCompany', prisma.partnerCompany);
        await clean('PartnerUser', prisma.partnerUser);
        await clean('NormalizationAlias', prisma.normalizationAlias);
        await clean('PlatformEvent', prisma.platformEvent);
        await clean('Lead', prisma.lead);
        await clean('Draft', prisma.draft);

    } catch (e) {
        console.error(e);
    }
}

checkAndClean();
