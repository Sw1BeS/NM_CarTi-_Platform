import { z } from 'zod';

export const createLeadSchema = z.object({
    clientName: z.string().min(1, 'Client name is required'),
    phone: z.string().optional(),
    request: z.string().optional(),
    goal: z.string().optional(), // Alias for request
    source: z.string().default('MANUAL'),
    userTgId: z.string().optional(),
    // Payload fields
    email: z.string().email().optional(),
    city: z.string().optional(),
    notes: z.string().optional(),
    language: z.enum(['EN', 'UK', 'RU']).optional()
});

export const updateLeadSchema = createLeadSchema.partial();

export const createRequestSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    yearMin: z.number().int().min(1900).optional(),
    yearMax: z.number().int().max(new Date().getFullYear() + 1).optional(),
    currency: z.enum(['USD', 'EUR', 'UAH']).default('USD'),
    city: z.string().optional(),
    chatId: z.string().optional(),
    status: z.enum(['new', 'draft', 'published', 'collecting_variants', 'shortlist', 'won', 'lost', 'closed']).optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
    language: z.enum(['EN', 'UK', 'RU']).optional()
});

export const updateRequestSchema = createRequestSchema.partial();
