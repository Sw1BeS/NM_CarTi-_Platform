import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { createOrMergeLead } from '../modules/Communication/telegram/core/leadService.js';
import { MetaCapiService } from '../modules/Integrations/meta/metaCapi.service.js';
import { normalizePhone } from '../modules/Inventory/normalization/normalizePhone.js';
import { isEnvFlagEnabled } from '../services/featureFlags.js';

const router = Router();
const allowedEvents = new Set(['PageView', 'ViewContent', 'Lead']);

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);
const firstIp = (request: Request) => request.get('x-forwarded-for')?.split(',')[0]?.trim() || request.ip || undefined;
const constantTimeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const authorize = (request: Request) => {
  if (!isEnvFlagEnabled('WEBSITE_LEAD_API_ENABLED', false)) return false;
  const expected = text(process.env.WEBSITE_LEAD_API_KEY, 256);
  const provided = text(request.get('x-cartie-website-key'), 256);
  return Boolean(expected && provided && constantTimeEqual(expected, provided));
};

const attributionSnapshot = (request: Request, body: Record<string, unknown>) => {
  const raw = body.attribution && typeof body.attribution === 'object' ? body.attribution as Record<string, unknown> : {};
  const query = Object.fromEntries(Object.entries(raw).filter(([key]) => key.startsWith('utm_') || ['gclid', 'fbclid'].includes(key)));
  const identifiers = Object.fromEntries(Object.entries(raw).filter(([key]) => ['fbc', 'fbp'].includes(key)).map(([key, value]) => [key, text(value, 255)]));
  return {
    token: text(body.eventId, 120) || crypto.randomUUID(),
    destination: 'adsquiz_usa',
    query,
    identifiers: { ...identifiers, client_ip_address: firstIp(request), client_user_agent: text(request.get('user-agent'), 500) },
    event_source_url: text(raw.landingPage || body.sourceUrl, 500),
    created_at: new Date().toISOString()
  };
};

router.post('/events', async (request, response) => {
  if (!authorize(request)) return response.status(404).json({ error: 'not_found' });
  const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
  const eventName = text(body.eventName, 40);
  if (!allowedEvents.has(eventName)) return response.status(400).json({ error: 'unsupported_event' });
  const companyId = text(process.env.WEBSITE_LEAD_COMPANY_ID, 120);
  if (!companyId) return response.status(503).json({ error: 'website_company_not_configured' });
  const eventId = text(body.eventId, 120) || crypto.randomUUID();
  const attribution = attributionSnapshot(request, body);
  const result = await new MetaCapiService().trackDatasetWebsiteEvent('main_quiz', companyId, eventName, {
    eventId: `website:${eventId}:${eventName}:main_quiz`,
    entityType: 'website_event',
    entityId: eventId,
    externalId: `website:${eventId}`,
    phone: text(body.phone, 40) || undefined,
    email: text(body.email, 180) || undefined,
    name: text(body.name, 120) || undefined,
    fbc: text(attribution.identifiers.fbc, 255) || undefined,
    fbp: text(attribution.identifiers.fbp, 255) || undefined,
    clientIpAddress: text(attribution.identifiers.client_ip_address, 120) || undefined,
    clientUserAgent: text(attribution.identifiers.client_user_agent, 500) || undefined,
    eventSourceUrl: attribution.event_source_url,
    actionSource: 'website',
    stage: `website:${eventName.toLowerCase()}:main_quiz`,
    customData: { source: 'cartie_web', surface: 'website', destination: 'adsquiz_usa' }
  });
  return response.status(result.success || result.skipped ? 200 : 502).json({ ok: Boolean(result.success), delivered: Boolean(result.success), eventId, reason: result.reason });
});

router.post('/leads', async (request, response) => {
  if (!authorize(request)) return response.status(404).json({ error: 'not_found' });
  const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
  const companyId = text(process.env.WEBSITE_LEAD_COMPANY_ID, 120);
  const botId = text(process.env.WEBSITE_LEAD_BOT_ID, 120);
  const name = text(body.name, 120);
  const phone = normalizePhone(text(body.phone, 40));
  const consent = body.consent === true;
  if (!companyId || !botId) return response.status(503).json({ error: 'website_lead_not_configured' });
  if (name.length < 2 || phone.replace(/\D/g, '').length < 10 || !consent) return response.status(400).json({ error: 'invalid_lead' });
  const answers = body.quizAnswers && typeof body.quizAnswers === 'object' ? body.quizAnswers as Record<string, unknown> : {};
  const attribution = attributionSnapshot(request, body);
  const eventId = text(body.eventId, 120) || crypto.randomUUID();
  const requestTitle = text(answers['Тип автомобіля'] || answers.type || 'Підбір автомобіля', 120);
  const lead = await createOrMergeLead({
    botId,
    companyId,
    name,
    phone,
    email: text(body.email, 180) || undefined,
    request: requestTitle,
    source: 'WEBSITE',
    leadType: 'BUY',
    createRequest: true,
    payload: {
      source: 'cartie_web',
      surface: 'website',
      direction: 'WEBSITE',
      destination_key: 'main_quiz_adsquiz',
      request_type: 'client_auto_selection',
      eventId,
      consent: true,
      quizAnswers: Object.fromEntries(Object.entries(answers).map(([key, value]) => [text(key, 80), text(value, 180)])),
      attribution
    },
    requestData: { title: requestTitle, description: text(body.message, 1800) || undefined, language: 'UK' }
  });
  return response.status(202).json({ ok: true, leadId: lead.lead.id, requestId: lead.request?.publicId || lead.request?.id || null, eventId });
});

export default router;
