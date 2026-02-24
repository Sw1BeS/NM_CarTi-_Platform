import { AccessRequestStatus } from '@prisma/client';
import { prisma } from './prisma.js';

export type WhitelistIdentity = {
  tgUserId: string;
  username?: string | null;
  fullName?: string | null;
};

export type WhitelistContext = {
  companyId?: string | null;
  botId?: string | null;
};

type AccessDecision = 'APPROVE' | 'REJECT';

const isFlagEnabled = (value: string | undefined) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

const parseReasonMeta = (reason?: string | null) => {
  const source = String(reason || '');
  const parts = source.split(';').map(p => p.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const part of parts) {
    const [k, ...rest] = part.split('=');
    if (!k || !rest.length) continue;
    map.set(k.trim(), rest.join('=').trim());
  }
  return {
    chatId: map.get('chatId') || null,
    chatType: map.get('chatType') || null,
    inviteCode: map.get('inviteCode') || null
  };
};

const isGroupType = (chatType?: string | null) => ['group', 'supergroup'].includes(String(chatType || ''));

class B2bWhitelistService {
  isEnforced() {
    return isFlagEnabled(process.env.FF_B2B_WHITELIST_ENFORCED);
  }

  async resolveParticipant(identity: WhitelistIdentity, context: WhitelistContext) {
    const user = await prisma.partnerUser.findFirst({
      where: {
        telegramId: identity.tgUserId,
        ...(context.companyId ? { companyId: context.companyId } : {})
      },
      include: {
        partner: true
      }
    });

    return {
      allowed: Boolean(user?.partnerId),
      partnerUser: user,
      partnerCompany: user?.partner || null
    };
  }

  async ensureAccess(identity: WhitelistIdentity, context: WhitelistContext, reason?: string) {
    const participant = await this.resolveParticipant(identity, context);
    if (participant.allowed) {
      return {
        allowed: true,
        partnerUser: participant.partnerUser,
        partnerCompany: participant.partnerCompany,
        accessRequest: null
      } as const;
    }

    const existing = await prisma.b2bAccessRequest.findFirst({
      where: {
        tgUserId: identity.tgUserId,
        companyId: context.companyId || null,
        botId: context.botId || null,
        status: AccessRequestStatus.NEW
      },
      orderBy: { createdAt: 'desc' }
    });

    const accessRequest = existing
      ? await prisma.b2bAccessRequest.update({
        where: { id: existing.id },
        data: {
          username: identity.username || existing.username || null,
          fullName: identity.fullName || existing.fullName || null,
          reason: reason || existing.reason || null
        }
      })
      : await prisma.b2bAccessRequest.create({
        data: {
          companyId: context.companyId || null,
          botId: context.botId || null,
          tgUserId: identity.tgUserId,
          username: identity.username || null,
          fullName: identity.fullName || null,
          reason: reason || null,
          status: AccessRequestStatus.NEW
        }
      });

    return {
      allowed: false,
      partnerUser: null,
      partnerCompany: null,
      accessRequest
    } as const;
  }

  async reviewAccessRequest(input: {
    accessRequestId: string;
    decision: AccessDecision;
    reviewedBy: string;
  }) {
    const accessRequest = await prisma.b2bAccessRequest.findUnique({
      where: { id: input.accessRequestId }
    });
    if (!accessRequest) return null;

    const now = new Date();
    if (input.decision === 'REJECT') {
      const rejected = await prisma.b2bAccessRequest.update({
        where: { id: accessRequest.id },
        data: {
          status: AccessRequestStatus.REJECTED,
          reviewedAt: now,
          reviewedBy: input.reviewedBy
        }
      });
      return {
        accessRequest: rejected,
        partnerCompany: null,
        partnerUser: null
      } as const;
    }

    const reasonMeta = parseReasonMeta(accessRequest.reason);
    const groupChatFromReason = isGroupType(reasonMeta.chatType) ? reasonMeta.chatId : null;
    const inviteCode = reasonMeta.inviteCode || accessRequest.reason?.match(/inviteCode=([^;]+)/)?.[1];

    let partnerUser = await prisma.partnerUser.findFirst({
      where: { telegramId: accessRequest.tgUserId },
      include: { partner: true }
    });

    let partnerCompany = partnerUser?.partner || null;
    const companyId = accessRequest.companyId || null;
    const suggestedPartnerName = String(
      accessRequest.fullName
      || (accessRequest.username ? `@${accessRequest.username}` : '')
      || `Partner ${accessRequest.tgUserId}`
    ).trim();

    if (!partnerCompany && inviteCode) {
      partnerCompany = await prisma.partnerCompany.findUnique({
        where: { inviteCode }
      });
    }

    if (!partnerCompany) {
      partnerCompany = await prisma.partnerCompany.findFirst({
        where: {
          ...(companyId ? { companyId } : {}),
          name: suggestedPartnerName
        }
      });
    }

    if (!partnerCompany) {
      partnerCompany = await prisma.partnerCompany.create({
        data: {
          name: suggestedPartnerName || `Partner ${accessRequest.tgUserId}`,
          companyId,
          adminGroupChatId: groupChatFromReason || null
        }
      });
    } else if (!partnerCompany.adminGroupChatId && groupChatFromReason) {
      partnerCompany = await prisma.partnerCompany.update({
        where: { id: partnerCompany.id },
        data: { adminGroupChatId: groupChatFromReason }
      });
    }

    if (!partnerUser) {
      partnerUser = await prisma.partnerUser.create({
        data: {
          name: String(accessRequest.fullName || accessRequest.username || `User ${accessRequest.tgUserId}`).trim(),
          telegramId: accessRequest.tgUserId,
          partnerId: partnerCompany.id,
          companyId
        },
        include: { partner: true }
      });
    } else {
      partnerUser = await prisma.partnerUser.update({
        where: { id: partnerUser.id },
        data: {
          partnerId: partnerCompany.id,
          companyId: partnerUser.companyId || companyId || null,
          name: partnerUser.name || String(accessRequest.fullName || accessRequest.username || `User ${accessRequest.tgUserId}`).trim()
        },
        include: { partner: true }
      });
    }

    const approved = await prisma.b2bAccessRequest.update({
      where: { id: accessRequest.id },
      data: {
        status: AccessRequestStatus.APPROVED,
        reviewedAt: now,
        reviewedBy: input.reviewedBy
      }
    });

    return {
      accessRequest: approved,
      partnerCompany,
      partnerUser
    } as const;
  }
}

export const b2bWhitelistService = new B2bWhitelistService();
