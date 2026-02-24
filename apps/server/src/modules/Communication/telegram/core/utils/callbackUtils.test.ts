import { describe, expect, it } from 'vitest';
import { buildCallbackData, parseCallbackData } from './callbackUtils.js';

const toBase64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

describe('callbackUtils', () => {
  it('parses v1 callback format', () => {
    const parsed = parseCallbackData('v1:lb_sendfav:123');
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('lb_sendfav');
    expect(parsed.id).toBe('123');
  });

  it('keeps backward support for old v1:act format', () => {
    const parsed = parseCallbackData('v1:act:lead_send:123');
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('lead_send');
    expect(parsed.id).toBe('123');
  });

  it('parses base64 json format', () => {
    const raw = toBase64(JSON.stringify({ v: 1, act: 'ping', id: '42' }));
    const parsed = parseCallbackData(raw);
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('ping');
    expect(parsed.id).toBe('42');
  });

  it('flags legacy callback data', () => {
    const parsed = parseCallbackData('LEGACY_DATA');
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe('legacy');
  });

  it('builds sanitized callback data', () => {
    const data = buildCallbackData('lb_sendfav', '123');
    expect(data).toBe('v1:lb_sendfav:123');
  });
});
