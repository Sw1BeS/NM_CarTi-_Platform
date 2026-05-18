import { Request, Response } from 'express';
import { prisma } from '../../../services/prisma.js';
import { botManager } from '../../Communication/bots/bot.service.js';
import { getWorkerStatus } from '../../../workers/content.worker.js';
import { getBuildInfo } from '../../../config/buildInfo.js';
import { logger } from '../../../utils/logger.js';
import { getPlatformReadinessReport } from './platformReadiness.service.js';
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
        logger.error('Health Check DB Error:', e);
        dbStatus = 'error';
    }

    const build = getBuildInfo();

    const status = {
        status: dbStatus === 'connected' ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        build,
        database: {
            status: dbStatus,
            latency_ms: dbLatency
        },
        // Frontend expects these at top level or we align structure.
        // Lifting for compatibility with Health.tsx
        bots: botManager.getStatus(),
        worker: getWorkerStatus(),
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

export const checkPlatformReadiness = async (req: Request, res: Response) => {
    try {
        const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
        const report = await getPlatformReadinessReport({ companyId });
        res.status(report.status === 'ERROR' ? 503 : 200).json(report);
    } catch (e) {
        logger.error('Platform readiness check error:', e);
        res.status(503).json({
            status: 'ERROR',
            generatedAt: new Date().toISOString(),
            error: e instanceof Error ? e.message : 'Platform readiness failed'
        });
    }
};
