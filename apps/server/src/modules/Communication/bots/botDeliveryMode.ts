export type RuntimeBotDeliveryMode = 'polling' | 'webhook';
export type BotDeliveryModeColumn = 'POLLING' | 'WEBHOOK';

const readLegacyDeliveryMode = (config: unknown) => {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return '';
  return String((config as any).deliveryMode || '').trim().toLowerCase();
};

export const normalizeBotDeliveryModeColumn = (value: unknown): BotDeliveryModeColumn | undefined => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'WEBHOOK') return 'WEBHOOK';
  if (normalized === 'POLLING') return 'POLLING';
  return undefined;
};

export const resolveRuntimeBotDeliveryMode = (bot: {
  deliveryMode?: unknown;
  config?: unknown;
}): RuntimeBotDeliveryMode => {
  const column = normalizeBotDeliveryModeColumn(bot.deliveryMode);
  if (column === 'WEBHOOK') return 'webhook';
  if (column === 'POLLING') return 'polling';

  return readLegacyDeliveryMode(bot.config) === 'webhook' ? 'webhook' : 'polling';
};
