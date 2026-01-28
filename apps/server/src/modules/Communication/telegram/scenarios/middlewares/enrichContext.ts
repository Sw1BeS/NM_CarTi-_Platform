import { prisma } from '../../../../../services/prisma.js';
import type { PipelineContext, PipelineMiddleware } from '../../core/types.js';

const getUpdateType = (update: any) => {
  if (update?.inline_query) return 'inline_query';
  if (update?.callback_query) return 'callback';
  if (update?.message?.web_app_data) return 'web_app';
  if (update?.message) return 'message';
  return 'unknown';
};

const getLocaleFromCode = (code?: string | null) => {
  const raw = String(code || '').toLowerCase();
  if (raw.startsWith('uk') || raw.startsWith('ua')) return 'UK';
  if (raw.startsWith('ru')) return 'RU';
  return 'EN';
};

let cachedFeatures: { ts: number; features: Record<string, any> } | null = null;
const FEATURE_TTL_MS = 60_000;

const loadFeatureFlags = async () => {
  if (cachedFeatures && Date.now() - cachedFeatures.ts < FEATURE_TTL_MS) {
    return cachedFeatures.features;
  }
  try {
    const settings = await prisma.systemSettings.findFirst({ orderBy: { id: 'desc' } });
    const features = (settings?.features as Record<string, any>) || {};
    cachedFeatures = { ts: Date.now(), features };
    return features;
  } catch (e) {
    console.error('[TelegramPipeline] Failed to load feature flags:', e);
    const features = {};
    cachedFeatures = { ts: Date.now(), features };
    return features;
  }
};

const logIncoming = async (botId: string, chatId: string, text: string, messageId?: number | null, payload?: any) => {
  try {
    await prisma.$executeRaw`
      INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
      VALUES (
        gen_random_uuid()::text,
        ${String(botId)},
        ${String(chatId)},
        'INCOMING',
        ${String(text)},
        ${messageId ?? null},
        ${JSON.stringify(payload || {})}::jsonb,
        NOW()
      )
    `;
  } catch (e) {
    console.error('[TelegramPipeline] Failed to log incoming message:', e);
  }
};

export const enrichContext: PipelineMiddleware = async (ctx: PipelineContext, next) => {
  const update = ctx.update;
  const message = update?.message;
  const callback = update?.callback_query;
  const inline = update?.inline_query;

  ctx.updateType = getUpdateType(update);

  const chatId = message?.chat?.id || callback?.message?.chat?.id || null;
  const userId = message?.from?.id || callback?.from?.id || inline?.from?.id || null;
  const localeCode = message?.from?.language_code || callback?.from?.language_code || inline?.from?.language_code || null;

  ctx.chatId = chatId ? String(chatId) : (userId ? String(userId) : undefined);
  ctx.userId = userId ? String(userId) : undefined;
  ctx.featureFlags = await loadFeatureFlags();

  if (ctx.session === undefined && ctx.bot && ctx.chatId) {
    const existing = await prisma.botSession.findUnique({
      where: { botId_chatId: { botId: ctx.bot.id, chatId: ctx.chatId } }
    });
    if (existing) {
      ctx.session = existing;
    } else {
      ctx.session = await prisma.botSession.create({
        data: {
          botId: ctx.bot.id,
          chatId: ctx.chatId,
          state: 'START',
          history: [],
          variables: {}
        }
      });

      // Auto-create Lead for context
      try {
        const existingLead = await prisma.lead.findFirst({
            where: {
                botId: ctx.bot.id,
                userTgId: ctx.userId || ctx.chatId
            }
        });

        if (!existingLead && ctx.bot.companyId) {
            await prisma.lead.create({
                data: {
                    botId: ctx.bot.id,
                    companyId: ctx.bot.companyId,
                    userTgId: ctx.userId || ctx.chatId,
                    clientName: message?.from?.first_name || message?.from?.username || 'Unknown User',
                    source: ctx.bot.name || 'Telegram Bot',
                    status: 'NEW',
                    phone: message?.contact?.phone_number || undefined
                }
            });
            console.log(`[TelegramPipeline] Auto-created lead for ${ctx.chatId}`);
        }
      } catch(e) {
          console.error('[TelegramPipeline] Lead creation failed:', e);
      }

      // SendPulse Subscription (Placeholder)
      // Note: We usually don't have email/phone at session start.
      // logic omitted until user data is available
      if (ctx.featureFlags?.sendpulseEnabled) {
        // Sync logic would go here
      }
    }
  }

  const vars = ctx.session?.variables && typeof ctx.session.variables === 'object' && !Array.isArray(ctx.session.variables)
    ? (ctx.session.variables as Record<string, any>)
    : {};
  ctx.locale = vars.language || vars.lang || getLocaleFromCode(localeCode);

  if (ctx.bot && ctx.chatId) {
    let text = '';
    let messageId: number | null = null;
    if (message?.text) {
      text = message.text;
      messageId = message.message_id;
    } else if (message?.caption) {
      text = message.caption;
      messageId = message.message_id;
    } else if (message?.contact?.phone_number) {
      text = `contact:${message.contact.phone_number}`;
      messageId = message.message_id;
    } else if (callback?.data) {
      text = `callback:${callback.data}`;
      messageId = callback.message?.message_id ?? null;
    } else if (inline?.query) {
      text = `inline:${inline.query}`;
    } else {
      text = '[update]';
    }

    await logIncoming(ctx.bot.id, ctx.chatId, text, messageId, {
      updateId: update?.update_id,
      from: message?.from || callback?.from || inline?.from,
      chat: message?.chat || callback?.message?.chat,
      data: callback?.data,
      web_app_data: message?.web_app_data,
      inline_query: inline ? { id: inline.id, query: inline.query } : undefined
    });
  }

  await next();
};
