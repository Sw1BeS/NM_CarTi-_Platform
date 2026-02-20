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

const isFlagEnabled = (value: string | undefined) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

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

    const accessRequest = existing || await prisma.b2bAccessRequest.create({
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
}

export const b2bWhitelistService = new B2bWhitelistService();
