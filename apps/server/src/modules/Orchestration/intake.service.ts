import { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma.js';
import { buildRankedSourceRefs } from './catalog.js';
import { normalizeHumanText } from './text.utils.js';
import { orchestrationPolicyService } from './policy.service.js';

const inferSourceType = (input: {
  sourceType?: string | null;
  sourceUrl?: string | null;
  inputText?: string | null;
  itemCount?: number;
}) => {
  if (input.sourceType) return String(input.sourceType).toUpperCase();
  if ((input.itemCount || 0) > 0) return 'DATA_SOURCE';

  const rawUrl = String(input.sourceUrl || '').trim();
  if (rawUrl) {
    if (/github\.com/i.test(rawUrl)) return 'REPO';
    if (/developers\.openai\.com|platform\.openai\.com/i.test(rawUrl)) return 'DOC_LINK';
    if (/\.(md|pdf|docx?|txt)(\?|#|$)/i.test(rawUrl)) return 'DOC_LINK';
    return 'LINK';
  }

  return 'TASK';
};

class AutomationIntakeService {
  async createIntake(input: {
    companyId: string;
    createdBy?: string | null;
    sourceType?: string | null;
    title?: string | null;
    inputText?: string | null;
    sourceUrl?: string | null;
    relatedEntities?: Prisma.InputJsonValue | null;
    metadata?: Prisma.InputJsonValue | null;
    itemCount?: number;
  }) {
    await orchestrationPolicyService.ensureBaseSetup(input.companyId);

    const sourceType = inferSourceType(input);
    const normalizedText = normalizeHumanText(
      [input.title, input.inputText, input.sourceUrl].filter(Boolean).join(' ')
    );
    const classification = sourceType === 'TASK' ? 'TASK_INTAKE' : `${sourceType}_INTAKE`;

    const intake = await prisma.automationIntake.create({
      data: {
        companyId: input.companyId,
        sourceType,
        title: input.title || null,
        inputText: input.inputText || null,
        sourceUrl: input.sourceUrl || null,
        normalizedText: normalizedText || null,
        classification,
        relatedEntities: input.relatedEntities ?? Prisma.JsonNull,
        metadata: input.metadata ?? Prisma.JsonNull,
        createdBy: input.createdBy || null
      }
    });

    const refs = buildRankedSourceRefs({
      sourceType,
      title: input.title,
      inputText: input.inputText,
      sourceUrl: input.sourceUrl
    });

    if (refs.length > 0) {
      await prisma.automationSourceRef.createMany({
        data: refs.map((ref) => ({
          companyId: input.companyId,
          intakeId: intake.id,
          refType: ref.refType,
          label: ref.label,
          location: ref.location,
          trustLevel: ref.trustLevel,
          freshnessState: ref.freshnessState,
          rank: ref.rank,
          metadata: ref.metadata ? (ref.metadata as Prisma.InputJsonValue) : Prisma.JsonNull
        }))
      });
    }

    return this.getIntakeById(input.companyId, intake.id);
  }

  async getIntakeById(companyId: string, intakeId: string) {
    return prisma.automationIntake.findFirst({
      where: { id: intakeId, companyId },
      include: {
        sourceRefs: { orderBy: { rank: 'asc' } },
        skillPacks: { orderBy: { generatedAt: 'desc' }, take: 1 },
        runs: { orderBy: { createdAt: 'desc' }, take: 5 }
      }
    });
  }

  async listIntakes(input: {
    companyId: string;
    limit?: number;
    status?: string;
    sourceType?: string;
  }) {
    const limit = Math.min(100, Math.max(1, input.limit || 20));
    return prisma.automationIntake.findMany({
      where: {
        companyId: input.companyId,
        status: input.status || undefined,
        sourceType: input.sourceType || undefined
      },
      include: {
        skillPacks: { orderBy: { generatedAt: 'desc' }, take: 1 },
        sourceRefs: { orderBy: { rank: 'asc' }, take: 5 }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}

export const automationIntakeService = new AutomationIntakeService();
