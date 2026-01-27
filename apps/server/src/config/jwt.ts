import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import process from 'process';

dotenv.config();

export const getJwtSecret = (): string => {
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is required in production');
        }
        return process.env.JWT_SECRET;
    }
    return process.env.JWT_SECRET || 'dev_secret_fallback';
};

export const signJwt = (payload: object, options?: jwt.SignOptions): string => {
    return jwt.sign(payload, getJwtSecret(), options);
};

export const verifyJwt = (token: string): any => {
    return jwt.verify(token, getJwtSecret());
};
