import { Request, Response } from 'express';
import { prisma } from '../../../services/prisma.js';
import { botManager } from '../../Communication/bots/bot.service.js';
import { getWorkerStatus } from '../../../workers/content.worker.js';
import process from 'process';

export const checkHealth = async (req: Request, res: Response) => {
    const start = Date.now();
    let dbStatus = 'disconnected';
    let dbLatency = 0;

    try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - dbStart;
        dbStatus = 'connected';
    } catch (e) {
        console.error('Health Check DB Error:', e);
        dbStatus = 'error';
    }

    const status = {
        status: dbStatus === 'connected' ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        database: {
            status: dbStatus,
            latency_ms: dbLatency
        },
        services: {
            bots: botManager.getStatus(),
            contentWorker: getWorkerStatus()
        },
        memory: process.memoryUsage(),
        response_time_ms: Date.now() - start
    };

    const code = dbStatus === 'connected' ? 200 : 503;
    res.status(code).json(status);
};
