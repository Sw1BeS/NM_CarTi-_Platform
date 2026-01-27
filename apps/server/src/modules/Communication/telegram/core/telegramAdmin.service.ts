import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../../../../services/prisma.js';
import { BotRepository } from '../../../../repositories/index.js';

const botRepo = new BotRepository(prisma);

const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

const ensureBaseUrl = (value?: string | null) => {
  if (!value) return null;
  return value.endsWith('/') ? value.slice(0, -1) : value;
};

const generateSecret = () => crypto.randomBytes(24).toString('hex');

export const setWebhookForBot = async (botId: string, opts: { publicBaseUrl?: string; secretToken?: string | null }) => {
  const bot = await botRepo.findById(botId);
  if (!bot?.token) throw new Error('Bot not found');

  const config = (bot.config || {}) as any;
  const base = ensureBaseUrl(opts.publicBaseUrl || config.publicBaseUrl || process.env.PUBLIC_BASE_URL);
  if (!base) throw new Error('publicBaseUrl is required');

  const secret = opts.secretToken || config.webhookSecret || generateSecret();
  const url = `${base}/api/telegram/webhook/${bot.id}`;

  const response = await axios.post(`${TELEGRAM_API(bot.token)}/setWebhook`, {
    url,
    secret_token: secret,
    drop_pending_updates: true,
    // Include channel and membership updates because the pipeline handles them.
    allowed_updates: ['message', 'callback_query', 'inline_query', 'channel_post', 'my_chat_member']
  }, { timeout: 15000 });

  if (!response.data?.ok) {
    throw new Error(response.data?.description || 'Failed to set webhook');
  }

  const nextConfig = {
    ...config,
    deliveryMode: 'webhook',
    webhookSecret: secret,
    webhookUrl: url,
    webhookSetAt: new Date().toISOString()
  };

  await botRepo.update(bot.id, { config: nextConfig });

  return { webhookUrl: url, secretToken: secret };
};

export const deleteWebhookForBot = async (botId: string) => {
  const bot = await botRepo.findById(botId);
  if (!bot?.token) throw new Error('Bot not found');

  const response = await axios.post(`${TELEGRAM_API(bot.token)}/deleteWebhook`, {
    drop_pending_updates: true
  }, { timeout: 15000 });

  if (!response.data?.ok) {
    throw new Error(response.data?.description || 'Failed to delete webhook');
  }

  const config = (bot.config || {}) as any;
  const nextConfig = {
    ...config,
    deliveryMode: 'polling',
    webhookUrl: undefined,
    webhookSecret: undefined
  };

  await botRepo.update(bot.id, { config: nextConfig });

  return { success: true };
};
