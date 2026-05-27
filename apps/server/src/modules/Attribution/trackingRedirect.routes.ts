import express, { type NextFunction, type Request, type Response } from 'express';
import {
  type AttributionRedirectConfig,
  getAttributionRedirectConfig
} from '../../config/env.js';
import {
  attributionSessionService,
  type AttributionCreateResult
} from './attributionSession.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type TrackingRedirectService = {
  createSession(input: Parameters<typeof attributionSessionService.createSession>[0]): Promise<AttributionCreateResult>;
};

type TrackingRedirectDeps = {
  service?: TrackingRedirectService;
  config?: AttributionRedirectConfig;
  getConfig?: () => AttributionRedirectConfig;
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

export const createTrackingRedirectRouter = (deps: TrackingRedirectDeps = {}) => {
  const router = express.Router();
  const service = deps.service || attributionSessionService;
  const resolveConfig = () => deps.config || deps.getConfig?.() || getAttributionRedirectConfig();

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
      const cookies = parseCookieHeader(req.get('cookie'));
      const result = await service.createSession({
        destination,
        botUsername: allowedDestination.botUsername,
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
      });

      if (result.cookies.fbp) {
        setAttributionCookie(res, '_fbp', result.cookies.fbp, config.ttlDays);
      }
      if (result.cookies.fbc) {
        setAttributionCookie(res, '_fbc', result.cookies.fbc, config.ttlDays);
      }
      res.redirect(302, result.redirectUrl);
    } catch (error) {
      next(error);
    }
  });

  return router;
};

export default createTrackingRedirectRouter();
