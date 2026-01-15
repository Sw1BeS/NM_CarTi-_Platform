const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

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
  const safeAction = action.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32);
  const safeId = id ? id.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32) : undefined;
  return safeId ? `v1:act:${safeAction}:${safeId}` : `v1:act:${safeAction}`;
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
