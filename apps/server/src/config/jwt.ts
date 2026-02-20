import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

export interface JwtUserPayload {
    userId: string;
    globalUserId: string;
    role: string;
    companyId: string;
    workspaceId: string;
    email?: string;
    iat?: number;
    exp?: number;
}

export const getJwtSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'test') {
            return 'test_jwt_secret_for_ci_only';
        }
        throw new Error('JWT_SECRET is required');
    }

    if (process.env.NODE_ENV === 'production' && secret.length < 32) {
        throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
    if (process.env.NODE_ENV === 'production' && secret === 'dev_secret_key_123') {
        throw new Error('Insecure JWT_SECRET is not allowed in production');
    }

    return secret;
};

export const signJwt = (payload: JwtUserPayload, options?: jwt.SignOptions): string => {
    return jwt.sign(payload, getJwtSecret(), options);
};

export const verifyJwt = (token: string): JwtUserPayload => {
    return jwt.verify(token, getJwtSecret()) as JwtUserPayload;
};
