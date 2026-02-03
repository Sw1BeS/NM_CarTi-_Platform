/**
 * Production Bot Scenario Seeds (Unified)
 */

import { PrismaClient } from '@prisma/client';
import { SCENARIO_TEMPLATE_PACK } from './scenarioPack.js';

const prisma = new PrismaClient();

export const PRODUCTION_SCENARIOS = SCENARIO_TEMPLATE_PACK.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    isPremium: s.isPremium ?? false,
    structure: s.structure
}));

export async function seedProductionScenarios() {
    console.log('🎭 Seeding production scenarios...');

    for (const scenario of PRODUCTION_SCENARIOS) {
        await prisma.scenarioTemplate.upsert({
            where: { id: scenario.id },
            create: scenario as any,
            update: {
                name: scenario.name,
                category: scenario.category as any,
                description: scenario.description,
                structure: scenario.structure as any,
                isPremium: scenario.isPremium,

            }
        });
        console.log(`   ✅ ${scenario.name}`);
    }

    console.log('✅ Production scenarios seeded');
}
