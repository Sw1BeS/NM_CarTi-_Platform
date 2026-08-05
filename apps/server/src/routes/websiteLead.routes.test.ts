import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createOrMergeLeadMock, trackDatasetWebsiteEventMock } = vi.hoisted(() => ({
  createOrMergeLeadMock: vi.fn(),
  trackDatasetWebsiteEventMock: vi.fn()
}));

vi.mock('../modules/Communication/telegram/core/leadService.js', () => ({ createOrMergeLead: createOrMergeLeadMock }));
vi.mock('../modules/Integrations/meta/metaCapi.service.js', () => ({ MetaCapiService: vi.fn().mockImplementation(() => ({ trackDatasetWebsiteEvent: trackDatasetWebsiteEventMock })) }));
vi.mock('../services/featureFlags.js', () => ({ isEnvFlagEnabled: (name: string) => name === 'WEBSITE_LEAD_API_ENABLED' && process.env.WEBSITE_LEAD_API_ENABLED === 'true' }));

describe('website lead adapter', () => {
  const app = express();
  app.use(express.json());
  beforeEach(async () => {
    process.env.WEBSITE_LEAD_API_ENABLED = 'true';
    process.env.WEBSITE_LEAD_API_KEY = 'website-secret';
    process.env.WEBSITE_LEAD_COMPANY_ID = 'company_1';
    process.env.WEBSITE_LEAD_BOT_ID = 'bot_1';
    trackDatasetWebsiteEventMock.mockResolvedValue({ success: true });
    createOrMergeLeadMock.mockResolvedValue({ lead: { id: 'lead_1' }, request: { publicId: 'REQ-1' } });
    const { default: router } = await import('./websiteLead.routes.js');
    app.use('/api/website', router);
  });

  it('keeps the adapter closed without the server-side key', async () => {
    const response = await request(app).post('/api/website/events').send({ eventName: 'PageView' });
    expect(response.status).toBe(404);
  });

  it('routes website events to the existing main quiz dataset service', async () => {
    const response = await request(app).post('/api/website/events').set('x-cartie-website-key', 'website-secret').send({ eventName: 'PageView', eventId: 'evt-1', sourceUrl: 'https://cartie-web.example/?utm_source=meta' });
    expect(response.status).toBe(200);
    expect(trackDatasetWebsiteEventMock).toHaveBeenCalledWith('main_quiz', 'company_1', 'PageView', expect.objectContaining({ eventId: 'website:evt-1:PageView:main_quiz', actionSource: 'website' }));
  });

  it('creates a CRM lead/request through the canonical LeadService', async () => {
    const response = await request(app).post('/api/website/leads').set('x-cartie-website-key', 'website-secret').send({ source: 'quiz', name: 'QA Client', phone: '+380930044544', consent: true, eventId: 'evt-2', quizAnswers: { 'Тип автомобіля': 'Кросовер / SUV' } });
    expect(response.status).toBe(202);
    expect(createOrMergeLeadMock).toHaveBeenCalledWith(expect.objectContaining({ botId: 'bot_1', companyId: 'company_1', source: 'WEBSITE', createRequest: true }));
    expect(response.body).toMatchObject({ ok: true, leadId: 'lead_1', requestId: 'REQ-1' });
  });
});
