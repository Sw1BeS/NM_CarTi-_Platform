import { Router } from 'express';
import { RequesterDecision } from '@prisma/client';
import { prisma } from '../services/prisma.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { b2bWhitelistService } from '../services/b2bWhitelist.service.js';
import { requestContractService } from '../services/requestContract.service.js';
import { errorResponse } from '../utils/errorResponse.js';

const router = Router();

const getCompanyId = (req: any) => req.user?.companyId || req.user?.workspaceId || null;

const resolvePartnerId = async (companyId: string, tgUserId?: string, partnerId?: string) => {
  if (partnerId) return partnerId;
  if (!tgUserId) return null;
  const partnerUser = await prisma.partnerUser.findFirst({
    where: {
      companyId,
      telegramId: String(tgUserId)
    },
    select: { partnerId: true }
  });
  return partnerUser?.partnerId || null;
};

router.use(authenticateToken);

router.post('/access/request', async (req, res) => {
  try {
    const companyId = getCompanyId(req as any);
    if (!companyId) return errorResponse(res, 400, 'Company context required');

    const body = (req.body || {}) as Record<string, any>;
    const tgUserId = String(body.tgUserId || '').trim();
    if (!tgUserId) return errorResponse(res, 400, 'tgUserId is required');

    const result = await b2bWhitelistService.ensureAccess({
      tgUserId,
      username: typeof body.username === 'string' ? body.username : null,
      fullName: typeof body.fullName === 'string' ? body.fullName : null
    }, {
      companyId,
      botId: typeof body.botId === 'string' ? body.botId : null
    }, typeof body.reason === 'string' ? body.reason : undefined);

    if (!result.allowed && (req as any).user?.role && ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes((req as any).user.role)) {
      await prisma.integrationEventLog.create({
        data: {
          companyId,
          integration: 'telegram',
          action: 'access.requested',
          status: 'SUCCESS',
          entityType: 'b2b_access_request',
          entityId: result.accessRequest?.id,
          message: 'B2B access requested via API'
        }
      }).catch(() => null);
    }

    return res.json({
      ok: true,
      allowed: result.allowed,
      accessRequest: result.accessRequest
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to request access');
  }
});

router.get('/requests/my', async (req, res) => {
  try {
    const companyId = getCompanyId(req as any);
    if (!companyId) return errorResponse(res, 400, 'Company context required');

    const userRole = (req as any).user?.role || 'USER';
    const tgUserId = typeof req.query.tgUserId === 'string' ? req.query.tgUserId : undefined;
    const partnerIdRaw = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;
    const partnerId = await resolvePartnerId(companyId, tgUserId, partnerIdRaw);

    try {
      requestContractService.ensurePartnerScope(partnerId, userRole);
    } catch (error: any) {
      return errorResponse(res, 400, error?.message || 'partnerId or tgUserId is required for partner scope');
    }

    return res.json({
      ok: true,
      items: await requestContractService.listPartnerRequests({
        companyId,
        partnerId: partnerId || undefined
      })
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to load requests');
  }
});

router.get('/variants/received', async (req, res) => {
  try {
    const companyId = getCompanyId(req as any);
    if (!companyId) return errorResponse(res, 400, 'Company context required');

    const userRole = (req as any).user?.role || 'USER';
    const tgUserId = typeof req.query.tgUserId === 'string' ? req.query.tgUserId : undefined;
    const partnerIdRaw = typeof req.query.partnerId === 'string' ? req.query.partnerId : undefined;
    const partnerId = await resolvePartnerId(companyId, tgUserId, partnerIdRaw);

    try {
      requestContractService.ensurePartnerScope(partnerId, userRole);
    } catch (error: any) {
      return errorResponse(res, 400, error?.message || 'partnerId or tgUserId is required for partner scope');
    }

    return res.json({
      ok: true,
      items: await requestContractService.listReceivedVariants({
        companyId,
        partnerId: partnerId || undefined
      })
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to load variants');
  }
});

router.post('/variants/:variantId/decision', async (req, res) => {
  try {
    const companyId = getCompanyId(req as any);
    if (!companyId) return errorResponse(res, 400, 'Company context required');

    const variantId = String(req.params.variantId || '').trim();
    const decisionRaw = String((req.body || {}).decision || '').toUpperCase();
    const decision = decisionRaw === 'FIT' ? RequesterDecision.FIT : (decisionRaw === 'NOT_FIT' ? RequesterDecision.NOT_FIT : null);
    if (!variantId || !decision) return errorResponse(res, 400, 'decision must be FIT or NOT_FIT');

    const variant = await prisma.requestVariant.findUnique({
      where: { id: variantId },
      include: { request: true }
    });
    if (!variant || variant.request?.companyId !== companyId) return errorResponse(res, 404, 'Variant not found');

    const role = (req as any).user?.role || 'USER';
    const isAdmin = ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role);
    const body = (req.body || {}) as Record<string, unknown>;
    const tgUserId = typeof body.tgUserId === 'string' ? body.tgUserId : undefined;
    const partnerId = await resolvePartnerId(companyId, tgUserId, typeof body.partnerId === 'string' ? body.partnerId : undefined);

    if (!isAdmin) {
      if (!partnerId || variant.request?.requesterPartnerId !== partnerId) {
        return errorResponse(res, 403, 'Forbidden');
      }
    }

    return res.json({
      ok: true,
      variant: await requestContractService.applyRequesterDecision({
        companyId,
        variantId,
        decision,
        partnerId: partnerId || undefined,
        isAdmin
      })
    });
  } catch (error: any) {
    if (error?.message === 'Forbidden') return errorResponse(res, 403, 'Forbidden');
    if (error?.message === 'Variant not found') return errorResponse(res, 404, 'Variant not found');
    return errorResponse(res, 500, error?.message || 'Failed to save decision');
  }
});

router.get('/admin/fit-queue', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const companyId = getCompanyId(req as any);
    if (!companyId) return errorResponse(res, 400, 'Company context required');

    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;

    return res.json({
      ok: true,
      items: await requestContractService.listAdminFitQueue({
        companyId,
        status
      })
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to load fit queue');
  }
});

router.patch('/admin/fit-queue/:variantId', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const companyId = getCompanyId(req as any);
    if (!companyId) return errorResponse(res, 400, 'Company context required');

    const variantId = String(req.params.variantId || '').trim();
    const body = (req.body || {}) as Record<string, unknown>;

    return res.json({
      ok: true,
      variant: await requestContractService.updateAdminFitQueue({
        companyId,
        variantId,
        fitQueueStatus: String(body.fitQueueStatus || ''),
        location: typeof body.location === 'string' ? body.location : undefined,
        meetingAt: typeof body.meetingAt === 'string' ? body.meetingAt : undefined,
        result: typeof body.result === 'string' ? body.result : undefined
      })
    });
  } catch (error: any) {
    if (error?.message === 'Invalid fitQueueStatus') return errorResponse(res, 400, 'Invalid fitQueueStatus');
    if (error?.message === 'Variant not found') return errorResponse(res, 404, 'Variant not found');
    return errorResponse(res, 500, error?.message || 'Failed to update fit queue');
  }
});

router.post('/admin/fit-queue/:variantId/contact-share', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const companyId = getCompanyId(req as any);
    if (!companyId) return errorResponse(res, 400, 'Company context required');

    const variantId = String(req.params.variantId || '').trim();
    if (!variantId) return errorResponse(res, 400, 'variantId is required');

    return res.json({
      ok: true,
      reveal: await requestContractService.shareAdminFitQueueContacts({
        companyId,
        variantId
      })
    });
  } catch (error: any) {
    if (error?.message === 'Variant not found') return errorResponse(res, 404, 'Variant not found');
    if (error?.message === 'Contacts unavailable') return errorResponse(res, 400, 'Contacts unavailable');
    return errorResponse(res, 500, error?.message || 'Failed to share contacts');
  }
});

export default router;
