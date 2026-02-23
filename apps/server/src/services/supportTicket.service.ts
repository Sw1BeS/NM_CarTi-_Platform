import { prisma } from './prisma.js';

export type SupportTicketContext = Record<string, unknown>;

class SupportTicketService {
  async findOpenByTgUser(input: { companyId?: string | null; tgUserId: string }) {
    return prisma.supportTicket.findFirst({
      where: {
        tgUserId: input.tgUserId,
        ...(input.companyId ? { companyId: input.companyId } : {}),
        status: 'OPEN'
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createTicket(input: {
    companyId?: string | null;
    botId?: string | null;
    tgUserId: string;
    chatId?: string | null;
    text: string;
    context?: SupportTicketContext;
  }) {
    return prisma.supportTicket.create({
      data: {
        companyId: input.companyId || null,
        botId: input.botId || null,
        tgUserId: input.tgUserId,
        chatId: input.chatId || null,
        text: input.text,
        context: (input.context || {}) as any,
        status: 'OPEN'
      }
    });
  }

  async appendTicket(input: {
    ticketId: string;
    text: string;
    context?: SupportTicketContext;
  }) {
    const existing = await prisma.supportTicket.findUnique({ where: { id: input.ticketId } });
    if (!existing) return null;

    const mergedText = [existing.text, input.text].filter(Boolean).join('\n\n---\n\n');
    const mergedContext = {
      ...((existing.context as Record<string, unknown>) || {}),
      ...(input.context || {}),
      lastAppendAt: new Date().toISOString()
    };

    return prisma.supportTicket.update({
      where: { id: input.ticketId },
      data: {
        text: mergedText,
        context: mergedContext as any,
        status: 'OPEN'
      }
    });
  }

  async closeTicket(ticketId: string) {
    return prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'CLOSED',
        closedAt: new Date()
      }
    });
  }
}

export const supportTicketService = new SupportTicketService();
