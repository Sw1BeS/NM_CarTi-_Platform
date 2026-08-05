import { z } from 'zod';
import process from 'process';

const portSchema = z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return 3001;
    const num = Number(val);
    return Number.isFinite(num) ? num : NaN;
}, z.number().int().min(1).max(65535));

const intWithDefault = (defaultValue: number, minValue = 0) => z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return defaultValue;
    const num = Number(val);
    return Number.isFinite(num) ? num : NaN;
}, z.number().int().min(minValue));

const envSchema = z.object({
    NODE_ENV: z.string().optional(),
    PORT: portSchema,
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
    CORS_ORIGIN: z.string().optional(),
    FF_CAR_CARD_V2: z.string().optional(),
    FF_BOT_A_FLOW_V2: z.string().optional(),
    FF_B2B_WHITELIST_ENFORCED: z.string().optional(),
    FF_B2B_FIT_QUEUE_V2: z.string().optional(),
    FF_MINIAPP_B2B_CABINET: z.string().optional(),
    TELEGRAM_INITDATA_MAX_AGE_SECONDS: intWithDefault(43200),
    BOT_A_DAILY_LEAD_LIMIT: intWithDefault(5, 1),
    BOT_STEP_RATE_LIMIT_PER_MIN: intWithDefault(30, 1),
    BOT_MEDIA_MAX_PHOTO_BYTES: intWithDefault(10485760, 1024),
    SALESDRIVE_API_BASE_URL: z.string().optional(),
    SALESDRIVE_API_URL: z.string().optional(),
    SALESDRIVE_API_KEY: z.string().optional(),
    SALESDRIVE_FORM_API_KEY: z.string().optional(),
    SALESDRIVE_ORDER_CREATE_PATH: z.string().optional(),
    SALESDRIVE_ORDER_LIST_PATH: z.string().optional(),
    SALESDRIVE_STATUSES_PATH: z.string().optional(),
    SALESDRIVE_SYNC_ENABLED: z.string().optional(),
    SALESDRIVE_WRITE_ENABLED: z.string().optional(),
    SALESDRIVE_TIMEOUT_MS: intWithDefault(8000, 1000),
    SALESDRIVE_B2C_META_STATUS_MAP: z.string().optional(),
    SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST: z.string().optional(),
    SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST: z.string().optional(),
    SALESDRIVE_DEFAULT_CURRENCY: z.string().optional(),
    SALESDRIVE_WEBHOOK_TIMEZONE_OFFSET_MINUTES: intWithDefault(0),
    META_PIXEL_ID: z.string().optional(),
    META_ACCESS_TOKEN: z.string().optional(),
    META_CAPI_ACCESS_TOKEN: z.string().optional(),
    META_TEST_EVENT_CODE: z.string().optional(),
    META_CAPI_ENABLED: z.string().optional(),
    META_B2C_BOT_DATASET_ID: z.string().optional(),
    META_B2C_BOT_DESTINATION_KEY: z.string().optional(),
    META_B2C_BOT_ACCESS_TOKEN: z.string().optional(),
    META_B2C_BOT_TEST_EVENT_CODE: z.string().optional(),
    META_B2C_BOT_CAPI_ENABLED: z.string().optional(),
    META_B2C_BOT_PURCHASE_ENABLED: z.string().optional(),
    META_B2C_BOT_TEST_MODE: z.string().optional(),
    META_MAIN_QUIZ_DATASET_ID: z.string().optional(),
    META_MAIN_QUIZ_DESTINATION_KEY: z.string().optional(),
    META_MAIN_QUIZ_ACCESS_TOKEN: z.string().optional(),
    META_MAIN_QUIZ_TEST_EVENT_CODE: z.string().optional(),
    META_MAIN_QUIZ_CAPI_ENABLED: z.string().optional(),
    META_MAIN_QUIZ_TEST_MODE: z.string().optional(),
    META_DUAL_SALESDRIVE_TARGETS: z.string().optional(),
    ATTRIBUTION_REDIRECT_ENABLED: z.string().optional(),
    ATTRIBUTION_SESSION_TTL_DAYS: intWithDefault(30, 1),
    ATTRIBUTION_BOT_ALLOWLIST: z.string().optional(),
    ATTRIBUTION_WEB_ALLOWLIST: z.string().optional(),
    ATTRIBUTION_DEFAULT_DESTINATION: z.string().optional(),
    ATTRIBUTION_REDIRECT_FAIL_MODE: z.enum(['closed', 'passthrough']).optional(),
    SALESDRIVE_WEBHOOK_SECRET: z.string().optional(),
    SALESDRIVE_WEBHOOK_TOKEN: z.string().optional(),
    SALESDRIVE_SECRET: z.string().optional(),
    INTEGRATION_WEBHOOK_SECRET: z.string().optional(),
    WEBSITE_LEAD_API_ENABLED: z.string().optional(),
    WEBSITE_LEAD_API_KEY: z.string().optional(),
    WEBSITE_LEAD_BOT_ID: z.string().optional(),
    WEBSITE_LEAD_COMPANY_ID: z.string().optional()
});

export interface ValidatedEnv {
    NODE_ENV?: string;
    PORT: number;
    DATABASE_URL?: string;
    JWT_SECRET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    CORS_ORIGIN?: string;
    FF_CAR_CARD_V2?: string;
    FF_BOT_A_FLOW_V2?: string;
    FF_B2B_WHITELIST_ENFORCED?: string;
    FF_B2B_FIT_QUEUE_V2?: string;
    FF_MINIAPP_B2B_CABINET?: string;
    TELEGRAM_INITDATA_MAX_AGE_SECONDS: number;
    BOT_A_DAILY_LEAD_LIMIT: number;
    BOT_STEP_RATE_LIMIT_PER_MIN: number;
    BOT_MEDIA_MAX_PHOTO_BYTES: number;
    SALESDRIVE_API_BASE_URL?: string;
    SALESDRIVE_API_URL?: string;
    SALESDRIVE_API_KEY?: string;
    SALESDRIVE_FORM_API_KEY?: string;
    SALESDRIVE_ORDER_CREATE_PATH?: string;
    SALESDRIVE_ORDER_LIST_PATH?: string;
    SALESDRIVE_STATUSES_PATH?: string;
    SALESDRIVE_SYNC_ENABLED?: string;
    SALESDRIVE_WRITE_ENABLED?: string;
    SALESDRIVE_TIMEOUT_MS: number;
    SALESDRIVE_B2C_META_STATUS_MAP?: string;
    SALESDRIVE_B2C_WEBHOOK_ACCOUNT_ALLOWLIST?: string;
    SALESDRIVE_B2C_WEBHOOK_FORM_ALLOWLIST?: string;
    SALESDRIVE_DEFAULT_CURRENCY?: string;
    SALESDRIVE_WEBHOOK_TIMEZONE_OFFSET_MINUTES: number;
    META_PIXEL_ID?: string;
    META_ACCESS_TOKEN?: string;
    META_CAPI_ACCESS_TOKEN?: string;
    META_TEST_EVENT_CODE?: string;
    META_CAPI_ENABLED?: string;
    META_B2C_BOT_DATASET_ID?: string;
    META_B2C_BOT_DESTINATION_KEY?: string;
    META_B2C_BOT_ACCESS_TOKEN?: string;
    META_B2C_BOT_TEST_EVENT_CODE?: string;
    META_B2C_BOT_CAPI_ENABLED?: string;
    META_B2C_BOT_PURCHASE_ENABLED?: string;
    META_B2C_BOT_TEST_MODE?: string;
    META_MAIN_QUIZ_DATASET_ID?: string;
    META_MAIN_QUIZ_DESTINATION_KEY?: string;
    META_MAIN_QUIZ_ACCESS_TOKEN?: string;
    META_MAIN_QUIZ_TEST_EVENT_CODE?: string;
    META_MAIN_QUIZ_CAPI_ENABLED?: string;
    META_MAIN_QUIZ_TEST_MODE?: string;
    META_DUAL_SALESDRIVE_TARGETS?: string;
    ATTRIBUTION_REDIRECT_ENABLED?: string;
    ATTRIBUTION_SESSION_TTL_DAYS: number;
    ATTRIBUTION_BOT_ALLOWLIST?: string;
    ATTRIBUTION_WEB_ALLOWLIST?: string;
    ATTRIBUTION_DEFAULT_DESTINATION?: string;
    ATTRIBUTION_REDIRECT_FAIL_MODE?: 'closed' | 'passthrough';
    SALESDRIVE_WEBHOOK_SECRET?: string;
    SALESDRIVE_WEBHOOK_TOKEN?: string;
    SALESDRIVE_SECRET?: string;
    INTEGRATION_WEBHOOK_SECRET?: string;
    WEBSITE_LEAD_API_ENABLED?: string;
    WEBSITE_LEAD_API_KEY?: string;
    WEBSITE_LEAD_BOT_ID?: string;
    WEBSITE_LEAD_COMPANY_ID?: string;
}

export const validateEnv = (): ValidatedEnv => {
    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        const message = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        throw new Error(`Invalid environment configuration: ${message}`);
    }

    const env = parsed.data;
    const isProduction = env.NODE_ENV === 'production';

    if (isProduction && !env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required in production');
    }
    if (isProduction && !env.JWT_SECRET) {
        throw new Error('JWT_SECRET is required in production');
    }
    if (isProduction && !env.CORS_ORIGIN) {
        throw new Error('CORS_ORIGIN is required in production');
    }
    if (isProduction && env.TELEGRAM_BOT_TOKEN && !env.TELEGRAM_WEBHOOK_SECRET) {
        throw new Error('TELEGRAM_WEBHOOK_SECRET is required in production when Telegram is enabled');
    }

    return env;
};

export type AttributionRedirectFailMode = 'closed' | 'passthrough';

export type AttributionBotAllowlistEntry = {
    destination: string;
    botUsername: string;
};

export type AttributionWebAllowlistEntry = {
    destination: string;
    url: string;
    appendAttributionParams: boolean;
};

export type AttributionRedirectConfig = {
    enabled: boolean;
    ttlDays: number;
    botAllowlist: AttributionBotAllowlistEntry[];
    webAllowlist: AttributionWebAllowlistEntry[];
    defaultDestination?: string;
    failMode: AttributionRedirectFailMode;
};

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export const parseBooleanFlag = (value: string | undefined, defaultValue = false): boolean => {
    if (value === undefined || value === null || value === '') {
        return defaultValue;
    }
    return TRUE_VALUES.has(String(value).trim().toLowerCase());
};

const normalizeEnvText = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
};

export const parseAttributionBotAllowlist = (raw: string | undefined): AttributionBotAllowlistEntry[] => {
    const text = normalizeEnvText(raw);
    if (!text) return [];

    return text
        .split(',')
        .map(entry => {
            const [destinationRaw, botUsernameRaw] = entry.split(':');
            const destination = normalizeEnvText(destinationRaw);
            const botUsername = normalizeEnvText(botUsernameRaw);
            if (!destination || !botUsername) return null;
            return { destination, botUsername };
        })
        .filter((entry): entry is AttributionBotAllowlistEntry => Boolean(entry));
};

const normalizeAllowlistedHttpUrl = (value: unknown): string | undefined => {
    const text = normalizeEnvText(value);
    if (!text) return undefined;
    try {
        const url = new URL(text);
        if (!['http:', 'https:'].includes(url.protocol)) return undefined;
        url.hash = '';
        return url.toString();
    } catch {
        return undefined;
    }
};

const parseWebAllowlistJson = (text: string): AttributionWebAllowlistEntry[] | null => {
    try {
        const parsed = JSON.parse(text);
        const entries = Array.isArray(parsed) ? parsed : [];
        return entries
            .map((entry) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
                const source = entry as Record<string, unknown>;
                const destination = normalizeEnvText(source.destination);
                const url = normalizeAllowlistedHttpUrl(source.url || source.href);
                if (!destination || !url) return null;
                return {
                    destination,
                    url,
                    appendAttributionParams: source.appendAttributionParams === false ? false : true
                };
            })
            .filter((entry): entry is AttributionWebAllowlistEntry => Boolean(entry));
    } catch {
        return null;
    }
};

export const parseAttributionWebAllowlist = (raw: string | undefined): AttributionWebAllowlistEntry[] => {
    const text = normalizeEnvText(raw);
    if (!text) return [];

    const jsonEntries = parseWebAllowlistJson(text);
    if (jsonEntries) return jsonEntries;

    return text
        .split(',')
        .map(entry => {
            const separatorIndex = entry.indexOf('=');
            if (separatorIndex <= 0) return null;
            const destination = normalizeEnvText(entry.slice(0, separatorIndex));
            const url = normalizeAllowlistedHttpUrl(entry.slice(separatorIndex + 1));
            if (!destination || !url) return null;
            return {
                destination,
                url,
                appendAttributionParams: true
            };
        })
        .filter((entry): entry is AttributionWebAllowlistEntry => Boolean(entry));
};

export const getAttributionRedirectConfig = (
    env: Partial<ValidatedEnv> | NodeJS.ProcessEnv = process.env
): AttributionRedirectConfig => {
    const botAllowlist = parseAttributionBotAllowlist(env.ATTRIBUTION_BOT_ALLOWLIST);
    const webAllowlist = parseAttributionWebAllowlist(env.ATTRIBUTION_WEB_ALLOWLIST);
    const defaultDestination = normalizeEnvText(env.ATTRIBUTION_DEFAULT_DESTINATION)
        || botAllowlist[0]?.destination
        || webAllowlist[0]?.destination;
    const ttlValue = Number(env.ATTRIBUTION_SESSION_TTL_DAYS || 30);
    const ttlDays = Number.isFinite(ttlValue) && ttlValue > 0 ? Math.floor(ttlValue) : 30;
    const failMode = env.ATTRIBUTION_REDIRECT_FAIL_MODE === 'passthrough' ? 'passthrough' : 'closed';

    return {
        enabled: parseBooleanFlag(env.ATTRIBUTION_REDIRECT_ENABLED, false),
        ttlDays,
        botAllowlist,
        webAllowlist,
        defaultDestination,
        failMode
    };
};
