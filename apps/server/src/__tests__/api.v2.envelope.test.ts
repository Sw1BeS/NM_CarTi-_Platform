import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('API v2 envelope', () => {
  it('wraps health responses in a v2 envelope', async () => {
    const res = await request(app).get('/api/v2/health');

    expect([200, 503]).toContain(res.status);
    expect(res.body?.meta?.version).toBe('v2');
    if (res.status === 200) {
      expect(res.body?.ok).toBe(true);
      expect(res.body).toHaveProperty('data');
    } else {
      expect(res.body?.ok).toBe(false);
      expect(typeof res.body?.error?.message).toBe('string');
    }
  });

  it('wraps auth failures in a v2 envelope', async () => {
    const res = await request(app).get('/api/v2/requests');

    expect([401, 403]).toContain(res.status);
    expect(res.body?.ok).toBe(false);
    expect(typeof res.body?.error?.message).toBe('string');
    expect(res.body?.meta?.version).toBe('v2');
  });

  it('adds deprecation headers to legacy /api endpoints', async () => {
    const res = await request(app).get('/api/health');

    expect([200, 503]).toContain(res.status);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link || '').toContain('/api/v2');
  });

  it('exposes read-only platform readiness through the health namespace', async () => {
    const res = await request(app).get('/api/health/platform-readiness');

    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(['OK', 'WARN']).toContain(res.body?.status);
      expect(res.body?.sections).toHaveProperty('bots');
      expect(res.body?.sections).toHaveProperty('crm');
      expect(res.body?.sections).toHaveProperty('integrations');
      expect(JSON.stringify(res.body)).not.toContain('token');
      expect(JSON.stringify(res.body)).not.toContain('sessionString');
    }
  });
});
