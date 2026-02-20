import { Router } from 'express';
// @ts-ignore
import { prisma } from '../services/prisma.js';
import { requireRole } from '../middleware/auth.js';
import { previewTemplate, resolveTemplateBody, buildTemplateVariables, renderTemplateBody } from '../services/publication.service.js';
import { logIntegrationEvent } from '../services/integrationEventLog.service.js';
import { IntegrationService } from '../modules/Integrations/integration.service.js';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();
const integrationService = new IntegrationService();
// --- Content Templates & Publication Jobs ---
router.get('/content/templates', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const where: any = {};
        if (companyId) where.OR = [{ companyId }, { companyId: null }];
        const templates = await prisma.template.findMany({ where, orderBy: { createdAt: 'desc' } });
        res.json(templates);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to list templates');
    }
});

router.post('/content/templates', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        if (!payload.name || !payload.body) return errorResponse(res, 400, 'name and body are required');

        const created = await prisma.template.create({
            data: {
                name: String(payload.name),
                body: String(payload.body),
                language: payload.language ?? null,
                status: payload.status || 'ACTIVE',
                companyId: companyId || null,
                variables: payload.variables ?? null
            }
        });
        res.json(created);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to create template');
    }
});

router.put('/content/templates/:id', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const existing = await prisma.template.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Template not found');
        if (!isSuperadmin && userCompanyId && existing.companyId && existing.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const updated = await prisma.template.update({
            where: { id },
            data: {
                name: payload.name ?? undefined,
                body: payload.body ?? undefined,
                language: payload.language ?? undefined,
                status: payload.status ?? undefined,
                variables: payload.variables ?? undefined
            }
        });
        res.json(updated);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to update template');
    }
});

router.delete('/content/templates/:id', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const existing = await prisma.template.findUnique({ where: { id } });
        if (!existing) return errorResponse(res, 404, 'Template not found');
        if (!isSuperadmin && userCompanyId && existing.companyId && existing.companyId !== userCompanyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        await prisma.template.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to delete template');
    }
});

router.post('/content/templates/preview', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const result = await previewTemplate({
            templateId: payload.templateId,
            template: payload.template,
            companyId,
            carId: payload.carId,
            variables: payload.variables,
            lang: payload.lang
        });
        res.json(result);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, e.message || 'Failed to preview template');
    }
});

router.get('/content/publication-jobs', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const companyId = isSuperadmin ? requestedCompanyId : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const limit = Math.min(200, Number(req.query.limit) || 50);

        const where: any = {};
        if (companyId) where.companyId = companyId;
        if (status) where.status = status;

        const jobs = await prisma.publicationJob.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                template: true,
                results: { orderBy: { createdAt: 'desc' }, take: 1 }
            }
        });

        res.json(jobs);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to list publication jobs');
    }
});

router.post('/content/publication-jobs', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const payload = req.body || {};
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId : undefined;
        const companyId = isSuperadmin ? (requestedCompanyId || userCompanyId) : userCompanyId;
        if (!companyId && !isSuperadmin) return errorResponse(res, 400, 'Company context required');

        if (!payload.destination) return errorResponse(res, 400, 'destination is required');

        const destinationId = String(payload.destination);
        let resolvedBot: any = null;

        if (companyId) {
            const dest = await prisma.telegramDestination.findFirst({
                where: { companyId, tgId: destinationId, botId: { not: null } },
                select: { botId: true }
            });
            if (dest?.botId) {
                resolvedBot = await prisma.botConfig.findUnique({ where: { id: dest.botId } });
            }
        }

        if (!resolvedBot) {
            resolvedBot = await prisma.botConfig.findFirst({
                where: {
                    isEnabled: true,
                    ...(companyId ? { companyId } : {}),
                    OR: [
                        { channelId: destinationId },
                        { adminChatId: destinationId }
                    ]
                },
                orderBy: { createdAt: 'asc' }
            });
        }

        if (!resolvedBot?.token) return errorResponse(res, 400, 'Destination has no bot configured');
        if (companyId && !isSuperadmin && resolvedBot.companyId !== companyId) {
            return errorResponse(res, 403, 'Forbidden');
        }

        const templateBody = await resolveTemplateBody(payload.templateId, payload.template, companyId || null);
        const car = payload.carId ? await prisma.carListing.findUnique({ where: { id: String(payload.carId) } }) : null;
        const variables = await buildTemplateVariables({
            carId: payload.carId,
            variables: payload.variables,
            lang: payload.lang
        });
        const text = renderTemplateBody(templateBody, variables);

        if (!text) return errorResponse(res, 400, 'Template rendered to empty text');

        const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
        const publishNow = payload.publishNow === true || !scheduledAt || scheduledAt <= new Date();

        const resolvedTitle = payload.title || car?.title || 'Untitled';
        const resolvedMediaUrl = payload.mediaUrl ?? payload.imageUrl ?? car?.thumbnail ?? null;

        const draft = payload.createDraft === false ? null : await prisma.draft.create({
            data: {
                source: 'MANUAL',
                title: resolvedTitle,
                description: text,
                url: resolvedMediaUrl,
                status: 'SCHEDULED',
                destination: payload.destination,
                botId: resolvedBot.id,
                scheduledAt: scheduledAt || new Date(),
                metadata: {
                    templateId: payload.templateId ?? null,
                    variables,
                    carId: payload.carId ?? null
                }
            }
        });

        const job = await prisma.publicationJob.create({
            data: {
                companyId: companyId || null,
                draftId: draft?.id,
                templateId: payload.templateId ?? null,
                botId: resolvedBot.id,
                title: resolvedTitle,
                text,
                mediaUrl: resolvedMediaUrl,
                destination: payload.destination,
                status: publishNow ? 'QUEUED' : 'SCHEDULED',
                scheduledAt: scheduledAt || new Date(),
                metadata: {
                    templateId: payload.templateId ?? null,
                    variables,
                    carId: payload.carId ?? null
                }
            }
        });

        if (publishNow) {
            try {
                const result = await integrationService.publishTelegramChannelPost({
                    companyId: String(companyId || resolvedBot.companyId || ''),
                    botToken: resolvedBot.token,
                    botId: resolvedBot.id,
                    destination: payload.destination,
                    text,
                    imageUrl: resolvedMediaUrl ?? undefined
                });
                const publishResult = result as any;
                const messageId = publishResult?.result?.message_id || publishResult?.message_id;
                const postedAt = new Date();

                await prisma.publicationJob.update({
                    where: { id: job.id },
                    data: { status: 'POSTED', postedAt }
                });

                await prisma.publicationResult.create({
                    data: {
                        jobId: job.id,
                        status: 'SUCCESS',
                        messageId: messageId ? Number(messageId) : null,
                        payload: publishResult
                    }
                });

                await logIntegrationEvent({
                    companyId: companyId || null,
                    integration: 'TELEGRAM_BOTAPI',
                    entityId: job.id,
                    action: 'publish_success',
                    status: 'OK',
                    meta: {
                        destination: payload.destination,
                        messageId: messageId ? Number(messageId) : undefined
                    }
                });

                if (draft) {
                    await prisma.draft.update({
                        where: { id: draft.id },
                        data: { status: 'POSTED', postedAt }
                    });
                }

                if (messageId) {
                    await prisma.channelPost.create({
                        data: {
                            draftId: draft?.id,
                            channelId: payload.destination,
                            messageId: Number(messageId),
                            botId: resolvedBot.id,
                            status: 'ACTIVE',
                            payload: publishResult
                        }
                    });
                }
            } catch (e: any) {
                await prisma.publicationJob.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', lastError: e.message }
                });
                await prisma.publicationResult.create({
                    data: { jobId: job.id, status: 'FAILED', error: e.message }
                });
                await logIntegrationEvent({
                    companyId: companyId || null,
                    integration: 'TELEGRAM_BOTAPI',
                    entityId: job.id,
                    action: 'publish_failed',
                    status: 'ERROR',
                    message: e.message || 'Publish failed',
                    meta: {
                        destination: payload.destination
                    }
                });
                if (draft) {
                    await prisma.draft.update({
                        where: { id: draft.id },
                        data: { status: 'FAILED', metadata: { error: e.message, failedAt: new Date().toISOString() } }
                    });
                }
            }
        }

        const finalJob = await prisma.publicationJob.findUnique({
            where: { id: job.id },
            include: { template: true, results: { orderBy: { createdAt: 'desc' }, take: 1 } }
        });

        res.json(finalJob);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, e.message || 'Failed to create publication job');
    }
});

router.post('/content/publication-jobs/:id/retry', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const job = await prisma.publicationJob.findUnique({ where: { id } });
        if (!job) return errorResponse(res, 404, 'Publication job not found');
        if (!isSuperadmin && userCompanyId && job.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');

        const updated = await prisma.publicationJob.update({
            where: { id },
            data: { status: 'SCHEDULED', lastError: null, scheduledAt: new Date() }
        });
        res.json(updated);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to retry publication job');
    }
});

router.get('/content/publication-jobs/:id/results', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const job = await prisma.publicationJob.findUnique({ where: { id } });
        if (!job) return errorResponse(res, 404, 'Publication job not found');
        if (!isSuperadmin && userCompanyId && job.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');

        const results = await prisma.publicationResult.findMany({
            where: { jobId: id },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(results);
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to list publication results');
    }
});

router.delete('/content/publication-jobs/:id', requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
    try {
        const { id } = req.params;
        const user = (req as any).user || {};
        const isSuperadmin = user.role === 'SUPER_ADMIN';
        const userCompanyId = user.companyId || user.workspaceId;
        if (!isSuperadmin && !userCompanyId) return errorResponse(res, 400, 'Company context required');

        const job = await prisma.publicationJob.findUnique({ where: { id } });
        if (!job) return errorResponse(res, 404, 'Publication job not found');
        if (!isSuperadmin && userCompanyId && job.companyId !== userCompanyId) return errorResponse(res, 403, 'Forbidden');

        await prisma.publicationJob.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        logger.error(e);
        errorResponse(res, 500, 'Failed to delete publication job');
    }
});

export default router;
