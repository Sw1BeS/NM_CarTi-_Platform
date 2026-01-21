import { z } from 'zod';

const REQUEST_STATUS_VALUES = [
    'NEW',
    'DRAFT',
    'PUBLISHED',
    'COLLECTING_VARIANTS',
    'SHORTLIST',
    'CONTACT_SHARED',
    'WON',
    'LOST',
    'CLOSED'
] as const;

const normalizeStatus = (value: any) => typeof value === 'string' ? value.toUpperCase() : value;
const normalizePriority = (value: any) => {
    if (typeof value !== 'string') return value;
    const upper = value.toUpperCase();
    return upper === 'MEDIUM' ? 'NORMAL' : upper;
};

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
    status: z.preprocess(normalizeStatus, z.enum(REQUEST_STATUS_VALUES)).optional(),
    priority: z.preprocess(normalizePriority, z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])).optional(),
    language: z.enum(['EN', 'UK', 'RU']).optional()
});

export const updateRequestSchema = createRequestSchema.partial();
