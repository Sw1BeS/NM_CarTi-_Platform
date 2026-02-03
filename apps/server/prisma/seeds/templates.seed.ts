/**
 * Seed Default Scenario Templates (Unified Pack)
 */

import { PrismaClient } from '@prisma/client';
import { SCENARIO_TEMPLATE_PACK } from './scenarioPack.js';

const prisma = new PrismaClient();

const DEFAULT_TEMPLATES = SCENARIO_TEMPLATE_PACK.map(t => ({
    ...t,
    isPublic: true
}));

async function seedTemplates() {
    console.log('🌱 Seeding default templates...');

    for (const template of DEFAULT_TEMPLATES) {
        try {
            await prisma.scenarioTemplate.upsert({
                where: { id: template.id },
                create: template,
                update: {
                    name: template.name,
                    category: template.category,
                    description: template.description,
                    structure: template.structure,
                    isPremium: template.isPremium
                }
            });

            console.log(`✅ Seeded: ${template.name}`);
        } catch (e) {
            console.error(`❌ Failed to seed ${template.name}:`, e);
        }
    }

    console.log('✨ Template seeding complete!');
}

seedTemplates()
    .then(() => prisma.$disconnect())
    .catch((e) => {
        console.error(e);
        prisma.$disconnect();
        process.exit(1);
    });
