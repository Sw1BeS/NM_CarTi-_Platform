import { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma.js';
import { logIntegrationEvent } from '../../services/integrationEventLog.service.js';
import { emitPlatformEvent } from '../Communication/telegram/core/events/eventEmitter.js';
import { logger } from '../../utils/logger.js';
import { recordOrchestrationActivity } from './activity.service.js';
import { orchestrationPolicyService } from './policy.service.js';

const summarizeSourceRefs = (refs: Array<any>) => {
  const base = refs.map((ref) => ({
    refType: ref.refType,
    label: ref.label,
    location: ref.location,
    trustLevel: ref.trustLevel,
    freshnessState: ref.freshnessState,
    rank: ref.rank
  }));

  return {
    all: base,
    internal: base.filter((ref) => ref.refType === 'INTERNAL_DOC'),
    official: base.filter((ref) => ref.refType === 'OFFICIAL_DOC'),
    external: base.filter((ref) => ref.refType === 'EXTERNAL_REFERENCE'),
    bestPractices: base.filter((ref) => ref.label.toLowerCase().includes('guide') || ref.label.toLowerCase().includes('best'))
  };
};

const deriveFreshnessState = (refs: Array<any>) => {
  if (refs.some((ref) => ref.freshnessState === 'REVIEW_REQUIRED')) return 'REVIEW_REQUIRED';
  if (refs.every((ref) => ref.freshnessState === 'FRESH')) return 'FRESH';
  return 'REVIEW';
};

const deriveRiskLevel = (sourceType: string, refs: Array<any>) => {
  if (refs.some((ref) => ref.trustLevel === 'LOW')) return 'MEDIUM';
  if (sourceType === 'DATA_SOURCE' || sourceType === 'REPO') return 'MEDIUM';
  return 'LOW';
};

const buildSuggestedPromptAdditions = (input: {
  sourceType: string;
  freshnessState: string;
  riskLevel: string;
  refs: Array<any>;
}) => {
  const additions = [
    'Preserve the original intent and avoid changing scope without saying so.',
    'State critical assumptions explicitly when requirements are ambiguous.',
    'Keep sources and recommendations traceable to the referenced materials.'
  ];

  if (input.sourceType === 'DATA_SOURCE') {
    additions.push('Do not write imported material into canonical records without review.');
    additions.push('Summarize provenance and recommended next actions separately from curated facts.');
  }

  if (input.refs.some((ref) => ref.refType === 'OFFICIAL_DOC')) {
    additions.push('Prefer official documentation when choosing APIs, tools, or runtime behavior.');
  }

  if (input.riskLevel !== 'LOW') {
    additions.push('Highlight operational and audit risks before proposing automation.');
  }

  if (input.freshnessState !== 'FRESH') {
    additions.push('Call out where source freshness should be rechecked before execution.');
  }

  return additions;
};

const buildSuggestedTools = (sourceType: string, refs: Array<any>) => {
  const tools = new Set<string>(['skill_pack_refresh']);
  if (sourceType === 'DATA_SOURCE') {
    tools.add('import_analysis');
    tools.add('review_queue');
  }
  if (sourceType === 'REPO' || refs.some((ref) => ref.location.includes('github.com'))) {
    tools.add('repo_watch');
  }
  if (refs.some((ref) => ref.location.includes('openai.com'))) {
    tools.add('official_doc_lookup');
  }
  return Array.from(tools.values());
};

class SkillPackService {
  async buildForIntake(input: {
    companyId: string;
    intakeId: string;
    createdBy?: string | null;
    triggerSource?: string;
  }) {
    const { policy } = await orchestrationPolicyService.ensureBaseSetup(input.companyId);

    const intake = await prisma.automationIntake.findFirst({
      where: { id: input.intakeId, companyId: input.companyId },
      include: {
        sourceRefs: { orderBy: { rank: 'asc' } }
      }
    });

    if (!intake) {
      throw new Error('Automation intake not found');
    }

    const refs = intake.sourceRefs || [];
    const summarized = summarizeSourceRefs(refs);
    const freshnessState = deriveFreshnessState(refs);
    const riskLevel = deriveRiskLevel(intake.sourceType, refs);
    const suggestedPromptAdditions = buildSuggestedPromptAdditions({
      sourceType: intake.sourceType,
      freshnessState,
      riskLevel,
      refs
    });
    const suggestedTools = buildSuggestedTools(intake.sourceType, refs);

    const taskContext = {
      title: intake.title || null,
      sourceType: intake.sourceType,
      classification: intake.classification || null,
      inputSummary: String(intake.inputText || '').slice(0, 500) || null,
      sourceUrl: intake.sourceUrl || null
    } satisfies Prisma.InputJsonValue;

    const operatorNotes = [
      policy.autoCanonicalWrite ? null : 'Canonical DB writes remain review-gated.',
      refs.some((ref) => ref.trustLevel === 'LOW') ? 'Low-trust external references are informational only.' : null,
      freshnessState !== 'FRESH' ? 'At least one source should be freshness-checked before downstream execution.' : null
    ].filter(Boolean).join(' ');

    const pack = await prisma.automationSkillPack.create({
      data: {
        companyId: input.companyId,
        intakeId: intake.id,
        status: 'ACTIVE',
        taskContext,
        relatedEntities: intake.relatedEntities ?? Prisma.JsonNull,
        sourcesUsed: summarized.all as Prisma.InputJsonValue,
        internalDocsUsed: summarized.internal as Prisma.InputJsonValue,
        officialDocsUsed: summarized.official as Prisma.InputJsonValue,
        externalReferencesUsed: summarized.external as Prisma.InputJsonValue,
        bestPracticesUsed: summarized.bestPractices as Prisma.InputJsonValue,
        freshnessState,
        riskLevel,
        suggestedPromptAdditions: suggestedPromptAdditions as Prisma.InputJsonValue,
        suggestedTools,
        operatorNotes: operatorNotes || null
      }
    });

    const run = await prisma.automationRun.create({
      data: {
        companyId: input.companyId,
        intakeId: intake.id,
        skillPackId: pack.id,
        runType: 'SKILL_PACK_BUILD',
        status: 'COMPLETED',
        triggerSource: input.triggerSource || 'INTAKE_CREATE',
        createdBy: input.createdBy || null,
        result: {
          freshnessState,
          riskLevel,
          sourceCount: refs.length
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
        completedAt: new Date()
      }
    });

    await prisma.automationRunStep.createMany({
      data: [
        {
          runId: run.id,
          stepKey: 'source_resolution',
          status: 'COMPLETED',
          sequence: 1,
          message: `Resolved ${refs.length} source references`,
          details: { sourceCount: refs.length } as Prisma.InputJsonValue,
          startedAt: new Date(),
          completedAt: new Date()
        },
        {
          runId: run.id,
          stepKey: 'risk_assessment',
          status: 'COMPLETED',
          sequence: 2,
          message: `Risk=${riskLevel} Freshness=${freshnessState}`,
          details: { riskLevel, freshnessState } as Prisma.InputJsonValue,
          startedAt: new Date(),
          completedAt: new Date()
        },
        {
          runId: run.id,
          stepKey: 'pack_generated',
          status: 'COMPLETED',
          sequence: 3,
          message: 'Skill pack generated',
          details: { skillPackId: pack.id } as Prisma.InputJsonValue,
          startedAt: new Date(),
          completedAt: new Date()
        }
      ]
    });

    await emitPlatformEvent({
      companyId: input.companyId,
      userId: input.createdBy || null,
      eventType: 'orchestration.skill_pack.generated',
      payload: {
        intakeId: intake.id,
        skillPackId: pack.id,
        sourceType: intake.sourceType,
        freshnessState,
        riskLevel
      }
    });

    await logIntegrationEvent({
      companyId: input.companyId,
      integration: 'ORCHESTRATION',
      entityId: pack.id,
      action: 'skill_pack.generated',
      status: 'OK',
      meta: {
        entityType: 'AutomationSkillPack',
        intakeId: intake.id,
        sourceType: intake.sourceType,
        freshnessState,
        riskLevel
      }
    });

    await recordOrchestrationActivity({
      id: pack.id,
      action: 'Skill Pack Generated',
      details: `${intake.title || intake.sourceType} | ${freshnessState} freshness | ${riskLevel} risk`,
      entityType: 'ORCHESTRATION',
      entityId: pack.id,
      userId: input.createdBy || null
    });

    return prisma.automationSkillPack.findUnique({
      where: { id: pack.id },
      include: {
        intake: true,
        runs: { orderBy: { createdAt: 'desc' }, take: 3 }
      }
    });
  }

  async refreshStaleSkillPacks() {
    const staleCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const staleIntakes = await prisma.automationIntake.findMany({
      where: {
        status: 'ACTIVE',
        skillPacks: {
          none: {
            generatedAt: { gte: staleCutoff }
          }
        }
      },
      select: {
        id: true,
        companyId: true
      },
      take: 5
    });

    const results = [];
    for (const intake of staleIntakes) {
      try {
        const pack = await this.buildForIntake({
          companyId: intake.companyId,
          intakeId: intake.id,
          triggerSource: 'SCHEDULER'
        });
        results.push({ intakeId: intake.id, skillPackId: pack?.id || null });
      } catch (error: any) {
        logger.warn('[SkillPackService] Failed to refresh stale skill pack', {
          intakeId: intake.id,
          message: error?.message || String(error)
        });
      }
    }

    return results;
  }
}

export const skillPackService = new SkillPackService();
