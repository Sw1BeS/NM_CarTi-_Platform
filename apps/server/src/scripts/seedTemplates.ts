import { prisma } from '../services/prisma.js';
import { SCENARIO_TEMPLATE_PACK } from '../seeds/scenarioPack.js';

const TEMPLATES = SCENARIO_TEMPLATE_PACK.map(t => ({
    ...t,
    isPublic: true
}));

async function main() {
    console.log('🌱 Seeding Scenario Templates...');

    for (const t of TEMPLATES) {
        const existing = await prisma.scenarioTemplate.findUnique({ where: { id: t.id } });
        if (existing) {
            await prisma.scenarioTemplate.update({
                where: { id: t.id },
                data: t
            });
            console.log(`Updated template: ${t.name}`);
        } else {
            await prisma.scenarioTemplate.create({ data: t as any });
            console.log(`Created template: ${t.name}`);
        }
    }
    console.log('✅ Templates seeded successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
