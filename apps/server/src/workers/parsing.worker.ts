import { prisma } from '../services/prisma.js';
import { parseListingFromUrl } from '../services/parser.js';
import { logger } from '../utils/logger.js';

const MAX_ATTEMPTS = 3;
const BATCH_LIMIT = 5;

class ParsingWorker {
    private isRunning = false;

    async runJobs() {
        if (this.isRunning) return;
        this.isRunning = true;
        try {
            const jobs = await prisma.parsingJob.findMany({
                where: {
                    status: { in: ['PENDING', 'RUNNING'] },
                    attempts: { lt: MAX_ATTEMPTS }
                },
                orderBy: { createdAt: 'asc' },
                take: BATCH_LIMIT
            });

            for (const job of jobs) {
                await this.processJob(job.id);
            }
        } catch (e: any) {
            logger.error('[ParsingWorker] Failed to run jobs:', e?.message || e);
        } finally {
            this.isRunning = false;
        }
    }

    private async processJob(jobId: string) {
        const job = await prisma.parsingJob.findUnique({ where: { id: jobId } });
        if (!job) return;

        await prisma.parsingJob.update({
            where: { id: job.id },
            data: {
                status: 'RUNNING',
                attempts: { increment: 1 },
                error: null
            }
        });

        try {
            const result = await parseListingFromUrl(job.url);
            if ((result as any)?.reason && (result as any)?.confidence === 'low') {
                await prisma.parsingJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'FAILED',
                        error: (result as any)?.reason || 'parse_failed',
                        result: result as any
                    }
                });
                return;
            }
            await prisma.parsingJob.update({
                where: { id: job.id },
                data: {
                    status: 'DONE',
                    result: result as any,
                    error: null
                }
            });
        } catch (e: any) {
            await prisma.parsingJob.update({
                where: { id: job.id },
                data: {
                    status: 'FAILED',
                    error: e?.message || 'parse_failed'
                }
            });
        }
    }
}

export const parsingWorker = new ParsingWorker();
