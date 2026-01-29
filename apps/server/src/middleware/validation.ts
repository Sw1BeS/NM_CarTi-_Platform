import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { errorResponse } from '../utils/errorResponse.js';

export const validate = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
    try {
        req.body = schema.parse(req.body);
        next();
    } catch (error) {
        if (error instanceof ZodError) {
            return errorResponse(
                res,
                400,
                'Validation failed',
                'VALIDATION_ERROR',
                error.errors.map(e => ({
                    path: e.path.join('.'),
                    message: e.message
                }))
            );
        }
        return errorResponse(res, 500, 'Internal validation error');
    }
};
