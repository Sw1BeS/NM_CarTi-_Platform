import { z } from 'zod';
import process from 'process';

const portSchema = z.preprocess((val) => {
    if (val === undefined || val === null || val === '') return 3001;
    const num = Number(val);
    return Number.isFinite(num) ? num : NaN;
}, z.number().int().min(1).max(65535));

const envSchema = z.object({
    NODE_ENV: z.string().optional(),
    PORT: portSchema,
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
    CORS_ORIGIN: z.string().optional()
});

export interface ValidatedEnv {
    NODE_ENV?: string;
    PORT: number;
    DATABASE_URL?: string;
    JWT_SECRET?: string;
    TELEGRAM_BOT_TOKEN?: string;
    TELEGRAM_WEBHOOK_SECRET?: string;
    CORS_ORIGIN?: string;
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

