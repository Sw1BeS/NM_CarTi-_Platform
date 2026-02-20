import { Router } from 'express';
import { FitQueueStatus, RequesterDecision, VariantStatus } from '@prisma/client';
import { prisma } from '../services/prisma.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { b2bWhitelistService } from '../services/b2bWhitelist.service.js';
import { mapVariantOutput } from '../services/dto.js';
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

    const where: any = { companyId };
    if (partnerId) {
      where.requesterPartnerId = partnerId;
    } else if (!['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(userRole)) {
      return errorResponse(res, 400, 'partnerId or tgUserId is required for partner scope');
    }

    const requests = await prisma.b2bRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        channelPosts: true,
        variants: true
      }
    });

    return res.json({
      ok: true,
      items: requests.map(r => ({
        id: r.id,
        publicId: r.publicId || r.id,
        title: r.title,
        status: r.status,
        channelPostUrl: r.channelPostUrl,
        variantsCount: r.variants.length,
        createdAt: r.createdAt
      }))
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

    if (!partnerId && !['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(userRole)) {
      return errorResponse(res, 400, 'partnerId or tgUserId is required for partner scope');
    }

    const requests = await prisma.b2bRequest.findMany({
      where: {
        companyId,
        ...(partnerId ? { requesterPartnerId: partnerId } : {})
      },
      select: { id: true }
    });

    const requestIds = requests.map(r => r.id);
    if (!requestIds.length) return res.json({ ok: true, items: [] });

    const variants = await prisma.requestVariant.findMany({
      where: { requestId: { in: requestIds } },
      include: { request: true },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      ok: true,
      items: variants.map(v => {
        const mapped = mapVariantOutput(v, { includeContact: false });
        return {
          ...mapped,
          requestPublicId: v.request?.publicId || v.requestId,
          requesterDecision: v.requesterDecision
        };
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

    if (!isAdmin) {
      const tgUserId = typeof (req.body || {}).tgUserId === 'string' ? (req.body || {}).tgUserId : undefined;
      const partnerId = await resolvePartnerId(companyId, tgUserId, typeof (req.body || {}).partnerId === 'string' ? (req.body || {}).partnerId : undefined);
      if (!partnerId || variant.request?.requesterPartnerId !== partnerId) {
        return errorResponse(res, 403, 'Forbidden');
      }
    }

    const updated = await prisma.requestVariant.update({
      where: { id: variantId },
      data: {
        requesterDecision: decision,
        requesterDecisionAt: new Date(),
        status: decision === RequesterDecision.FIT ? VariantStatus.APPROVED : VariantStatus.REJECTED,
        fitQueueStatus: decision === RequesterDecision.FIT ? FitQueueStatus.NEW : null,
        fitQueuedAt: decision === RequesterDecision.FIT ? new Date() : null
      },
      include: { request: true }
    });

    await prisma.integrationEventLog.create({
      data: {
        companyId,
        integration: 'telegram',
        action: decision === RequesterDecision.FIT ? 'variant.fit_marked' : 'variant.not_fit_marked',
        status: 'SUCCESS',
        entityType: 'request_variant',
        entityId: updated.id,
        message: `Decision ${decision}`
      }
    }).catch(() => null);

    return res.json({
      ok: true,
      variant: {
        id: updated.id,
        requesterDecision: updated.requesterDecision,
        fitQueueStatus: updated.fitQueueStatus,
        status: updated.status
      }
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to save decision');
  }
});

router.get('/admin/fit-queue', requireRole(['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const companyId = getCompanyId(req as any);
    if (!companyId) return errorResponse(res, 400, 'Company context required');

    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;

    const items = await prisma.requestVariant.findMany({
      where: {
        requesterDecision: RequesterDecision.FIT,
        request: { companyId },
        ...(status ? { fitQueueStatus: status as any } : {})
      },
      include: {
        request: true,
        sellerPartner: true
      },
      orderBy: { fitQueuedAt: 'desc' }
    });

    return res.json({
      ok: true,
      items: items.map(item => ({
        id: item.id,
        requestId: item.requestId,
        requestPublicId: item.request?.publicId || item.requestId,
        fitQueueStatus: item.fitQueueStatus,
        requesterDecisionAt: item.requesterDecisionAt,
        fitQueuedAt: item.fitQueuedAt,
        sellerCompany: item.sellerPartner?.name || item.companyName,
        contact: item.contact,
        title: item.title,
        price: item.price
      }))
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
    const statusRaw = String((req.body || {}).fitQueueStatus || '').toUpperCase();
    const allowed: FitQueueStatus[] = [
      FitQueueStatus.NEW,
      FitQueueStatus.IN_PROGRESS,
      FitQueueStatus.AGREED,
      FitQueueStatus.MEETING_SCHEDULED,
      FitQueueStatus.CLOSED
    ];
    if (!allowed.includes(statusRaw as FitQueueStatus)) {
      return errorResponse(res, 400, 'Invalid fitQueueStatus');
    }

    const variant = await prisma.requestVariant.findUnique({
      where: { id: variantId },
      include: { request: true }
    });
    if (!variant || variant.request?.companyId !== companyId) return errorResponse(res, 404, 'Variant not found');

    const updated = await prisma.requestVariant.update({
      where: { id: variantId },
      data: {
        fitQueueStatus: statusRaw as FitQueueStatus,
        fitClosedAt: statusRaw === FitQueueStatus.CLOSED ? new Date() : null,
        specs: {
          ...(variant.specs as any || {}),
          fitQueueMeta: {
            location: (req.body || {}).location || undefined,
            meetingAt: (req.body || {}).meetingAt || undefined,
            result: (req.body || {}).result || undefined,
            updatedAt: new Date().toISOString()
          }
        }
      }
    });

    return res.json({
      ok: true,
      variant: {
        id: updated.id,
        fitQueueStatus: updated.fitQueueStatus,
        fitClosedAt: updated.fitClosedAt
      }
    });
  } catch (error: any) {
    return errorResponse(res, 500, error?.message || 'Failed to update fit queue');
  }
});

export default router;
