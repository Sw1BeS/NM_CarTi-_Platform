/**
 * Seed Bot Scenarios from Unified Template Pack
 */

import { PrismaClient } from '@prisma/client';
import { SCENARIO_TEMPLATE_PACK } from '../../src/seeds/scenarioPack.js';

const prisma = new PrismaClient();

const scenarioIdMap: Record<string, string> = {
    tpl_buy_request: 'scn_buy',
    tpl_sell_tradein: 'scn_sell',
    tpl_status_support: 'scn_support',
    tpl_lang_select: 'scn_lang'
};

export async function seedScenarios(companyId: string, botId?: string) {
    console.log('🤖 Seeding bot scenarios (unified pack)...');

    for (const tpl of SCENARIO_TEMPLATE_PACK) {
        const structure: any = tpl.structure || {};
        const nodes = Array.isArray(structure.nodes) ? structure.nodes : [];
        const entryNodeId = structure.entryNodeId || nodes[0]?.id || 'start';
        const triggerCommand = structure.triggerCommand || tpl.name?.toLowerCase()?.replace(/\s+/g, '_');
        const keywords = Array.isArray(structure.keywords) ? structure.keywords : [];
        const scenarioId = scenarioIdMap[tpl.id] || tpl.id.replace('tpl_', 'scn_');

        await prisma.scenario.upsert({
            where: { id: scenarioId },
            create: {
                id: scenarioId,
                name: tpl.name,
                triggerCommand,
                keywords,
                isActive: true,
                status: 'PUBLISHED',
                entryNodeId,
                nodes,
                companyId,
                ...(botId ? { botId } : {})
            },
            update: {
                name: tpl.name,
                triggerCommand,
                keywords,
                isActive: true,
                status: 'PUBLISHED',
                entryNodeId,
                nodes,
                companyId,
                ...(botId ? { botId } : {})
            }
        });
    }

    console.log('✅ Bot scenarios seeded successfully');
}

// CLI entry point
async function main() {
    const companyId = process.argv[2] || 'company_system';
    const botId = process.argv[3];

    await seedScenarios(companyId, botId);
    await prisma.$disconnect();
}

main().catch(e => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
});
