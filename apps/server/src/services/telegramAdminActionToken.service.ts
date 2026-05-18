import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

export type TelegramAdminActionPayload = {
  token: string;
  logId: string;
  action: string;
  targetType: string;
  targetId: string;
  botId?: string | null;
  companyId?: string | null;
  requestId?: string | null;
  consumed?: boolean;
};

export type CreateTelegramAdminActionTokenInput = {
  action: string;
  targetType: string;
  targetId: string;
  botId?: string | null;
  companyId?: string | null;
  requestId?: string | null;
};

const tokenKey = (token: string) => `telegram:admin-action-token:${token}`;

const createTokenValue = () => randomBytes(12).toString('base64url');

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

const normalizeToken = (token?: string | null) => String(token || '').trim();

const fromLog = (token: string, log: any): TelegramAdminActionPayload | null => {
  if (!log || log.integration !== 'telegram' || log.action !== 'admin.action_token_created') return null;
  const status = String(log.status || '').toUpperCase();
  if (status !== 'PENDING') return null;
  const meta = asObject(log.meta);
  const action = String(meta.action || '').trim();
  const targetType = String(meta.targetType || log.entityType || '').trim();
  const targetId = String(meta.targetId || log.entityId || '').trim();
  if (!action || !targetType || !targetId) return null;
  return {
    token,
    logId: String(log.id || ''),
    action,
    targetType,
    targetId,
    botId: meta.botId ? String(meta.botId) : null,
    companyId: meta.companyId ? String(meta.companyId) : (log.companyId ? String(log.companyId) : null),
    requestId: meta.requestId ? String(meta.requestId) : null
  };
};

export const createAdminActionToken = async (input: CreateTelegramAdminActionTokenInput) => {
  const action = String(input.action || '').trim();
  const targetType = String(input.targetType || '').trim();
  const targetId = String(input.targetId || '').trim();
  if (!action || !targetType || !targetId) return '';

  const token = createTokenValue();
  await prisma.integrationEventLog.create({
    data: {
      companyId: input.companyId || null,
      integration: 'telegram',
      action: 'admin.action_token_created',
      status: 'PENDING',
      entityType: targetType,
      entityId: targetId,
      idempotencyKey: tokenKey(token),
      meta: {
        action,
        targetType,
        targetId,
        botId: input.botId || null,
        companyId: input.companyId || null,
        requestId: input.requestId || null
      } as any
    }
  });
  return token;
};

export const resolveAdminActionToken = async (tokenValue?: string | null): Promise<TelegramAdminActionPayload | null> => {
  const token = normalizeToken(tokenValue);
  if (!token) return null;
  const log = await prisma.integrationEventLog.findUnique({
    where: { idempotencyKey: tokenKey(token) }
  });
  return fromLog(token, log);
};

export const claimAdminActionToken = async (
  payload: TelegramAdminActionPayload,
  claimedBy?: Record<string, any>
) => {
  if (!payload?.logId) return false;
  const result = await prisma.integrationEventLog.updateMany({
    where: { id: payload.logId, status: 'PENDING' },
    data: {
      status: 'PROCESSING',
      meta: {
        action: payload.action,
        targetType: payload.targetType,
        targetId: payload.targetId,
        botId: payload.botId || null,
        companyId: payload.companyId || null,
        requestId: payload.requestId || null,
        claimed: true,
        claimedAt: new Date().toISOString(),
        claimedBy: claimedBy || null
      } as any
    }
  }).catch(() => null);
  return Number(result?.count || 0) === 1;
};

export const markAdminActionTokenConsumed = async (
  payload: TelegramAdminActionPayload,
  consumedBy?: Record<string, any>
) => {
  if (!payload?.logId) return;
  await prisma.integrationEventLog.update({
    where: { id: payload.logId },
    data: {
      status: 'SUCCESS',
      meta: {
        action: payload.action,
        targetType: payload.targetType,
        targetId: payload.targetId,
        botId: payload.botId || null,
        companyId: payload.companyId || null,
        requestId: payload.requestId || null,
        consumed: true,
        consumedAt: new Date().toISOString(),
        consumedBy: consumedBy || null
      } as any
    }
  });
};

export const releaseAdminActionTokenClaim = async (
  payload: TelegramAdminActionPayload,
  reason?: Record<string, any>
) => {
  if (!payload?.logId) return false;
  const result = await prisma.integrationEventLog.updateMany({
    where: { id: payload.logId, status: 'PROCESSING' },
    data: {
      status: 'PENDING',
      meta: {
        action: payload.action,
        targetType: payload.targetType,
        targetId: payload.targetId,
        botId: payload.botId || null,
        companyId: payload.companyId || null,
        requestId: payload.requestId || null,
        claimed: false,
        releasedAt: new Date().toISOString(),
        lastError: reason || null
      } as any
    }
  }).catch(() => null);
  return Number(result?.count || 0) === 1;
};
