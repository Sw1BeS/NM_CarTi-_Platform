import { NormalizationType } from '@prisma/client';
import { prisma } from '../../services/prisma.js';

const DEFAULT_INTENT_ALIASES = [
  { alias: 'prompt', canonical: 'prompt' },
  { alias: 'promt', canonical: 'prompt' },
  { alias: 'промт', canonical: 'prompt' },
  { alias: 'промпт', canonical: 'prompt' }
];

class OrchestrationPolicyService {
  async ensureDefaultPolicy(companyId: string) {
    return prisma.orchestrationPolicy.upsert({
      where: { companyId },
      update: {},
      create: {
        companyId,
        internalDocsPreferred: true,
        officialDocsPreferred: true,
        externalRefsMode: 'SUPPLEMENTAL_ONLY',
        autoCanonicalWrite: false,
        promptRefinementEnabled: true,
        councilRequiresManualTrigger: true,
        maxFreshSkillPackAgeHours: 72
      }
    });
  }

  async ensurePromptIntentAliases(companyId: string) {
    const existing = await prisma.normalizationAlias.findMany({
      where: {
        companyId,
        type: NormalizationType.intent
      },
      select: { alias: true }
    });
    const existingSet = new Set(existing.map((item) => item.alias));
    const missing = DEFAULT_INTENT_ALIASES.filter((item) => !existingSet.has(item.alias));

    if (missing.length > 0) {
      await prisma.normalizationAlias.createMany({
        data: missing.map((item) => ({
          companyId,
          type: NormalizationType.intent,
          alias: item.alias,
          canonical: item.canonical
        })),
        skipDuplicates: true
      });
    }

    return prisma.normalizationAlias.findMany({
      where: {
        companyId,
        type: NormalizationType.intent
      },
      orderBy: { alias: 'asc' }
    });
  }

  async ensureBaseSetup(companyId: string) {
    const [policy, aliases] = await Promise.all([
      this.ensureDefaultPolicy(companyId),
      this.ensurePromptIntentAliases(companyId)
    ]);

    return { policy, aliases };
  }
}

export const orchestrationPolicyService = new OrchestrationPolicyService();
