import { Prisma } from '@prisma/client';
import { prisma } from '../../services/prisma.js';
import { logIntegrationEvent } from '../../services/integrationEventLog.service.js';
import { emitPlatformEvent } from '../Communication/telegram/core/events/eventEmitter.js';
import { recordOrchestrationActivity } from './activity.service.js';
import { orchestrationPolicyService } from './policy.service.js';
import { normalizeHumanText, tokenizeHumanText } from './text.utils.js';

const buildPromptRefinement = (text: string) => {
  const original = String(text || '').trim();
  const normalized = original.replace(/^\s*(prompt|promt|промт|промпт)\s*[:\-]?\s*/i, '').trim() || original;

  return [
    'Task:',
    normalized,
    '',
    'Constraints:',
    '- Preserve the user intent.',
    '- Clarify assumptions only when necessary.',
    '- Keep the request scoped and explicit.',
    '',
    'Desired output:',
    '- Return a high quality result with a clear structure.',
    '- Call out assumptions or missing inputs separately if they affect execution.',
    '',
    'Quality bar:',
    '- Prefer source-aware, auditable recommendations when factual claims are involved.'
  ].join('\n');
};

class PromptIntentService {
  async detect(companyId: string, text?: string | null) {
    const normalized = normalizeHumanText(text);
    const tokens = new Set(tokenizeHumanText(text));
    await orchestrationPolicyService.ensureBaseSetup(companyId);

    const aliases = await prisma.normalizationAlias.findMany({
      where: {
        companyId,
        type: 'intent'
      },
      orderBy: { alias: 'asc' }
    });

    const matched = aliases.filter((alias) => {
      const aliasNormalized = normalizeHumanText(alias.alias);
      return tokens.has(aliasNormalized) || normalized.split(' ').includes(aliasNormalized);
    });

    return {
      matched: matched.length > 0,
      matchedAliases: matched.map((alias) => alias.alias),
      canonical: matched[0]?.canonical || null,
      normalized
    };
  }

  async review(input: {
    companyId: string;
    text: string;
    intakeId?: string | null;
    skillPackId?: string | null;
    createdBy?: string | null;
    explanationRequested?: boolean;
    triggerSource?: string;
  }) {
    const detection = await this.detect(input.companyId, input.text);
    if (!detection.matched) {
      return {
        matched: false,
        matchedAliases: [],
        beforeText: input.text,
        afterText: input.text,
        explanation: null
      };
    }

    const beforeText = String(input.text || '');
    const afterText = buildPromptRefinement(beforeText);
    const explanation = input.explanationRequested
      ? 'The request looked like prompt work, so it was normalized into a clearer task/constraints/output format without changing the original intent.'
      : null;

    const run = await prisma.automationRun.create({
      data: {
        companyId: input.companyId,
        intakeId: input.intakeId || null,
        skillPackId: input.skillPackId || null,
        runType: 'PROMPT_REVIEW',
        status: 'COMPLETED',
        triggerSource: input.triggerSource || 'PROMPT_REVIEW',
        beforeText,
        afterText,
        matchedAliases: detection.matchedAliases,
        explanation,
        createdBy: input.createdBy || null,
        result: {
          canonical: detection.canonical,
          normalized: detection.normalized
        } as Prisma.InputJsonValue,
        startedAt: new Date(),
        completedAt: new Date()
      }
    });

    await prisma.automationRunStep.createMany({
      data: [
        {
          runId: run.id,
          stepKey: 'normalize_input',
          status: 'COMPLETED',
          sequence: 1,
          message: 'Normalized prompt-intent text',
          details: { normalized: detection.normalized } as Prisma.InputJsonValue,
          startedAt: new Date(),
          completedAt: new Date()
        },
        {
          runId: run.id,
          stepKey: 'match_aliases',
          status: 'COMPLETED',
          sequence: 2,
          message: `Matched aliases: ${detection.matchedAliases.join(', ')}`,
          details: { aliases: detection.matchedAliases } as Prisma.InputJsonValue,
          startedAt: new Date(),
          completedAt: new Date()
        },
        {
          runId: run.id,
          stepKey: 'prompt_refined',
          status: 'COMPLETED',
          sequence: 3,
          message: 'Built a non-destructive prompt refinement',
          details: { changed: beforeText !== afterText } as Prisma.InputJsonValue,
          startedAt: new Date(),
          completedAt: new Date()
        }
      ]
    });

    if (input.intakeId) {
      await prisma.automationIntake.update({
        where: { id: input.intakeId },
        data: {
          classification: 'PROMPT_REQUEST'
        }
      }).catch(() => undefined);
    }

    await emitPlatformEvent({
      companyId: input.companyId,
      userId: input.createdBy || null,
      eventType: 'orchestration.prompt_review.completed',
      payload: {
        intakeId: input.intakeId || null,
        skillPackId: input.skillPackId || null,
        matchedAliases: detection.matchedAliases
      }
    });

    await logIntegrationEvent({
      companyId: input.companyId,
      integration: 'ORCHESTRATION',
      entityId: run.id,
      action: 'prompt_review.completed',
      status: 'OK',
      meta: {
        entityType: 'AutomationRun',
        matchedAliases: detection.matchedAliases,
        intakeId: input.intakeId || null
      }
    });

    await recordOrchestrationActivity({
      id: run.id,
      action: 'Prompt Review Completed',
      details: detection.matchedAliases.length > 0
        ? `Matched ${detection.matchedAliases.join(', ')}`
        : 'Prompt review completed',
      entityType: 'ORCHESTRATION',
      entityId: run.id,
      userId: input.createdBy || null
    });

    return {
      matched: true,
      matchedAliases: detection.matchedAliases,
      beforeText,
      afterText,
      explanation,
      runId: run.id
    };
  }
}

export const promptIntentService = new PromptIntentService();
