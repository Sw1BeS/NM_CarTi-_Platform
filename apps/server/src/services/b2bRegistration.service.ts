import { AccessRequestStatus, PartnerUserRole, type Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import type { BotRuntime } from '../modules/Communication/bots/scenario-engine/types.js';

type RegistrationIdentity = {
  tgUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  chatId?: string | null;
};

type RegistrationContext = {
  companyId?: string | null;
  botId?: string | null;
};

type NewPartnerPayload = {
  kind: 'NEW_PARTNER';
  chatId?: string | null;
  company: {
    name: string;
    city?: string | null;
    phone?: string | null;
    note?: string | null;
  };
  applicant: {
    tgUserId: string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    contact: string;
  };
};

const normalizeCode = (value: string) => String(value || '').trim().toUpperCase();

const randomInviteCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'CDL-';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)] || 'X';
  }
  return code;
};

const slugify = (value: string) => {
  const base = String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return base || 'partner';
};

const parseAccessRequestPayload = <T extends object>(input: {
  payload?: unknown;
  reason?: string | null;
}): T | null => {
  if (input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)) {
    return input.payload as T;
  }

  const raw = String(input.reason || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
};

const buildApplicantName = (firstName?: string | null, lastName?: string | null, fallback?: string | null) => {
  const full = [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ').trim();
  if (full) return full;
  const alt = String(fallback || '').trim();
  return alt || 'Представник';
};

const isB2BBotConfig = (config: Record<string, any>) => {
  if (String(config.presetTemplate || '').toUpperCase() === 'B2B') return true;
  const buttons = Array.isArray(config.menuConfig?.buttons) ? config.menuConfig.buttons : [];
  return buttons.some((btn: any) => String(btn?.id || '').startsWith('btn_b2b_'));
};

class B2bRegistrationService {
  isB2BBot(bot: BotRuntime) {
    const cfg = ((bot?.config || {}) as Record<string, any>);
    return isB2BBotConfig(cfg);
  }

  async resolveParticipant(input: RegistrationIdentity & RegistrationContext) {
    const partnerUser = await prisma.partnerUser.findFirst({
      where: {
        telegramId: input.tgUserId,
        ...(input.companyId ? { companyId: input.companyId } : {})
      },
      include: {
        partner: true
      }
    });

    return {
      allowed: Boolean(partnerUser?.partnerId),
      partnerUser: partnerUser || null,
      partnerCompany: partnerUser?.partner || null
    } as const;
  }

  async findCompanyByPartnerCode(code: string) {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) return null;
    return prisma.partnerCompany.findFirst({
      where: {
        OR: [
          { inviteCode: normalizedCode },
          { partnerCode: normalizedCode }
        ]
      }
    });
  }

  async getAccessRequestById(accessRequestId: string) {
    const accessRequest = await prisma.b2bAccessRequest.findUnique({
      where: { id: accessRequestId }
    });
    if (!accessRequest) return null;
    return {
      accessRequest,
      payload: parseAccessRequestPayload<NewPartnerPayload>(accessRequest)
    } as const;
  }

  private async ensureUniqueInviteCode() {
    for (let i = 0; i < 200; i += 1) {
      const code = randomInviteCode();
      const exists = await prisma.partnerCompany.findUnique({
        where: { inviteCode: code },
        select: { id: true }
      });
      if (!exists) return code;
    }
    throw new Error('failed_to_generate_invite_code');
  }

  private async ensureUniqueShowcaseSlug(seed: string) {
    const base = slugify(seed);
    for (let i = 0; i < 200; i += 1) {
      const suffix = i === 0 ? '' : `-${i + 1}`;
      const slug = `${base}${suffix}`.slice(0, 50);
      const [company, showcase] = await Promise.all([
        prisma.partnerCompany.findFirst({ where: { showcaseSlug: slug }, select: { id: true } }),
        prisma.showcase.findUnique({ where: { slug }, select: { id: true } })
      ]);
      if (!company && !showcase) return slug;
    }
    throw new Error('failed_to_generate_showcase_slug');
  }

  async createNewPartnerRequest(input: {
    identity: RegistrationIdentity;
    context: RegistrationContext;
    companyName: string;
    city?: string | null;
    phone?: string | null;
    note?: string | null;
    userContact: string;
  }) {
    const companyName = String(input.companyName || '').trim();
    const userContact = String(input.userContact || '').trim();
    if (!companyName || !userContact) {
      throw new Error('company_name_and_contact_required');
    }

    const payload: NewPartnerPayload = {
      kind: 'NEW_PARTNER',
      chatId: input.identity.chatId || null,
      company: {
        name: companyName,
        city: input.city || null,
        phone: input.phone || null,
        note: input.note || null
      },
      applicant: {
        tgUserId: input.identity.tgUserId,
        username: input.identity.username || null,
        firstName: input.identity.firstName || null,
        lastName: input.identity.lastName || null,
        contact: userContact
      }
    };

    const existing = await prisma.b2bAccessRequest.findFirst({
      where: {
        tgUserId: input.identity.tgUserId,
        companyId: input.context.companyId || null,
        botId: input.context.botId || null,
        status: AccessRequestStatus.NEW
      },
      orderBy: { createdAt: 'desc' }
    });

    const fullName = buildApplicantName(input.identity.firstName, input.identity.lastName, input.identity.username);
    const data: Prisma.B2bAccessRequestUncheckedCreateInput = {
      companyId: input.context.companyId || null,
      botId: input.context.botId || null,
      tgUserId: input.identity.tgUserId,
      username: input.identity.username || null,
      fullName,
      payload: payload as any,
      reason: JSON.stringify(payload),
      status: AccessRequestStatus.NEW
    };

    if (existing) {
      return prisma.b2bAccessRequest.update({
        where: { id: existing.id },
        data
      });
    }

    return prisma.b2bAccessRequest.create({ data });
  }

  async approveNewPartnerRequest(input: {
    accessRequestId: string;
    reviewedBy: string;
  }) {
    const accessRequest = await prisma.b2bAccessRequest.findUnique({
      where: { id: input.accessRequestId }
    });
    if (!accessRequest) return null;

    const payload = parseAccessRequestPayload<NewPartnerPayload>(accessRequest);
    if (!payload || payload.kind !== 'NEW_PARTNER') {
      throw new Error('unsupported_access_request_kind');
    }

    const companyName = String(payload.company?.name || '').trim();
    if (!companyName) {
      throw new Error('invalid_company_name');
    }

    let partnerCompany = await prisma.partnerCompany.findFirst({
      where: {
        name: companyName,
        ...(accessRequest.companyId ? { companyId: accessRequest.companyId } : {})
      }
    });

    if (!partnerCompany) {
      partnerCompany = await prisma.partnerCompany.create({
        data: {
          name: companyName,
          city: payload.company.city || null,
          contact: payload.company.phone || null,
          notes: payload.company.note || null,
          companyId: accessRequest.companyId || null
        }
      });
    } else {
      partnerCompany = await prisma.partnerCompany.update({
        where: { id: partnerCompany.id },
        data: {
          city: partnerCompany.city || payload.company.city || null,
          contact: partnerCompany.contact || payload.company.phone || null,
          notes: partnerCompany.notes || payload.company.note || null
        }
      });
    }

    const patch: Record<string, unknown> = {};
    if (!partnerCompany.inviteCode) {
      patch.inviteCode = await this.ensureUniqueInviteCode();
    }
    if (!partnerCompany.partnerCode) {
      patch.partnerCode = String((patch.inviteCode as string) || partnerCompany.inviteCode || '').replace(/^CDL-/, 'P-');
    }
    if (!partnerCompany.showcaseSlug) {
      patch.showcaseSlug = await this.ensureUniqueShowcaseSlug(companyName);
    }
    if (Object.keys(patch).length > 0) {
      partnerCompany = await prisma.partnerCompany.update({
        where: { id: partnerCompany.id },
        data: patch
      });
    }

    let partnerUser = await prisma.partnerUser.findFirst({
      where: { telegramId: accessRequest.tgUserId }
    });

    const userName = String(payload.applicant.firstName || '').trim() || buildApplicantName(payload.applicant.firstName, payload.applicant.lastName, accessRequest.username);
    const userLastName = String(payload.applicant.lastName || '').trim() || null;
    if (!partnerUser) {
      partnerUser = await prisma.partnerUser.create({
        data: {
          name: userName,
          lastName: userLastName,
          telegramId: accessRequest.tgUserId,
          phone: payload.applicant.contact,
          partnerId: partnerCompany.id,
          companyId: accessRequest.companyId || null,
          role: PartnerUserRole.OWNER
        }
      });
    } else {
      partnerUser = await prisma.partnerUser.update({
        where: { id: partnerUser.id },
        data: {
          name: partnerUser.name || userName,
          lastName: partnerUser.lastName || userLastName,
          phone: partnerUser.phone || payload.applicant.contact,
          partnerId: partnerCompany.id,
          companyId: partnerUser.companyId || accessRequest.companyId || null,
          role: PartnerUserRole.OWNER
        }
      });
    }

    const reviewed = await prisma.b2bAccessRequest.update({
      where: { id: accessRequest.id },
      data: {
        status: AccessRequestStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy
      }
    });

    return {
      accessRequest: reviewed,
      payload,
      partnerCompany,
      partnerUser
    } as const;
  }

  async rejectAccessRequest(input: {
    accessRequestId: string;
    reviewedBy: string;
  }) {
    const accessRequest = await prisma.b2bAccessRequest.findUnique({
      where: { id: input.accessRequestId }
    });
    if (!accessRequest) return null;

    const reviewed = await prisma.b2bAccessRequest.update({
      where: { id: accessRequest.id },
      data: {
        status: AccessRequestStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy
      }
    });

    return {
      accessRequest: reviewed,
      payload: parseAccessRequestPayload<NewPartnerPayload>(accessRequest)
    } as const;
  }

  async registerAgentByPartnerCode(input: {
    partnerCode: string;
    identity: RegistrationIdentity;
    context: RegistrationContext;
    contact: string;
  }) {
    const normalizedCode = normalizeCode(input.partnerCode);
    if (!normalizedCode) {
      return { ok: false as const, reason: 'INVALID_CODE' as const };
    }

    const partnerCompany = await prisma.partnerCompany.findFirst({
      where: {
        OR: [
          { inviteCode: normalizedCode },
          { partnerCode: normalizedCode }
        ]
      }
    });
    if (!partnerCompany) {
      return { ok: false as const, reason: 'INVALID_CODE' as const };
    }

    const userName = buildApplicantName(
      input.identity.firstName,
      input.identity.lastName,
      input.identity.username
    );
    const userLastName = String(input.identity.lastName || '').trim() || null;

    let partnerUser = await prisma.partnerUser.findFirst({
      where: {
        telegramId: input.identity.tgUserId,
        ...(input.context.companyId ? { companyId: input.context.companyId } : {})
      }
    });

    if (!partnerUser) {
      partnerUser = await prisma.partnerUser.create({
        data: {
          name: userName,
          lastName: userLastName,
          telegramId: input.identity.tgUserId,
          phone: input.contact,
          partnerId: partnerCompany.id,
          companyId: input.context.companyId || partnerCompany.companyId || null,
          role: PartnerUserRole.AGENT
        }
      });
    } else {
      const nextRole = partnerUser.role === PartnerUserRole.OWNER ? PartnerUserRole.OWNER : PartnerUserRole.AGENT;
      partnerUser = await prisma.partnerUser.update({
        where: { id: partnerUser.id },
        data: {
          name: partnerUser.name || userName,
          lastName: partnerUser.lastName || userLastName,
          phone: partnerUser.phone || input.contact,
          partnerId: partnerCompany.id,
          companyId: partnerUser.companyId || input.context.companyId || partnerCompany.companyId || null,
          role: nextRole
        }
      });
    }

    return {
      ok: true as const,
      partnerCompany,
      partnerUser
    };
  }
}

export const b2bRegistrationService = new B2bRegistrationService();
