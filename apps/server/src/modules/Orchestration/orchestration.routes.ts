import { Router } from 'express';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { companyContext } from '../../middleware/companyContext.js';
import { errorResponse } from '../../utils/errorResponse.js';
import { prisma } from '../../services/prisma.js';
import { automationIntakeService } from './intake.service.js';
import { skillPackService } from './skillPack.service.js';
import { promptIntentService } from './promptIntent.service.js';
import { importService } from './import.service.js';
import { orchestrationPolicyService } from './policy.service.js';

const router = Router();
const operatorRoles = ['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR'];

router.use(authenticateToken);
router.use(companyContext);

const resolveCompanyId = (req: any) => req.companyId || req.user?.companyId || req.user?.workspaceId;

router.get('/overview', requireRole(operatorRoles), async (req: any, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) return errorResponse(res, 400, 'Company context required', 'ORCHESTRATION_CONTEXT');

    await orchestrationPolicyService.ensureBaseSetup(companyId);

    const [
      intakeCount,
      skillPackFresh,
      reviewQueuePending,
      importsAwaitingReview,
      recentIntakes,
      recentRuns
    ] = await Promise.all([
      prisma.automationIntake.count({ where: { companyId } }),
      prisma.automationSkillPack.count({ where: { companyId, freshnessState: 'FRESH' } }),
      prisma.automationReviewQueue.count({ where: { companyId, status: 'PENDING' } }),
      prisma.importBatch.count({ where: { companyId, status: 'REVIEW_REQUIRED' } }),
      prisma.automationIntake.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { skillPacks: { orderBy: { generatedAt: 'desc' }, take: 1 } }
      }),
      prisma.automationRun.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    res.json({
      counts: {
        intakeCount,
        skillPackFresh,
        reviewQueuePending,
        importsAwaitingReview
      },
      recentIntakes,
      recentRuns
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to load orchestration overview', 'ORCHESTRATION_OVERVIEW');
  }
});

router.get('/intake', requireRole(operatorRoles), async (req: any, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) return errorResponse(res, 400, 'Company context required', 'ORCHESTRATION_CONTEXT');

    const items = await automationIntakeService.listIntakes({
      companyId,
      limit: Number(req.query.limit) || 20,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      sourceType: typeof req.query.sourceType === 'string' ? req.query.sourceType.toUpperCase() : undefined
    });

    res.json(items);
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to list intake', 'ORCHESTRATION_INTAKE_LIST');
  }
});

router.post('/intake', requireRole(operatorRoles), async (req: any, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) return errorResponse(res, 400, 'Company context required', 'ORCHESTRATION_CONTEXT');

    const intake = await automationIntakeService.createIntake({
      companyId,
      createdBy: req.user?.userId || null,
      sourceType: typeof req.body?.sourceType === 'string' ? req.body.sourceType : undefined,
      title: typeof req.body?.title === 'string' ? req.body.title : null,
      inputText: typeof req.body?.inputText === 'string' ? req.body.inputText : null,
      sourceUrl: typeof req.body?.sourceUrl === 'string' ? req.body.sourceUrl : null,
      relatedEntities: req.body?.relatedEntities ?? null,
      metadata: req.body?.metadata ?? null
    });

    if (!intake) return errorResponse(res, 500, 'Failed to create intake', 'ORCHESTRATION_INTAKE_CREATE');

    const skillPack = await skillPackService.buildForIntake({
      companyId,
      intakeId: intake.id,
      createdBy: req.user?.userId || null,
      triggerSource: 'INTAKE_CREATE'
    });

    const promptReview = intake.inputText
      ? await promptIntentService.review({
          companyId,
          text: intake.inputText,
          intakeId: intake.id,
          skillPackId: skillPack?.id || null,
          createdBy: req.user?.userId || null,
          explanationRequested: Boolean(req.body?.explainPromptReview),
          triggerSource: 'INTAKE_CREATE'
        })
      : { matched: false, matchedAliases: [] };

    res.json({
      intake,
      skillPack,
      promptReview
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to create intake', 'ORCHESTRATION_INTAKE_CREATE');
  }
});

router.post('/intake/:id/skill-pack/refresh', requireRole(operatorRoles), async (req: any, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) return errorResponse(res, 400, 'Company context required', 'ORCHESTRATION_CONTEXT');

    const skillPack = await skillPackService.buildForIntake({
      companyId,
      intakeId: req.params.id,
      createdBy: req.user?.userId || null,
      triggerSource: 'MANUAL_REFRESH'
    });

    res.json(skillPack);
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to refresh skill pack', 'ORCHESTRATION_SKILL_PACK_REFRESH');
  }
});

router.post('/prompt-review', requireRole(operatorRoles), async (req: any, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) return errorResponse(res, 400, 'Company context required', 'ORCHESTRATION_CONTEXT');

    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!text.trim()) {
      return errorResponse(res, 400, 'text is required', 'ORCHESTRATION_PROMPT_REVIEW');
    }

    let intakeId = typeof req.body?.intakeId === 'string' ? req.body.intakeId : null;
    let skillPackId: string | null = null;

    if (!intakeId) {
      const intake = await automationIntakeService.createIntake({
        companyId,
        createdBy: req.user?.userId || null,
        sourceType: 'TASK',
        title: 'Prompt Review',
        inputText: text,
        metadata: {
          createdVia: 'prompt_review'
        }
      });
      intakeId = intake?.id || null;

      if (intakeId) {
        const skillPack = await skillPackService.buildForIntake({
          companyId,
          intakeId,
          createdBy: req.user?.userId || null,
          triggerSource: 'PROMPT_REVIEW'
        });
        skillPackId = skillPack?.id || null;
      }
    } else {
      const latestPack = await prisma.automationSkillPack.findFirst({
        where: { companyId, intakeId },
        orderBy: { generatedAt: 'desc' },
        select: { id: true }
      });
      skillPackId = latestPack?.id || null;
    }

    const result = await promptIntentService.review({
      companyId,
      text,
      intakeId,
      skillPackId,
      createdBy: req.user?.userId || null,
      explanationRequested: Boolean(req.body?.explain),
      triggerSource: 'PROMPT_REVIEW'
    });

    res.json(result);
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to run prompt review', 'ORCHESTRATION_PROMPT_REVIEW');
  }
});

router.post('/imports', requireRole(operatorRoles), async (req: any, res) => {
  try {
    const companyId = resolveCompanyId(req);
    if (!companyId) return errorResponse(res, 400, 'Company context required', 'ORCHESTRATION_CONTEXT');

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const sourceType = typeof req.body?.sourceType === 'string' ? req.body.sourceType.trim().toUpperCase() : '';
    if (!name || !sourceType) {
      return errorResponse(res, 400, 'name and sourceType are required', 'ORCHESTRATION_IMPORT_CREATE');
    }

    let intakeId = typeof req.body?.intakeId === 'string' ? req.body.intakeId : null;
    let skillPackId: string | null = null;

    if (!intakeId) {
      const intake = await automationIntakeService.createIntake({
        companyId,
        createdBy: req.user?.userId || null,
        sourceType: 'DATA_SOURCE',
        title: name,
        inputText: typeof req.body?.description === 'string' ? req.body.description : null,
        sourceUrl: typeof req.body?.sourceUri === 'string' ? req.body.sourceUri : null,
        metadata: {
          createdVia: 'imports',
          itemCount: Array.isArray(req.body?.items) ? req.body.items.length : 0
        },
        itemCount: Array.isArray(req.body?.items) ? req.body.items.length : 0
      });
      intakeId = intake?.id || null;

      if (intakeId) {
        const skillPack = await skillPackService.buildForIntake({
          companyId,
          intakeId,
          createdBy: req.user?.userId || null,
          triggerSource: 'IMPORT_CREATE'
        });
        skillPackId = skillPack?.id || null;
      }
    }

    const result = await importService.registerImport({
      companyId,
      intakeId,
      name,
      sourceType,
      sourceUri: typeof req.body?.sourceUri === 'string' ? req.body.sourceUri : null,
      contentType: typeof req.body?.contentType === 'string' ? req.body.contentType : null,
      description: typeof req.body?.description === 'string' ? req.body.description : null,
      metadata: req.body?.metadata ?? null,
      rawPayload: req.body?.rawPayload ?? null,
      items: Array.isArray(req.body?.items) ? req.body.items : []
    });

    res.json({
      intakeId,
      skillPackId,
      ...result
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to register import', 'ORCHESTRATION_IMPORT_CREATE');
  }
});

export default router;
