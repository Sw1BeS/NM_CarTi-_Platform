import { Response } from 'express';

export type ErrorShape = {
  error: string;
  code?: string;
  details?: any;
};

export const errorResponse = (res: Response, status: number, message: string, code?: string, details?: any) => {
  const payload: ErrorShape = { error: message };
  if (code) payload.code = code;
  if (details !== undefined) payload.details = details;
  return res.status(status).json(payload);
};
