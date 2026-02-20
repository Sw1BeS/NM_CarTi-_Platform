import { prisma } from '../services/prisma.js';
import { SCENARIO_TEMPLATE_PACK } from '../seeds/scenarioPack.js';

const args = process.argv.slice(2);
const companyArg = args.find(a => a.startsWith('--companyId='));
const companyId = companyArg ? companyArg.split('=')[1] : undefined;
const execute = args.includes('--execute');
const dryRun = !execute;

const scenarioIdMap: Record<string, string> = {
    tpl_buy_request: 'scn_buy',
    tpl_sell_tradein: 'scn_sell',
    tpl_lead_basic: 'scn_lead_basic',
    tpl_status_support: 'scn_support',
    tpl_lang_select: 'scn_lang'
};

const templateIds = SCENARIO_TEMPLATE_PACK.map(t => t.id);
const scenarioIds = SCENARIO_TEMPLATE_PACK.map(t => scenarioIdMap[t.id] || t.id.replace('tpl_', 'scn_'));

const log = (msg: string) => console.log(`[cleanupScenarios] ${msg}`);

const upsertTemplates = async () => {
    for (const tpl of SCENARIO_TEMPLATE_PACK) {
        await prisma.scenarioTemplate.upsert({
            where: { id: tpl.id },
            create: tpl as any,
            update: {
                name: tpl.name,
                category: tpl.category,
                description: tpl.description,
                structure: tpl.structure as any,
                isPremium: tpl.isPremium ?? false
            }
        });
    }
};

const attachTemplates = async (companyId: string) => {
    for (const tpl of SCENARIO_TEMPLATE_PACK) {
        await prisma.companyTemplate.upsert({
            where: { companyId_templateId: { companyId, templateId: tpl.id } },
            create: { companyId, templateId: tpl.id },
            update: {}
        });
    }
};

const upsertScenarios = async (companyId: string) => {
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
                companyId
            },
            update: {
                name: tpl.name,
                triggerCommand,
                keywords,
                isActive: true,
                status: 'PUBLISHED',
                entryNodeId,
                nodes,
                companyId
            }
        });
    }
};

const main = async () => {
    log(`Dry run: ${dryRun ? 'YES' : 'NO'} (use --execute for destructive mode)`);
    if (companyId) log(`Scope: companyId=${companyId}`);

    const companies = companyId
        ? [{ id: companyId }]
        : await prisma.workspace.findMany({ select: { id: true } });

    if (!companies.length) {
        log('No companies found. Exiting.');
        return;
    }

    if (dryRun) {
        const staleTemplates = await prisma.scenarioTemplate.count({
            where: { id: { notIn: templateIds } }
        });
        const staleCompanyTemplates = await prisma.companyTemplate.count({
            where: { templateId: { notIn: templateIds } }
        });
        const staleScenarios = await prisma.scenario.count({
            where: { companyId: { in: companies.map(c => c.id) }, id: { notIn: scenarioIds } }
        });
        log(`Stale scenario templates: ${staleTemplates}`);
        log(`Stale company templates: ${staleCompanyTemplates}`);
        log(`Stale scenarios: ${staleScenarios}`);
        return;
    }

    log('Upserting scenario templates...');
    await upsertTemplates();

    log('Deleting stale company templates...');
    await prisma.companyTemplate.deleteMany({
        where: { templateId: { notIn: templateIds } }
    });

    log('Deleting stale scenario templates...');
    await prisma.scenarioTemplate.deleteMany({
        where: { id: { notIn: templateIds } }
    });

    for (const company of companies) {
        log(`Cleaning scenarios for company ${company.id}`);
        await prisma.scenario.deleteMany({
            where: { companyId: company.id, id: { notIn: scenarioIds } }
        });
        await attachTemplates(company.id);
        await upsertScenarios(company.id);
    }

    log('Cleanup complete.');
};

main()
    .catch(err => {
        console.error(err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
