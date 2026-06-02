import type { MiniAppTrackingMeta } from '../../../services/miniappApi';

type TelegramWebAppLike = {
  sendData?: (data: string) => void;
};

export type TelegramKeyboardLeadSubmitKind = 'PICK' | 'PRICE_TERMS';

export type TelegramKeyboardLeadSubmitInput = {
  kind: TelegramKeyboardLeadSubmitKind;
  carListingIds?: string[];
  criteria?: Record<string, unknown>;
  comment?: string;
  tracking?: MiniAppTrackingMeta;
};

export type TelegramKeyboardSubmitResult =
  | { status: 'sent'; ok: true; bytes: number }
  | { status: 'error'; ok: false; reason: 'bridge_unavailable' | 'payload_too_large' | 'send_failed'; bytes?: number; error?: string };

const TELEGRAM_SEND_DATA_LIMIT_BYTES = 4096;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const compactValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const items = value
      .map(compactValue)
      .filter(item => item !== undefined && item !== null && item !== '');
    return items.length ? items : undefined;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compactValue(item)] as const)
      .filter(([, item]) => item !== undefined && item !== null && item !== '');
    return entries.length ? Object.fromEntries(entries) : undefined;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  return value;
};

const compactRecord = (value: Record<string, unknown>) =>
  (compactValue(value) || {}) as Record<string, unknown>;

const safeTracking = (tracking?: MiniAppTrackingMeta) => compactRecord({
  startParam: tracking?.startParam,
  ref: tracking?.ref,
  utm: tracking?.utm,
  entrypoint: tracking?.entrypoint,
  referrer: tracking?.referrer,
  miniappVersion: tracking?.miniappVersion,
  buildSha: tracking?.buildSha,
  submitId: tracking?.submitId,
  requestType: tracking?.requestType,
  eventId: tracking?.eventId,
  fbclid: tracking?.fbclid,
  fbp: tracking?.fbp,
  fbc: tracking?.fbc,
  eventSourceUrl: tracking?.eventSourceUrl,
  actionSource: tracking?.actionSource,
  source: 'miniapp_keyboard_bridge'
});

export const canUseTelegramKeyboardSubmit = (tg?: TelegramWebAppLike | null) =>
  typeof tg?.sendData === 'function';

export const buildTelegramKeyboardLeadSubmitPayload = (input: TelegramKeyboardLeadSubmitInput) => {
  const carIds = (input.carListingIds || [])
    .map(item => String(item || '').trim())
    .filter(Boolean);
  const criteria = compactRecord(input.criteria || {});
  const payloadType = input.kind === 'PRICE_TERMS' && carIds.length
    ? 'interest_click'
    : 'lead_submit';

  return compactRecord({
    v: 1,
    type: payloadType,
    carId: carIds[0],
    carIds,
    fields: {
      ...criteria,
      comment: input.comment
    },
    meta: safeTracking(input.tracking)
  });
};

export const sendTelegramKeyboardPayload = (
  tg: TelegramWebAppLike | null | undefined,
  payload: Record<string, unknown>
): TelegramKeyboardSubmitResult => {
  if (!canUseTelegramKeyboardSubmit(tg)) return { status: 'error', ok: false, reason: 'bridge_unavailable' };

  const data = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(data).length;
  if (bytes > TELEGRAM_SEND_DATA_LIMIT_BYTES) {
    return { status: 'error', ok: false, reason: 'payload_too_large', bytes };
  }

  try {
    tg!.sendData!(data);
    return { status: 'sent', ok: true, bytes };
  } catch (error) {
    return {
      status: 'error',
      ok: false,
      reason: 'send_failed',
      bytes,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
