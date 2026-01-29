import crypto from 'crypto';
import { prisma } from '../../../../../services/prisma.js';
import { logger } from '../../../../../utils/logger.js';

type EventInput = {
  companyId?: string | null;
  botId?: string | null;
  eventType: string;
  userId?: string | null;
  chatId?: string | null;
  payload?: Record<string, any> | null;
};

const hashValue = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

const scrubPayload = (payload: Record<string, any> | null | undefined) => {
  if (!payload || typeof payload !== 'object') return payload;
  const next = { ...payload } as Record<string, any>;
  if (typeof next.phone === 'string') {
    next.phoneHash = hashValue(next.phone);
    delete next.phone;
  }
  if (typeof next.phoneRaw === 'string') {
    next.phoneHash = hashValue(next.phoneRaw);
    delete next.phoneRaw;
  }
  return next;
};

export const emitPlatformEvent = async (input: EventInput) => {
  if (!input.eventType) return;
  const payload = scrubPayload(input.payload);
  try {
    await prisma.platformEvent.create({
      data: {
        companyId: input.companyId || null,
        botId: input.botId || null,
        eventType: input.eventType,
        userId: input.userId || null,
        chatId: input.chatId || null,
        payload: payload || undefined
      }
    });
  } catch (e) {
    logger.error(`[PlatformEvent] Failed to emit ${input.eventType}`, e);
  }
};

export const summarizeText = (text?: string | null) => {
  if (!text) return undefined;
  const trimmed = String(text).replace(/\s+/g, ' ').trim();
  const masked = trimmed.replace(/\+?\d[\d\s\-]{6,}\d/g, '[redacted]');
  return masked.slice(0, 200);
};
