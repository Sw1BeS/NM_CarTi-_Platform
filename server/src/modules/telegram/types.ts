import type { BotConfig, BotSession } from '@prisma/client';

type UpdateType = 'message' | 'callback' | 'inline_query' | 'web_app' | 'unknown';

type NormalizedFields = {
  phone?: string;
  brand?: string;
  model?: string;
  city?: string;
};

export type PipelineContext = {
  update: any;
  bot?: BotConfig | null;
  botId?: string;
  companyId?: string | null;
  session?: BotSession | null;
  chatId?: string;
  userId?: string;
  locale?: string;
  featureFlags?: Record<string, any>;
  updateType?: UpdateType;
  normalized?: NormalizedFields;
  dedup?: { isDuplicate: boolean; updateId?: number };
  receivedAt: Date;
  request?: {
    secretToken?: string | null;
    source?: 'polling' | 'webhook';
  };
};

export type PipelineMiddleware = (ctx: PipelineContext, next: () => Promise<void>) => Promise<void>;
