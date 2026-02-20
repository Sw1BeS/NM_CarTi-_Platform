import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('API v2 envelope', () => {
  it('wraps successful responses in a v2 envelope', async () => {
    const res = await request(app).get('/api/v2/health');

    expect([200, 503]).toContain(res.status);
    expect(res.body?.ok).toBe(true);
    expect(res.body?.meta?.version).toBe('v2');
    expect(res.body).toHaveProperty('data');
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
});
