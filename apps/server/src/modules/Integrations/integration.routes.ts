/**
 * Integration Routes - Third-party integration management
 */

import { Router } from 'express';
import { IntegrationService } from './integration.service.js';
import { authenticateToken, requireRole } from '../../middleware/auth.js';
import { companyContext } from '../../middleware/companyContext.js';
import { prisma } from '../../services/prisma.js';
import { isEnvFlagEnabled } from '../../services/featureFlags.js';
import { errorResponse } from '../../utils/errorResponse.js';
import { handleSalesDriveWebhook } from './salesdrive/salesdriveWebhook.service.js';

const router = Router();
const integrationService = new IntegrationService();
const META_TRACKING_BOUND_ACTION = 'miniapp.tracking_bound';

router.post('/salesdrive/webhook', async (req: any, res) => {
    try {
        const result = await handleSalesDriveWebhook({
            headers: req.headers,
            query: req.query,
            body: req.body,
            companyId: req.companyId || null
        });
        res.status(result.statusCode || (result.ok ? 200 : 400)).json(result);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'SalesDrive webhook error', 'SALESDRIVE_WEBHOOK');
    }
});

// All routes require authentication
router.use(authenticateToken);
router.use(companyContext);

import mtprotoRoutes from './mtproto/mtproto.routes.js';
router.use('/mtproto', mtprotoRoutes as any);

import parsingRoutes from './parsing/parsing.routes.js';
router.use('/parsing', parsingRoutes as any);

import telegramRegistryRoutes from './telegram/telegramRegistry.routes.js';
router.use('/telegram', telegramRegistryRoutes as any);

import salesDriveRoutes from './salesdrive/salesdrive.routes.js';
router.use('/salesdrive', salesDriveRoutes as any);

/**
 * GET /api/integrations/logs
 * Integration event logs
 */
router.get('/logs', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req: any, res) => {
    try {
        const companyId = req.companyId;
        if (!companyId) return errorResponse(res, 400, 'Company context required', 'INTEGRATION_LOGS');

        const integration = typeof req.query.integration === 'string' ? req.query.integration : undefined;
        const entityId = typeof req.query.entityId === 'string' ? req.query.entityId : undefined;
        const status = typeof req.query.status === 'string' ? req.query.status : undefined;
        const action = typeof req.query.action === 'string' ? req.query.action : undefined;
        const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
        const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
        const limit = Math.min(500, Number(req.query.limit) || 100);

        const where: any = { companyId };
        if (integration) where.integration = integration;
        if (entityId) where.entityId = entityId;
        if (status) where.status = status;
        if (action) where.action = action;
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = from;
            if (to) where.createdAt.lte = to;
        }

        const logs = await prisma.integrationEventLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        res.json(logs);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration logs error', 'INTEGRATION_LOGS');
    }
});

const toCountMap = (rows: Array<Record<string, any>>, key: string) => Object.fromEntries(
    rows.map((row) => [String(row[key] || 'UNKNOWN'), Number(row._count?._all || 0)])
);

const redactDebugText = (value: unknown) => String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d\s()\-]{6,}\d)/g, '[redacted-phone]')
    .replace(/(?:access[_-]?token|token|authorization)["':=]+[^"',\s}]+/gi, '[redacted-token]');

const safeMetaDebugPayload = (meta: unknown) => {
    const record = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta as Record<string, unknown> : {};
    return {
        ...(typeof record.eventId === 'string' ? { eventId: record.eventId } : {}),
        ...(typeof record.trackingEventId === 'string' ? { trackingEventId: record.trackingEventId } : {}),
        ...(typeof record.requestId === 'string' ? { requestId: record.requestId } : {}),
        ...(typeof record.requestPublicId === 'string' ? { requestPublicId: record.requestPublicId } : {}),
        ...(typeof record.leadId === 'string' ? { leadId: record.leadId } : {}),
        ...(typeof record.submitId === 'string' ? { submitId: record.submitId } : {}),
        ...(typeof record.hasPhone === 'boolean' ? { hasPhone: record.hasPhone } : {}),
        ...(typeof record.hasEmail === 'boolean' ? { hasEmail: record.hasEmail } : {}),
        ...(typeof record.hasExternalId === 'boolean' ? { hasExternalId: record.hasExternalId } : {}),
        ...(typeof record.hasFbp === 'boolean' ? { hasFbp: record.hasFbp } : {}),
        ...(typeof record.hasFbc === 'boolean' ? { hasFbc: record.hasFbc } : {})
    };
};

const safeMetaDebugLog = (log: any) => {
    if (!log) return null;
    return {
        action: log.action,
        status: log.status,
        entityType: log.entityType,
        entityId: log.entityId,
        idempotencyKey: log.idempotencyKey,
        message: redactDebugText(log.message),
        createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
        meta: safeMetaDebugPayload(log.meta)
    };
};

/**
 * GET /api/integrations/meta/debug
 * Safe Meta CAPI tracking summary for admin/debug screens.
 */
router.get('/meta/debug', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'OPERATOR']), async (req: any, res) => {
    try {
        const companyId = req.companyId;
        if (!companyId) return errorResponse(res, 400, 'Company context required', 'META_DEBUG');

        const where = { companyId, integration: 'META_PIXEL' };
        const [lastSent, lastBinding, lastError, byStatusRows, byActionRows, byEntityTypeRows] = await Promise.all([
            prisma.integrationEventLog.findFirst({
                where: { ...where, status: 'SUCCESS', action: { not: META_TRACKING_BOUND_ACTION } },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.integrationEventLog.findFirst({
                where: { ...where, status: 'SUCCESS', action: META_TRACKING_BOUND_ACTION },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.integrationEventLog.findFirst({
                where: { ...where, status: 'ERROR' },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.integrationEventLog.groupBy({
                by: ['status'],
                where,
                _count: { _all: true }
            }),
            prisma.integrationEventLog.groupBy({
                by: ['action'],
                where,
                _count: { _all: true }
            }),
            prisma.integrationEventLog.groupBy({
                by: ['entityType'],
                where,
                _count: { _all: true }
            })
        ]);
        const byAction = toCountMap(byActionRows as any, 'action');
        const byEntityType = toCountMap(byEntityTypeRows as any, 'entityType');

        res.json({
            integration: 'META_PIXEL',
            capiEnabled: isEnvFlagEnabled('META_CAPI_ENABLED', false),
            counts: {
                byStatus: toCountMap(byStatusRows as any, 'status'),
                byAction
            },
            binding: {
                byEntityType,
                requestBound: byEntityType.request || 0,
                leadBound: byEntityType.lead || 0,
                miniappEventUnbound: byEntityType.miniapp_event || 0,
                trackingBound: byAction[META_TRACKING_BOUND_ACTION] || 0
            },
            lastSent: safeMetaDebugLog(lastSent),
            lastBinding: safeMetaDebugLog(lastBinding),
            lastError: safeMetaDebugLog(lastError),
            dedup: {
                eventIdField: 'event_id',
                idempotencyKey: 'IntegrationEventLog.idempotencyKey'
            }
        });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Meta debug error', 'META_DEBUG');
    }
});

/**
 * GET /api/integrations
 * Get all integrations for company
 */
router.get('/', async (req: any, res) => {
    try {
        const integrations = await integrationService.getAll(req.companyId);
        res.json(integrations);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration error', 'INTEGRATION_ERROR');
    }
});

/**
 * GET /api/integrations/:type
 * Get specific integration config (ADMIN+ only)
 */
router.get('/:type', requireRole(['OWNER', 'ADMIN']), async (req: any, res) => {
    try {
        const integration = await integrationService.getByType(req.companyId, req.params.type.toUpperCase());

        if (!integration) {
            return errorResponse(res, 404, 'Integration not found', 'INTEGRATION_NOT_FOUND');
        }

        res.json(integration);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration error', 'INTEGRATION_ERROR');
    }
});

/**
 * GET /api/integrations/:type/health
 * Return (and optionally refresh) integration health
 */
router.get('/:type/health', requireRole(['OWNER', 'ADMIN']), async (req: any, res) => {
    try {
        const type = req.params.type.toUpperCase();
        const integration = await integrationService.getByType(req.companyId, type);

        if (!integration) {
            return errorResponse(res, 404, 'Integration not found', 'INTEGRATION_NOT_FOUND');
        }

        const refresh = String(req.query.refresh || '').toLowerCase() === '1' || String(req.query.refresh || '').toLowerCase() === 'true';
        let healthStatus = integration.healthStatus || 'UNKNOWN';
        let healthMessage = integration.healthMessage || null;
        let healthCheckedAt = integration.healthCheckedAt || null;

        if (refresh && integration.config) {
            try {
                if (type === 'META_PIXEL') {
                    const { testMetaConnection } = await import('./meta.service.js');
                    const { pixelId, accessToken, testCode } = integration.config as any;
                    if (!pixelId || !accessToken) throw new Error('pixelId and accessToken are required');
                    await testMetaConnection(pixelId, accessToken, testCode);
                } else if (type === 'SENDPULSE') {
                    const { testSendPulseConnection } = await import('./sendpulse/sendpulse.service.js');
                    const { apiUserId, apiSecret } = integration.config as any;
                    if (!apiUserId || !apiSecret) throw new Error('apiUserId and apiSecret are required');
                    await testSendPulseConnection(apiUserId, apiSecret);
                } else if (type === 'WEBHOOK') {
                    const { url } = integration.config as any;
                    if (!url) throw new Error('url is required');
                    const axios = (await import('axios')).default;
                    await axios.head(url, { timeout: 5000 });
                }

                healthStatus = 'OK';
                healthMessage = 'OK';
                healthCheckedAt = new Date();
                await prisma.integration.update({
                    where: { id: integration.id },
                    data: {
                        healthStatus,
                        healthMessage,
                        healthCheckedAt,
                        retryCount: 0,
                        lastError: null
                    }
                });
            } catch (e: any) {
                healthStatus = 'ERROR';
                healthMessage = e?.message || 'Health check failed';
                healthCheckedAt = new Date();
                await prisma.integration.update({
                    where: { id: integration.id },
                    data: {
                        healthStatus,
                        healthMessage,
                        healthCheckedAt,
                        retryCount: { increment: 1 },
                        lastError: healthMessage
                    }
                });
            }
        }

        res.json({
            type,
            isActive: integration.isActive,
            status: healthStatus,
            message: healthMessage,
            checkedAt: healthCheckedAt,
            retryCount: integration.retryCount || 0,
            lastError: integration.lastError || undefined
        });
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration health error', 'INTEGRATION_HEALTH');
    }
});

/**
 * PUT /api/integrations/:type
 * Create or update integration (ADMIN+ only)
 */
router.put('/:type', requireRole(['OWNER', 'ADMIN']), async (req: any, res) => {
    try {
        const { config, isActive } = req.body;

        if (!config) {
            return errorResponse(res, 400, 'Config is required', 'INTEGRATION_VALIDATION');
        }

        const integration = await integrationService.upsert(req.companyId, {
            type: req.params.type.toUpperCase(),
            config,
            isActive
        });

        res.json(integration);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Integration error', 'INTEGRATION_ERROR');
    }
});

/**
 * DELETE /api/integrations/:type
 * Delete integration (OWNER only)
 */
router.delete('/:type', requireRole(['OWNER']), async (req: any, res) => {
    try {
        await integrationService.delete(req.companyId, req.params.type.toUpperCase());
        res.json({ success: true });
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Integration error', 'INTEGRATION_ERROR');
    }
});

/**
 * POST /api/integrations/:type/toggle
 * Toggle integration active status (ADMIN+ only)
 */
router.post('/:type/toggle', requireRole(['OWNER', 'ADMIN']), async (req: any, res) => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== 'boolean') {
            return errorResponse(res, 400, 'isActive must be boolean', 'INTEGRATION_VALIDATION');
        }

        const integration = await integrationService.toggle(req.companyId, req.params.type.toUpperCase(), isActive);
        res.json(integration);
    } catch (e: any) {
        return errorResponse(res, 400, e.message || 'Integration error', 'INTEGRATION_ERROR');
    }
});

/**
 * POST /api/integrations/:type/test
 * Test integration connection (ADMIN+ only)
 */
router.post('/:type/test', requireRole(['OWNER', 'ADMIN']), async (req: any, res) => {
    try {
        const { config } = req.body;
        const type = req.params.type.toUpperCase();

        if (!config) {
            return errorResponse(res, 400, 'Config is required for testing', 'INTEGRATION_VALIDATION');
        }

        let testResult;

        // Meta Pixel Test
        if (type === 'META_PIXEL') {
            const { testMetaConnection } = await import('./meta.service.js');
            const { pixelId, accessToken, testCode } = config;

            if (!pixelId || !accessToken) {
                return errorResponse(res, 400, 'pixelId and accessToken are required', 'INTEGRATION_VALIDATION');
            }

            testResult = await testMetaConnection(pixelId, accessToken, testCode);
        }
        // SendPulse Test
        else if (type === 'SENDPULSE') {
            const { testSendPulseConnection } = await import('./sendpulse/sendpulse.service.js');
            const { apiUserId, apiSecret } = config;

            if (!apiUserId || !apiSecret) {
                return errorResponse(res, 400, 'apiUserId and apiSecret are required', 'INTEGRATION_VALIDATION');
            }

            testResult = await testSendPulseConnection(apiUserId, apiSecret);
        }
        // Webhook Test
        else if (type === 'WEBHOOK') {
            const { url } = config;

            if (!url) {
                return errorResponse(res, 400, 'url is required', 'INTEGRATION_VALIDATION');
            }

            const axios = (await import('axios')).default;
            try {
                await axios.post(url, { test: true, timestamp: Date.now() }, { timeout: 5000 });
                testResult = { success: true };
            } catch (e: any) {
                testResult = { success: false, error: e.message };
            }
        }
        else {
            return errorResponse(res, 400, 'Test not supported for this integration type', 'INTEGRATION_VALIDATION');
        }

        res.json(testResult);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration error', 'INTEGRATION_ERROR');
    }
});

/**
 * POST /api/integrations/webhook/trigger
 * Manually trigger webhook for testing (ADMIN+ only)
 */
router.post('/webhook/trigger', requireRole(['OWNER', 'ADMIN']), async (req: any, res) => {
    try {
        const { event, payload } = req.body;

        if (!event) {
            return errorResponse(res, 400, 'Event is required', 'INTEGRATION_VALIDATION');
        }

        const results = await integrationService.triggerWebhook(req.companyId, event, payload || {});
        res.json(results);
    } catch (e: any) {
        return errorResponse(res, 500, e.message || 'Integration error', 'INTEGRATION_ERROR');
    }
});

export default router;
