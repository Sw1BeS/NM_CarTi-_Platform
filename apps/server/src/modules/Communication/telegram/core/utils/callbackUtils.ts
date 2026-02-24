const BASE64_RE = /^[A-Za-z0-9+/=]+$/;
const MAX_CALLBACK_BYTES = 64;

export const ActionTokens = {
  // Lead BUY
  LB_NEXT: 'lb_nxt',
  LB_INTEREST: 'lb_it',
  LB_FAV_TOGGLE: 'lb_fv',
  LB_FAV_OPEN: 'lb_fvs',
  LB_FAV_DEL: 'lb_fvd',
  LB_FAV_SEND: 'lb_sendfav',
  LB_EDIT: 'lb_edit',
  LB_EDIT_BRAND: 'lb_e_b',
  LB_EDIT_MODEL: 'lb_e_m',
  LB_EDIT_YEAR: 'lb_e_y',
  LB_EDIT_BUDGET: 'lb_e_bg',
  LB_EDIT_MILEAGE: 'lb_e_ml',
  LB_EDIT_FUEL: 'lb_e_fu',
  LB_EDIT_CITY: 'lb_e_ct',
  LB_CANCEL: 'lb_cancel',

  // Lead SELL
  LS_SAVE: 'ls_save',
  LS_PUB_CARTIE: 'ls_pubc',
  LS_PUB_B2B: 'ls_pubb',
  LS_REQ_B2B: 'ls_b2br',

  // B2B REG
  BR_APPROVE: 'br_ap',
  BR_REJECT: 'br_rj',

  // B2B REQ
  BQ_PUB: 'bq_pub',
  BV_SEND: 'bv_send',
  BV_FIT: 'bv_fit',
  BV_NFIT: 'bv_nfit'
};

const sanitize = (value: string, max: number) =>
  value.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, max);

const buildV1 = (action: string, id?: string) =>
  (id ? `v1:${action}:${id}` : `v1:${action}`);

export type ParsedCallback = {
  ok: boolean;
  version?: number;
  action?: string;
  id?: string;
  raw: string;
  payload?: Record<string, any>;
  error?: string;
};

export const buildCallbackData = (action: string, id?: string) => {
  const safeAction = sanitize(action, 24);
  const safeId = id ? sanitize(id, 32) : undefined;
  let data = buildV1(safeAction, safeId);

  if (Buffer.byteLength(data, 'utf8') <= MAX_CALLBACK_BYTES) return data;

  const shorterAction = sanitize(action, 12);
  const shorterId = id ? sanitize(id, 16) : undefined;
  data = buildV1(shorterAction, shorterId);

  if (Buffer.byteLength(data, 'utf8') <= MAX_CALLBACK_BYTES) return data;

  return buildV1(shorterAction, shorterId ? shorterId.slice(0, 8) : undefined);
};

const parseV1 = (raw: string): ParsedCallback => {
  const parts = raw.split(':');
  if (parts.length < 2) return { ok: false, raw, error: 'invalid_format' };
  if (parts[0] !== 'v1') return { ok: false, raw, error: 'invalid_prefix' };
  // Backward compatibility: v1:act:token:id
  const offset = parts[1] === 'act' ? 1 : 0;
  const action = parts[1 + offset];
  const id = parts.length > (2 + offset) ? parts.slice(2 + offset).join(':') : undefined;
  if (!action) return { ok: false, raw, error: 'missing_action' };
  return { ok: true, raw, version: 1, action, id };
};

const parseBase64 = (raw: string): ParsedCallback => {
  if (!BASE64_RE.test(raw) || raw.length < 8) return { ok: false, raw, error: 'not_base64' };
  let decoded = '';
  try {
    decoded = Buffer.from(raw, 'base64').toString('utf8');
  } catch {
    return { ok: false, raw, error: 'decode_failed' };
  }
  try {
    const payload = JSON.parse(decoded);
    if (!payload || payload.v !== 1) return { ok: false, raw, error: 'unsupported_version' };
    if (!payload.act) return { ok: false, raw, error: 'missing_action' };
    return { ok: true, raw, version: 1, action: String(payload.act), id: payload.id ? String(payload.id) : undefined, payload };
  } catch {
    return { ok: false, raw, error: 'invalid_json' };
  }
};

export const parseCallbackData = (raw?: string | null): ParsedCallback => {
  const data = String(raw || '').trim();
  if (!data) return { ok: false, raw: '', error: 'empty' };
  if (data.startsWith('v1:')) return parseV1(data);
  const base64 = parseBase64(data);
  if (base64.ok) return base64;
  if (data.startsWith('b2bv_')) {
    return {
      ok: true,
      version: 0,
      action: ActionTokens.BV_SEND,
      id: data.slice('b2bv_'.length) || undefined,
      raw: data
    };
  }
  const actions = Object.values(ActionTokens).sort((a, b) => b.length - a.length);
  for (const action of actions) {
    if (data === action) return { ok: true, version: 0, action, raw: data };
    const prefix = `${action}_`;
    if (data.startsWith(prefix)) {
      return {
        ok: true,
        version: 0,
        action,
        id: data.slice(prefix.length) || undefined,
        raw: data
      };
    }
  }
  return { ok: false, raw: data, error: 'legacy' };
};
