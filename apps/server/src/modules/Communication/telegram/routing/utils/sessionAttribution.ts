import type { PipelineContext } from '../../core/types.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const toText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
};

const compactObject = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));

export const buildSessionAttributionPayload = (ctx: PipelineContext): Record<string, unknown> => {
  const variables = isRecord(ctx.session?.variables) ? ctx.session.variables : {};
  const attribution = isRecord(variables.attribution) ? variables.attribution : {};
  const identifiers = isRecord(attribution.identifiers) ? attribution.identifiers : {};
  const query = isRecord(attribution.query) ? attribution.query : {};
  const attributionToken = toText(variables.attributionToken) || toText(attribution.token);

  if (!attributionToken && !Object.keys(attribution).length) return {};

  const tracking = compactObject({
    attributionToken,
    startParam: attributionToken,
    campaign_token: toText(query.campaign_token),
    utm_source: toText(query.utm_source),
    utm_medium: toText(query.utm_medium),
    utm_campaign: toText(query.utm_campaign),
    utm_content: toText(query.utm_content),
    utm_term: toText(query.utm_term),
    fbclid: toText(identifiers.fbclid) || toText(query.fbclid),
    fbp: toText(identifiers.fbp),
    fbc: toText(identifiers.fbc),
    client_ip_address: toText(identifiers.client_ip_address),
    client_user_agent: toText(identifiers.client_user_agent),
    eventSourceUrl: toText(attribution.event_source_url)
  });

  return compactObject({
    attributionToken,
    startParam: attributionToken,
    attribution: Object.keys(attribution).length ? attribution : undefined,
    tracking
  });
};

export const mergeSessionAttributionPayload = (
  ctx: PipelineContext,
  payload: Record<string, unknown> = {}
): Record<string, unknown> => {
  const attributionPayload = buildSessionAttributionPayload(ctx);
  if (!Object.keys(attributionPayload).length) return payload;

  const currentTracking = isRecord(payload.tracking) ? payload.tracking : {};
  const attributionTracking = isRecord(attributionPayload.tracking) ? attributionPayload.tracking : {};

  return {
    ...payload,
    attributionToken: toText(payload.attributionToken) || toText(attributionPayload.attributionToken),
    startParam: toText(payload.startParam) || toText(attributionPayload.startParam),
    attribution: isRecord(payload.attribution) && Object.keys(payload.attribution).length
      ? payload.attribution
      : attributionPayload.attribution,
    tracking: compactObject({
      ...attributionTracking,
      ...currentTracking
    })
  };
};
