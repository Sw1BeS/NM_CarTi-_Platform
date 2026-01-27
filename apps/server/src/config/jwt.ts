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
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is required in production');
        }
        return process.env.JWT_SECRET;
    }
    return process.env.JWT_SECRET || 'dev_secret_key_123';
};

export const signJwt = (payload: JwtUserPayload, options?: jwt.SignOptions): string => {
    return jwt.sign(payload, getJwtSecret(), options);
};

export const verifyJwt = (token: string): JwtUserPayload => {
    return jwt.verify(token, getJwtSecret()) as JwtUserPayload;
};
