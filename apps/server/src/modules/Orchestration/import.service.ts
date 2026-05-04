import { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma.js';
import { logIntegrationEvent } from '../../services/integrationEventLog.service.js';
import { emitPlatformEvent } from '../Communication/telegram/core/events/eventEmitter.js';
import { logger } from '../../utils/logger.js';
import { recordOrchestrationActivity } from './activity.service.js';
import { normalizeHumanText } from './text.utils.js';

const classifyImportItem = (item: {
  sourceUrl?: string | null;
  mimeType?: string | null;
  title?: string | null;
  contentText?: string | null;
}) => {
  const normalized = normalizeHumanText([item.title, item.contentText, item.sourceUrl].filter(Boolean).join(' '));
  let kind = 'DOCUMENT';
  let confidence = 0.55;

  if (/github\.com/i.test(String(item.sourceUrl || ''))) {
    kind = 'REPOSITORY';
    confidence = 0.92;
  } else if (/prompt|promt|промт|промпт/.test(normalized)) {
    kind = 'PROMPT_MATERIAL';
    confidence = 0.88;
  } else if (/digest|news|brief|summary/.test(normalized)) {
    kind = 'DIGEST_SOURCE';
    confidence = 0.82;
  } else if (/archive|export|log|history|conversation|chat/.test(normalized)) {
    kind = 'ARCHIVE';
    confidence = 0.79;
  } else if (/video|movie|scene|clip|tiktok/.test(normalized)) {
    kind = 'MEDIA_REFERENCE';
    confidence = 0.76;
  } else if (/vps|hosting|server|cloud/.test(normalized)) {
    kind = 'SERVICE_REFERENCE';
    confidence = 0.74;
  }

  return {
    kind,
    confidence,
    normalized
  };
};

const buildRecommendedActions = (classification: { kind: string; confidence: number }) => {
  if (classification.kind === 'PROMPT_MATERIAL') {
    return [
      { actionType: 'BUILD_SKILL_PACK', priority: 'HIGH', reason: 'Prompt-related material should feed the prompt refinement flow.' },
      { actionType: 'QUEUE_PROMPT_REVIEW', priority: 'MEDIUM', reason: 'The content likely benefits from prompt normalization before downstream use.' }
    ];
  }

  if (classification.kind === 'REPOSITORY') {
    return [
      { actionType: 'WATCH_REPOSITORY', priority: 'MEDIUM', reason: 'Repository material can be turned into a watched-repo candidate.' }
    ];
  }

  if (classification.kind === 'DIGEST_SOURCE') {
    return [
      { actionType: 'ADD_DIGEST_SOURCE', priority: 'MEDIUM', reason: 'The item reads like a candidate for the digest/watch system.' }
    ];
  }

  if (classification.kind === 'ARCHIVE') {
    return [
      { actionType: 'REVIEW_FOR_TIMELINE', priority: 'HIGH', reason: 'Archived material is suitable for staged project memory enrichment.' }
    ];
  }

  return [
    { actionType: 'REVIEW_AND_ROUTE', priority: 'MEDIUM', reason: 'The item should be reviewed before routing into a specialized workflow.' }
  ];
};

class ImportService {
  async registerImport(input: {
    companyId: string;
    intakeId?: string | null;
    name: string;
    sourceType: string;
    sourceUri?: string | null;
    contentType?: string | null;
    description?: string | null;
    metadata?: Prisma.InputJsonValue | null;
    rawPayload?: Prisma.InputJsonValue | null;
    items?: Array<{
      externalId?: string;
      sourceUrl?: string;
      mimeType?: string;
      title?: string;
      contentText?: string;
      rawPayload?: Prisma.InputJsonValue | null;
    }>;
  }) {
    const items = Array.isArray(input.items) ? input.items : [];

    const result = await prisma.$transaction(async (tx) => {
      const source = await tx.importSource.create({
        data: {
          companyId: input.companyId,
          intakeId: input.intakeId || null,
          name: input.name,
          sourceType: input.sourceType,
          sourceUri: input.sourceUri || null,
          contentType: input.contentType || null,
          description: input.description || null,
          metadata: input.metadata ?? Prisma.JsonNull
        }
      });

      const batch = await tx.importBatch.create({
        data: {
          companyId: input.companyId,
          importSourceId: source.id,
          status: 'REGISTERED',
          batchLabel: `${input.sourceType.toLowerCase()}-${new Date().toISOString()}`,
          itemCount: items.length,
          rawPayload: input.rawPayload ?? Prisma.JsonNull
        }
      });

      if (items.length > 0) {
        await tx.importItem.createMany({
          data: items.map((item) => ({
            companyId: input.companyId,
            importBatchId: batch.id,
            externalId: item.externalId || null,
            sourceUrl: item.sourceUrl || null,
            mimeType: item.mimeType || null,
            title: item.title || null,
            contentText: item.contentText || null,
            rawPayload: item.rawPayload ?? Prisma.JsonNull
          }))
        });
      }

      return { source, batch };
    });

    await logIntegrationEvent({
      companyId: input.companyId,
      integration: 'ORCHESTRATION',
      entityId: result.batch.id,
      action: 'import.registered',
      status: 'OK',
      meta: {
        entityType: 'ImportBatch',
        importSourceId: result.source.id,
        itemCount: items.length
      }
    });

    await recordOrchestrationActivity({
      id: result.batch.id,
      action: 'Import Registered',
      details: `${input.name} | ${items.length} staged item(s)`,
      entityType: 'ORCHESTRATION',
      entityId: result.batch.id
    });

    return {
      source: result.source,
      batch: await prisma.importBatch.findUnique({
        where: { id: result.batch.id },
        include: { items: true }
      })
    };
  }

  async processPendingBatches(limit = 3) {
    const pendingBatches = await prisma.importBatch.findMany({
      where: {
        status: { in: ['REGISTERED', 'ANALYZING'] }
      },
      include: {
        importSource: true,
        items: true
      },
      orderBy: { createdAt: 'asc' },
      take: limit
    });

    const processed = [];

    for (const batch of pendingBatches) {
      try {
        await prisma.importBatch.update({
          where: { id: batch.id },
          data: {
            status: 'ANALYZING',
            startedAt: new Date()
          }
        });

        const classificationSummary: Record<string, number> = {};
        for (const item of batch.items) {
          const classification = classifyImportItem(item);
          classificationSummary[classification.kind] = (classificationSummary[classification.kind] || 0) + 1;

          await prisma.importItem.update({
            where: { id: item.id },
            data: {
              classification: classification as Prisma.InputJsonValue,
              status: 'ANALYZED'
            }
          });

          await prisma.importLinkageCandidate.create({
            data: {
              companyId: batch.companyId,
              importBatchId: batch.id,
              importItemId: item.id,
              targetType: classification.kind === 'REPOSITORY' ? 'WATCHED_REPO' : 'AUTOMATION_INTAKE',
              confidence: classification.confidence,
              reason: `Classified as ${classification.kind}`,
              payload: classification as Prisma.InputJsonValue,
              status: 'PROPOSED'
            }
          });

          const actions = buildRecommendedActions(classification);
          if (actions.length > 0) {
            await prisma.importRecommendedAction.createMany({
              data: actions.map((action) => ({
                companyId: batch.companyId,
                importBatchId: batch.id,
                importItemId: item.id,
                actionType: action.actionType,
                priority: action.priority,
                reason: action.reason,
                status: 'PROPOSED'
              }))
            });
          }
        }

        const summaryPayload = {
          classifications: classificationSummary,
          itemCount: batch.items.length,
          sourceType: batch.importSource.sourceType
        } satisfies Prisma.InputJsonValue;

        await prisma.importBatch.update({
          where: { id: batch.id },
          data: {
            status: 'REVIEW_REQUIRED',
            analysisSummary: summaryPayload,
            finishedAt: new Date()
          }
        });

        await prisma.importSource.update({
          where: { id: batch.importSourceId },
          data: {
            status: 'REVIEW_REQUIRED',
            analyzedAt: new Date()
          }
        });

        await prisma.automationReviewQueue.create({
          data: {
            companyId: batch.companyId,
            queueType: 'IMPORT_REVIEW',
            status: 'PENDING',
            title: `Review import batch ${batch.id.slice(0, 8)}`,
            summary: `${batch.items.length} item(s) analyzed and awaiting routing review.`,
            payload: summaryPayload,
            importBatchId: batch.id,
            intakeId: batch.importSource.intakeId || null
          }
        });

        await emitPlatformEvent({
          companyId: batch.companyId,
          eventType: 'orchestration.import.analysis.completed',
          payload: {
            importBatchId: batch.id,
            itemCount: batch.items.length,
            classifications: classificationSummary
          }
        });

        await logIntegrationEvent({
          companyId: batch.companyId,
          integration: 'ORCHESTRATION',
          entityId: batch.id,
          action: 'import.analysis.completed',
          status: 'OK',
          meta: {
            entityType: 'ImportBatch',
            itemCount: batch.items.length,
            classifications: classificationSummary
          }
        });

        await recordOrchestrationActivity({
          id: batch.id,
          action: 'Import Analysis Completed',
          details: `${batch.items.length} item(s) classified and moved to review`,
          entityType: 'ORCHESTRATION',
          entityId: batch.id
        });

        processed.push({
          batchId: batch.id,
          itemCount: batch.items.length,
          classifications: classificationSummary
        });
      } catch (error: any) {
        logger.warn('[ImportService] Failed to process batch', {
          batchId: batch.id,
          message: error?.message || String(error)
        });
      }
    }

    return processed;
  }
}

export const importService = new ImportService();
