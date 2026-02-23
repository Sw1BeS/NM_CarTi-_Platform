import { BotTemplate, PrismaClient } from '@prisma/client';
import {
  buildTelegramChannelPostUrl,
  normalizeBotConfigChatId,
  sanitizeTelegramUsername
} from '../src/modules/Communication/telegram/core/utils/telegramChatId.js';

type CanonicalTargets = {
  channelId: string;
  adminChatId: string;
};

const prisma = new PrismaClient();

const CANONICAL_BY_TEMPLATE: Partial<Record<BotTemplate, CanonicalTargets>> = {
  CLIENT_LEAD: {
    channelId: '-1003662808163',
    adminChatId: '-1003785260526'
  },
  B2B: {
    channelId: '-1003818257920',
    adminChatId: '-1003702407477'
  }
};

const hasArg = (name: string) => process.argv.includes(name);
const APPLY = hasArg('--apply');

const getChatInfo = async (token: string, chatId: string) => {
  const url = `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!data?.ok) {
      return { ok: false as const, description: String(data?.description || 'unknown error') };
    }
    return {
      ok: true as const,
      type: String(data.result?.type || ''),
      title: String(data.result?.title || data.result?.username || data.result?.id || '')
    };
  } catch (error: any) {
    return { ok: false as const, description: String(error?.message || error || 'network error') };
  }
};

const isAllowedAdminType = (chatType?: string) => ['supergroup', 'group', 'private'].includes(String(chatType || ''));

const rebuildChannelUrls = async (params: {
  botId: string;
  channelId: string;
  botUsername?: string;
  apply: boolean;
}) => {
  const posts = await prisma.channelPost.findMany({
    where: { botId: params.botId },
    select: {
      id: true,
      requestId: true,
      messageId: true,
      payload: true,
      channelId: true
    },
    orderBy: { createdAt: 'asc' }
  });

  let touched = 0;
  for (const post of posts) {
    const url = buildTelegramChannelPostUrl({
      chatId: params.channelId,
      messageId: post.messageId,
      username: params.botUsername
    });
    if (!url) continue;

    touched += 1;
    if (!params.apply) continue;

    const currentPayload = (post.payload && typeof post.payload === 'object' && !Array.isArray(post.payload))
      ? (post.payload as Record<string, any>)
      : {};

    await prisma.channelPost.update({
      where: { id: post.id },
      data: {
        channelId: params.channelId,
        payload: {
          ...currentPayload,
          channelPostUrl: url
        }
      }
    });

    if (post.requestId) {
      await prisma.b2bRequest.update({
        where: { id: post.requestId },
        data: { channelPostUrl: url }
      }).catch(() => null);
    }
  }

  return { total: posts.length, touched };
};

const main = async () => {
  console.log(`\n[telegram_normalize_chat_ids] mode=${APPLY ? 'APPLY' : 'DRY_RUN'}\n`);

  const bots = await prisma.botConfig.findMany({
    where: {
      template: { in: [BotTemplate.CLIENT_LEAD, BotTemplate.B2B] }
    },
    orderBy: { createdAt: 'asc' }
  });

  if (!bots.length) {
    console.log('No CLIENT_LEAD/B2B bots found.');
    return;
  }

  for (const bot of bots) {
    const canonical = CANONICAL_BY_TEMPLATE[bot.template];
    if (!canonical) continue;

    const botLabel = `${bot.name || bot.id} (${bot.template})`;
    const currentChannel = normalizeBotConfigChatId(bot.channelId);
    const currentAdmin = normalizeBotConfigChatId(bot.adminChatId);

    const desiredChannel = normalizeBotConfigChatId(canonical.channelId);
    const desiredAdmin = normalizeBotConfigChatId(canonical.adminChatId);

    if (!desiredChannel || !desiredAdmin) {
      console.log(`- ${botLabel}: skipped (invalid canonical values)`);
      continue;
    }

    const [channelCheck, adminCheck] = await Promise.all([
      getChatInfo(bot.token, desiredChannel),
      getChatInfo(bot.token, desiredAdmin)
    ]);

    if (!channelCheck.ok || channelCheck.type !== 'channel') {
      console.log(`- ${botLabel}: skipped (channel verification failed: ${channelCheck.ok ? `type=${channelCheck.type}` : channelCheck.description})`);
      continue;
    }

    if (!adminCheck.ok || !isAllowedAdminType(adminCheck.type)) {
      console.log(`- ${botLabel}: skipped (admin verification failed: ${adminCheck.ok ? `type=${adminCheck.type}` : adminCheck.description})`);
      continue;
    }

    const willChange = currentChannel !== desiredChannel || currentAdmin !== desiredAdmin;

    console.log(`- ${botLabel}`);
    console.log(`  channelId: ${currentChannel || 'null'} -> ${desiredChannel} (${channelCheck.title})`);
    console.log(`  adminChatId: ${currentAdmin || 'null'} -> ${desiredAdmin} (${adminCheck.title})`);

    if (APPLY && willChange) {
      await prisma.botConfig.update({
        where: { id: bot.id },
        data: {
          channelId: desiredChannel,
          adminChatId: desiredAdmin
        }
      });
    }

    const cfg = ((bot.config as any) || {}) as Record<string, any>;
    const botUsername = sanitizeTelegramUsername(String(cfg.botUsername || cfg.username || ''));

    const urlStats = await rebuildChannelUrls({
      botId: bot.id,
      channelId: desiredChannel,
      botUsername,
      apply: APPLY
    });

    console.log(`  channel post urls: ${APPLY ? 'updated' : 'would update'} ${urlStats.touched}/${urlStats.total}`);
  }

  console.log(`\n[telegram_normalize_chat_ids] done (${APPLY ? 'APPLY' : 'DRY_RUN'})\n`);
};

main()
  .catch((error) => {
    console.error('[telegram_normalize_chat_ids] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
