import { verifyTelegramInitData } from '../modules/Communication/telegram/core/telegramAuth.js';
import { getEnvInt } from './featureFlags.js';
import { prisma } from './prisma.js';

type MiniAppInitScope = {
  companyId?: string | null;
  botId?: string | null;
};

export type MiniAppInitDataCheck = {
  ok: boolean;
  message?: string;
  verifiedBotId?: string;
  matchedBy?: 'bot' | 'company';
};

export const getMiniAppInitDataMaxAgeSeconds = () =>
  Math.max(60, getEnvInt('TELEGRAM_INITDATA_MAX_AGE_SECONDS', 43200));

export const verifyMiniAppInitDataForScope = async (
  initData: string | undefined,
  scope: MiniAppInitScope,
  maxAgeSeconds = getMiniAppInitDataMaxAgeSeconds()
): Promise<MiniAppInitDataCheck> => {
  if (!initData) return { ok: false, message: 'initData is required' };

  if (scope.botId) {
    const bot = await prisma.botConfig.findFirst({
      where: { id: scope.botId, isEnabled: true },
      select: { id: true, token: true }
    });

    if (bot && verifyTelegramInitData(initData, bot.token, maxAgeSeconds)) {
      return { ok: true, verifiedBotId: bot.id, matchedBy: 'bot' };
    }
  }

  const companyBots = await prisma.botConfig.findMany({
    where: {
      isEnabled: true,
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(scope.botId ? { id: { not: scope.botId } } : {})
    },
    select: { id: true, token: true }
  });

  for (const bot of companyBots) {
    if (verifyTelegramInitData(initData, bot.token, maxAgeSeconds)) {
      return { ok: true, verifiedBotId: bot.id, matchedBy: 'company' };
    }
  }

  if (scope.botId && companyBots.length === 0) {
    return { ok: false, message: 'Bot not found or disabled' };
  }

  return { ok: false, message: 'Invalid Telegram init data' };
};
