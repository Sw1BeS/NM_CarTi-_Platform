export type MiniAppPayloadV1 = {
  v: 1;
  type: 'lead_submit' | 'interest_click' | 'sell_submit';
  carId?: string;
  fields?: Record<string, any>;
  meta?: Record<string, any>;
};

type ParseResult =
  | { ok: true; payload: MiniAppPayloadV1 }
  | { ok: false; error: string };

const isObject = (value: any) => value && typeof value === 'object' && !Array.isArray(value);

export const parseMiniAppPayload = (raw: any): ParseResult => {
  if (!isObject(raw)) return { ok: false, error: 'payload_not_object' };
  if (raw.v !== 1) return { ok: false, error: 'unsupported_version' };

  const type = String(raw.type || '').toLowerCase();
  if (!['lead_submit', 'interest_click', 'sell_submit'].includes(type)) {
    return { ok: false, error: 'unsupported_type' };
  }

  const payload: MiniAppPayloadV1 = {
    v: 1,
    type: type as MiniAppPayloadV1['type'],
    carId: raw.carId ? String(raw.carId) : undefined,
    fields: isObject(raw.fields) ? raw.fields : undefined,
    meta: isObject(raw.meta) ? raw.meta : undefined
  };

  return { ok: true, payload };
};
