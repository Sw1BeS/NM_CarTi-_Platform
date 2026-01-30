/**
 * Content Worker - Auto-publish scheduled posts
 *
 * This worker runs every minute and checks for posts that need to be published.
 * It uses node-cron for scheduling and sends posts to configured channels.
 */

import cron from 'node-cron';
import { prisma } from '../services/prisma.js';
import { telegramOutbox } from '../modules/Communication/telegram/messaging/outbox/telegramOutbox.js';
import { logger } from '../utils/logger.js';

interface ScheduledPost {
    id: string;
    text: string;
    imageUrl?: string;
    destination: string;
    scheduledAt: Date;
    botId: string;
}

let isRunning = false;
let cronTask: cron.ScheduledTask | null = null;

/**
 * Send post to Telegram channel
 */
async function publishPost(post: ScheduledPost, botToken: string, companyId?: string | null): Promise<any> {
    try {
        let result;
        if (post.imageUrl) {
            result = await telegramOutbox.sendPhoto({
                botId: post.botId,
                token: botToken,
                chatId: post.destination,
                photo: post.imageUrl,
                caption: post.text,
                companyId: companyId || null
            });
        } else {
            result = await telegramOutbox.sendMessage({
                botId: post.botId,
                token: botToken,
                chatId: post.destination,
                text: post.text,
                companyId: companyId || null
            });
        }

        logger.info(`[ContentWorker] Published post ${post.id} to ${post.destination}`);
        return result;
    } catch (e: any) {
        logger.error(`[ContentWorker] Failed to publish ${post.id}:`, e.message);
        throw e;
    }
}

/**
 * Process PublicationJobs (new pipeline)
 */
async function processPublicationJobs(): Promise<boolean> {
    if (isRunning) {
        logger.info('[ContentWorker] Already running, skipping...');
        return true;
    }

    isRunning = true;

    try {
        const now = new Date();

        const dueJobs = await prisma.publicationJob.findMany({
            where: {
                status: { in: ['SCHEDULED', 'QUEUED'] },
                OR: [
                    { scheduledAt: { lte: now } },
                    { scheduledAt: null }
                ]
            },
            orderBy: { scheduledAt: 'asc' },
            take: 10,
            include: { draft: true, bot: true }
        });

        if (dueJobs.length === 0) {
            logger.info('[ContentWorker] No publication jobs due');
            return false;
        }

        logger.info(`[ContentWorker] Found ${dueJobs.length} publication jobs to publish`);

        for (const job of dueJobs) {
            try {
                await prisma.publicationJob.update({
                    where: { id: job.id },
                    data: { status: 'RUNNING', attempts: { increment: 1 } }
                });

                const bot = job.bot || (job.botId
                    ? await prisma.botConfig.findUnique({ where: { id: job.botId } })
                    : null);

                if (!bot || !bot.token) {
                    const errMsg = 'Bot not found';
                    logger.error(`[ContentWorker] ${errMsg} for job ${job.id}`);
                    await prisma.publicationJob.update({
                        where: { id: job.id },
                        data: { status: 'FAILED', lastError: errMsg }
                    });
                    await prisma.publicationResult.create({
                        data: { jobId: job.id, status: 'FAILED', error: errMsg }
                    });
                    if (job.draftId) {
                        await prisma.draft.update({
                            where: { id: job.draftId },
                            data: { status: 'FAILED', metadata: { error: errMsg } }
                        });
                    }
                    continue;
                }

                const draft = job.draft || (job.draftId ? await prisma.draft.findUnique({ where: { id: job.draftId } }) : null);
                const text = job.text || draft?.description || draft?.title || '';
                const imageUrl = job.mediaUrl || draft?.url || undefined;

                if (!text || !job.destination) {
                    const errMsg = 'Missing text or destination';
                    logger.error(`[ContentWorker] ${errMsg} for job ${job.id}`);
                    await prisma.publicationJob.update({
                        where: { id: job.id },
                        data: { status: 'FAILED', lastError: errMsg }
                    });
                    await prisma.publicationResult.create({
                        data: { jobId: job.id, status: 'FAILED', error: errMsg }
                    });
                    if (job.draftId) {
                        await prisma.draft.update({
                            where: { id: job.draftId },
                            data: { status: 'FAILED', metadata: { error: errMsg } }
                        });
                    }
                    continue;
                }

                const result = await publishPost({
                    id: String(job.id),
                    text,
                    imageUrl,
                    destination: job.destination,
                    scheduledAt: job.scheduledAt || new Date(),
                    botId: bot.id
                }, bot.token, bot.companyId || null);

                const messageId = result?.message_id || result?.result?.message_id;
                const postedAt = new Date();

                await prisma.publicationJob.update({
                    where: { id: job.id },
                    data: { status: 'POSTED', postedAt }
                });

                await prisma.publicationResult.create({
                    data: {
                        jobId: job.id,
                        status: 'SUCCESS',
                        messageId: messageId ? Number(messageId) : null,
                        payload: result
                    }
                });

                if (job.draftId) {
                    await prisma.draft.update({
                        where: { id: job.draftId },
                        data: { status: 'POSTED', postedAt }
                    });
                }

                if (messageId && job.destination) {
                    await prisma.channelPost.create({
                        data: {
                            draftId: job.draftId || undefined,
                            channelId: job.destination,
                            messageId: Number(messageId),
                            botId: bot.id,
                            status: 'ACTIVE',
                            payload: result
                        }
                    });
                }

                logger.info(`[ContentWorker] ✅ Successfully published job ${job.id}`);
                await new Promise(r => setTimeout(r, 1000));

            } catch (e: any) {
                logger.error(`[ContentWorker] Error publishing job ${job.id}:`, e);

                await prisma.publicationJob.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', lastError: e.message }
                });
                await prisma.publicationResult.create({
                    data: { jobId: job.id, status: 'FAILED', error: e.message }
                });
                if (job.draftId) {
                    await prisma.draft.update({
                        where: { id: job.draftId },
                        data: { status: 'FAILED', metadata: { error: e.message, failedAt: new Date().toISOString() } }
                    });
                }
            }
        }

        return true;
    } catch (e) {
        logger.error('[ContentWorker] Critical error:', e);
        return true;
    } finally {
        isRunning = false;
    }
}

/**
 * Legacy Draft fallback (backfill PublicationJob)
 */
async function processLegacyDrafts(): Promise<boolean> {
    const now = new Date();
    const dueDrafts = await prisma.draft.findMany({
        where: {
            scheduledAt: { lte: now },
            postedAt: null,
            status: 'SCHEDULED',
            publicationJobs: { none: {} }
        },
        orderBy: { scheduledAt: 'asc' },
        take: 10
    });

    if (dueDrafts.length === 0) {
        logger.info('[ContentWorker] No legacy drafts due');
        return false;
    }

    logger.info(`[ContentWorker] Found ${dueDrafts.length} legacy drafts to backfill`);

    for (const draft of dueDrafts) {
        await prisma.publicationJob.create({
            data: {
                companyId: null,
                draftId: draft.id,
                botId: draft.botId,
                title: draft.title,
                text: draft.description || draft.title,
                mediaUrl: draft.url || undefined,
                destination: draft.destination || '',
                status: 'SCHEDULED',
                scheduledAt: draft.scheduledAt || new Date(),
                metadata: { legacyDraft: true }
            }
        });
    }

    return true;
}

/**
 * Start the content worker
 */
export function startContentWorker(): void {
    if (cronTask) {
        logger.info('[ContentWorker] Already running');
        return;
    }

    cronTask = cron.schedule('* * * * *', async () => {
        logger.info('[ContentWorker] Checking for scheduled posts...');
        const processed = await processPublicationJobs();
        if (!processed) {
            const backfilled = await processLegacyDrafts();
            if (backfilled) await processPublicationJobs();
        }
    });

    logger.info('[ContentWorker] 🚀 Started (runs every minute)');

    processPublicationJobs().then(async processed => {
        if (!processed) {
            const backfilled = await processLegacyDrafts();
            if (backfilled) await processPublicationJobs();
        }
    });
}

/**
 * Stop the content worker
 */
export function stopContentWorker(): void {
    if (cronTask) {
        cronTask.stop();
        cronTask = null;
        logger.info('[ContentWorker] ⏹️ Stopped');
    }
}

/**
 * Get worker status
 */
export function getWorkerStatus() {
    const next = (cronTask as any)?.nextDates?.();
    return {
        running: cronTask !== null,
        processing: isRunning,
        nextRun: next && typeof next.toISOString === 'function' ? next.toISOString() : null
    };
}
