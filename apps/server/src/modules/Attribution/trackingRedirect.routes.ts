import express, { type NextFunction, type Request, type Response } from 'express';
import {
  type AttributionRedirectConfig,
  getAttributionRedirectConfig
} from '../../config/env.js';
import {
  attributionSessionService,
  type AttributionCreateResult
} from './attributionSession.service.js';
import { isEnvFlagEnabled } from '../../services/featureFlags.js';
import { logger } from '../../utils/logger.js';
import { MetaCapiService, type MetaDatasetTargetKey } from '../Integrations/meta/metaCapi.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TrackingRedirectService = {
  createSession(input: Parameters<typeof attributionSessionService.createSession>[0]): Promise<AttributionCreateResult>;
};

type TrackingRedirectKind = 'bot' | 'web';

type TrackingRedirectMetaEventInput = {
  kind: TrackingRedirectKind;
  destination: string;
  result: AttributionCreateResult;
  req: Request;
};

type TrackingRedirectDeps = {
  service?: TrackingRedirectService;
  config?: AttributionRedirectConfig;
  getConfig?: () => AttributionRedirectConfig;
  trackMetaEvents?: (input: TrackingRedirectMetaEventInput) => Promise<void>;
};

const firstQueryText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (Array.isArray(value)) {
    return firstQueryText(value[0]);
  }
  return undefined;
};

const parseCookieHeader = (header: string | undefined): Record<string, string> => {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((acc, part) => {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex <= 0) return acc;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
};

const requestIp = (req: Request): string | undefined => {
  const forwardedFor = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || req.ip || req.socket.remoteAddress || undefined;
};

const requestUrl = (req: Request): string => {
  const protocol = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol || 'https';
  const host = req.get('host') || 'localhost';
  return `${protocol}://${host}${req.originalUrl}`;
};

const setAttributionCookie = (res: Response, name: '_fbp' | '_fbc', value: string, ttlDays: number): void => {
  res.cookie(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ttlDays * MS_PER_DAY,
    path: '/'
  });
};

const failDisabled = (config: AttributionRedirectConfig, res: Response, next: NextFunction): void => {
  if (config.failMode === 'passthrough') {
    next();
    return;
  }
  res.status(404).json({ error: 'not_found' });
};

const attributionRequestInput = (req: Request) => {
  const cookies = parseCookieHeader(req.get('cookie'));
  return {
    source: firstQueryText(req.query.utm_source) || firstQueryText(req.query.source) || null,
    query: req.query as Record<string, unknown>,
    requestMeta: {
      ip: requestIp(req),
      userAgent: req.get('user-agent') || null,
      eventSourceUrl: requestUrl(req),
      referrer: req.get('referer') || req.get('referrer') || null
    },
    cookies: {
      fbp: cookies._fbp,
      fbc: cookies._fbc
    }
  };
};

const applyAttributionCookies = (
  res: Response,
  result: AttributionCreateResult,
  config: AttributionRedirectConfig
): void => {
  if (result.cookies.fbp) {
    setAttributionCookie(res, '_fbp', result.cookies.fbp, config.ttlDays);
  }
  if (result.cookies.fbc) {
    setAttributionCookie(res, '_fbc', result.cookies.fbc, config.ttlDays);
  }
};

const readEnvText = (name: string) => String(process.env[name] || '').trim();

const resolveTrackingMetaCompanyId = () =>
  readEnvText('ATTRIBUTION_META_COMPANY_ID') || readEnvText('META_B2C_BOT_COMPANY_ID') || null;

const resolveAttributionMetaTarget = (input: TrackingRedirectMetaEventInput): MetaDatasetTargetKey | null => {
  if (input.kind === 'bot') return 'b2c_bot';
  if (input.kind === 'web' && input.destination === 'adsquiz_usa') return 'main_quiz';
  return null;
};

const safeRedirectHostname = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
};

const buildRedirectCustomData = (input: TrackingRedirectMetaEventInput, eventRole: string) => {
  const query = input.result.snapshot.query || {};
  return {
    source: 'attribution_redirect',
    event_role: eventRole,
    destination: input.destination,
    redirect_kind: input.kind,
    redirect_host: safeRedirectHostname(input.result.redirectUrl),
    utm_source: query.utm_source,
    utm_medium: query.utm_medium,
    utm_campaign: query.utm_campaign,
    utm_content: query.utm_content,
    utm_term: query.utm_term,
    utm_id: query.utm_id,
    campaign_id: query.campaign_id,
    adset_id: query.adset_id,
    ad_id: query.ad_id,
    placement: query.placement
  };
};

export const trackAttributionRedirectMetaEvents = async (input: TrackingRedirectMetaEventInput) => {
  if (!isEnvFlagEnabled('META_CAPI_ENABLED', false)) return;

  const targetKey = resolveAttributionMetaTarget(input);
  if (!targetKey) {
    logger.warn('[Attribution] Meta redirect event target skipped', {
      destination: input.destination,
      kind: input.kind
    });
    return;
  }

  const identifiers = input.result.snapshot.identifiers || {};
  const base = {
    externalId: `attribution:${input.result.token}`,
    fbp: identifiers.fbp || input.result.cookies.fbp,
    fbc: identifiers.fbc || input.result.cookies.fbc,
    ip: identifiers.client_ip_address || requestIp(input.req),
    userAgent: identifiers.client_user_agent || input.req.get('user-agent') || undefined,
    eventSourceUrl: input.result.snapshot.event_source_url || requestUrl(input.req),
    actionSource: 'website',
    entityType: 'attribution_redirect',
    entityId: input.result.token
  };
  const meta = new MetaCapiService();
  const companyId = resolveTrackingMetaCompanyId();
  const events = [
    meta.trackDatasetWebsiteEvent(targetKey, companyId, 'PageView', {
      ...base,
      eventId: `attribution:${input.result.token}:PageView:${input.destination}:${targetKey}`,
      stage: `${input.destination}:pageview:${targetKey}`,
      customData: buildRedirectCustomData(input, 'bridge_pageview')
    })
  ];

  if (input.kind === 'web') {
    events.push(meta.trackDatasetWebsiteEvent(targetKey, companyId, 'adsquiz_Start', {
      ...base,
      eventId: `attribution:${input.result.token}:adsquiz_Start:${input.destination}:${targetKey}`,
      stage: `${input.destination}:adsquiz_start:${targetKey}`,
      customData: buildRedirectCustomData(input, 'adsquiz_start')
    }));
  }

  await Promise.all(events);
};

export const createTrackingRedirectRouter = (deps: TrackingRedirectDeps = {}) => {
  const router = express.Router();
  const service = deps.service || attributionSessionService;
  const resolveConfig = () => deps.config || deps.getConfig?.() || getAttributionRedirectConfig();
  const trackMetaEvents = deps.trackMetaEvents || trackAttributionRedirectMetaEvents;

  router.get('/bot', async (req, res, next) => {
    const config = resolveConfig();
    if (!config.enabled) {
      failDisabled(config, res, next);
      return;
    }

    if (!config.botAllowlist.length) {
      res.status(503).json({ error: 'attribution_redirect_not_configured' });
      return;
    }

    const destination = firstQueryText(req.query.destination)
      || firstQueryText(req.query.dest)
      || config.defaultDestination;
    const allowedDestination = config.botAllowlist.find(entry => entry.destination === destination);
    if (!destination || !allowedDestination) {
      res.status(400).json({ error: 'invalid_destination' });
      return;
    }

    try {
      const result = await service.createSession({
        destination,
        botUsername: allowedDestination.botUsername,
        ...attributionRequestInput(req)
      });

      applyAttributionCookies(res, result, config);
      void trackMetaEvents({ kind: 'bot', destination, result, req }).catch((error) => {
        logger.warn('[Attribution] Meta redirect event failed', {
          destination,
          kind: 'bot',
          error: error instanceof Error ? error.message : String(error)
        });
      });
      res.redirect(302, result.redirectUrl);
    } catch (error) {
      next(error);
    }
  });

  router.get(['/quiz', '/web'], async (req, res, next) => {
    const config = resolveConfig();
    if (!config.enabled) {
      failDisabled(config, res, next);
      return;
    }

    if (!config.webAllowlist.length) {
      res.status(503).json({ error: 'attribution_redirect_not_configured' });
      return;
    }

    const destination = firstQueryText(req.query.destination)
      || firstQueryText(req.query.dest)
      || config.defaultDestination;
    const allowedDestination = config.webAllowlist.find(entry => entry.destination === destination);
    if (!destination || !allowedDestination) {
      res.status(400).json({ error: 'invalid_destination' });
      return;
    }

    try {
      const result = await service.createSession({
        destination,
        redirectUrl: allowedDestination.url,
        appendAttributionParams: allowedDestination.appendAttributionParams,
        ...attributionRequestInput(req)
      });

      applyAttributionCookies(res, result, config);
      void trackMetaEvents({ kind: 'web', destination, result, req }).catch((error) => {
        logger.warn('[Attribution] Meta redirect event failed', {
          destination,
          kind: 'web',
          error: error instanceof Error ? error.message : String(error)
        });
      });
      res.redirect(302, result.redirectUrl);
    } catch (error) {
      next(error);
    }
  });

  return router;
};

export default createTrackingRedirectRouter();
