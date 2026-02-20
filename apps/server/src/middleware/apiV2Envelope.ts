import { NextFunction, Request, Response } from 'express';

type EnvelopeMeta = {
  version: 'v2';
  timestamp: string;
};

type EnvelopeSuccess<T = any> = {
  ok: true;
  data: T;
  meta: EnvelopeMeta;
};

type EnvelopeError = {
  ok: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  meta: EnvelopeMeta;
};

const isEnvelope = (payload: any): payload is EnvelopeSuccess | EnvelopeError => {
  return !!payload
    && typeof payload === 'object'
    && typeof payload.ok === 'boolean'
    && payload.meta?.version === 'v2';
};

const buildMeta = (): EnvelopeMeta => ({
  version: 'v2',
  timestamp: new Date().toISOString()
});

export const apiV2Envelope = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);

  res.json = ((payload: any) => {
    if (isEnvelope(payload)) {
      return originalJson(payload);
    }

    const statusCode = res.statusCode || 200;
    const isError = statusCode >= 400 || (!!payload && typeof payload === 'object' && 'error' in payload);

    if (isError) {
      const envelope: EnvelopeError = {
        ok: false,
        error: {
          message: payload?.error || payload?.message || 'Request failed',
          ...(payload?.code ? { code: payload.code } : {}),
          ...(payload?.details !== undefined ? { details: payload.details } : {})
        },
        meta: buildMeta()
      };
      return originalJson(envelope);
    }

    const envelope: EnvelopeSuccess = {
      ok: true,
      data: payload,
      meta: buildMeta()
    };

    return originalJson(envelope);
  }) as any;

  next();
};
