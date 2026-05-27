export type AttributionQuery = Record<string, string>;

export type AttributionIdentifiers = {
  fbclid?: string;
  fbp?: string;
  fbc?: string;
  client_ip_address?: string;
  client_user_agent?: string;
};

export type AttributionRequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
  eventSourceUrl?: string | null;
  referrer?: string | null;
};

export type AttributionCreateInput = {
  companyId?: string | null;
  botId?: string | null;
  destination: string;
  botUsername: string;
  source?: string | null;
  query: Record<string, unknown>;
  requestMeta: AttributionRequestMeta;
  cookies?: {
    fbp?: string | null;
    fbc?: string | null;
  };
  now?: Date;
};

export type AttributionSnapshot = {
  token: string;
  destination: string;
  source?: string;
  query: AttributionQuery;
  identifiers: AttributionIdentifiers;
  event_source_url?: string;
  created_at: string;
  expires_at: string;
};
