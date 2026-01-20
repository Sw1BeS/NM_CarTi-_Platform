const BASE64_RE = /^[A-Za-z0-9+/=]+$/;
const MAX_CALLBACK_BYTES = 64;

const sanitize = (value: string, max: number) =>
  value.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, max);

const buildV1 = (action: string, id?: string) =>
  (id ? `v1:act:${action}:${id}` : `v1:act:${action}`);

const buildBase64 = (action: string, id?: string) => {
  const payload: Record<string, any> = { v: 1, act: action };
  if (id) payload.id = id;
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
};

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
  const safeId = id ? sanitize(id, 24) : undefined;
  let data = buildV1(safeAction, safeId);

  if (Buffer.byteLength(data, 'utf8') <= MAX_CALLBACK_BYTES) return data;

  const base64 = buildBase64(safeAction, safeId);
  if (Buffer.byteLength(base64, 'utf8') <= MAX_CALLBACK_BYTES) return base64;

  const shorterAction = sanitize(action, 12);
  const shorterId = id ? sanitize(id, 16) : undefined;
  data = buildV1(shorterAction, shorterId);

  if (Buffer.byteLength(data, 'utf8') <= MAX_CALLBACK_BYTES) return data;

  return buildV1(shorterAction, shorterId ? shorterId.slice(0, 8) : undefined);
};

const parseV1 = (raw: string): ParsedCallback => {
  const parts = raw.split(':');
  if (parts.length < 3) return { ok: false, raw, error: 'invalid_format' };
  if (parts[0] !== 'v1' || parts[1] !== 'act') return { ok: false, raw, error: 'invalid_prefix' };
  const action = parts[2];
  const id = parts.length > 3 ? parts.slice(3).join(':') : undefined;
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
  if (data.startsWith('v1:act:')) return parseV1(data);
  const base64 = parseBase64(data);
  if (base64.ok) return base64;
  return { ok: false, raw: data, error: 'legacy' };
};
