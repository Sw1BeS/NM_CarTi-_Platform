/**
 * Content Worker - Auto-publish scheduled posts
 * 
 * This worker runs every minute and checks for posts that need to be published.
 * It uses node-cron for scheduling and sends posts to configured channels.
 */

import cron from 'node-cron';
import { prisma } from '../services/prisma.js';
import { telegramOutbox } from '../modules/telegram/outbox/telegramOutbox.js';

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
async function publishPost(post: ScheduledPost, botToken: string, companyId?: string | null): Promise<void> {
    try {
        if (post.imageUrl) {
            await telegramOutbox.sendPhoto({
                botId: post.botId,
                token: botToken,
                chatId: post.destination,
                photo: post.imageUrl,
                caption: post.text,
                companyId: companyId || null
            });
        } else {
            await telegramOutbox.sendMessage({
                botId: post.botId,
                token: botToken,
                chatId: post.destination,
                text: post.text,
                companyId: companyId || null
            });
        }

        console.log(`[ContentWorker] Published post ${post.id} to ${post.destination}`);
    } catch (e: any) {
        console.error(`[ContentWorker] Failed to publish ${post.id}:`, e.message);
        throw e;
    }
}

/**
 * Main worker function - checks and publishes due posts
 */
async function processScheduledPosts(): Promise<void> {
    if (isRunning) {
        console.log('[ContentWorker] Already running, skipping...');
        return;
    }

    isRunning = true;

    try {
        const now = new Date();

        // Find posts scheduled for now or earlier that haven't been posted
        const duePosts = await prisma.draft.findMany({
            where: {
                scheduledAt: {
                    lte: now
                },
                postedAt: null,
                status: 'SCHEDULED'
            },
            orderBy: {
                scheduledAt: 'asc'
            },
            take: 10 // Process max 10 per run
        });

        if (duePosts.length === 0) {
            console.log('[ContentWorker] No posts due');
            return;
        }

        console.log(`[ContentWorker] Found ${duePosts.length} posts to publish`);

        for (const draft of duePosts) {
            try {
                // Get bot token
                const bot = await prisma.botConfig.findUnique({
                    where: { id: draft.botId || '' }
                });

                if (!bot || !bot.token) {
                    console.error(`[ContentWorker] Bot not found for draft ${draft.id}`);
                    await prisma.draft.update({
                        where: { id: draft.id },
                        data: {
                            status: 'FAILED',
                            metadata: { error: 'Bot not found' }
                        }
                    });
                    continue;
                }

                // Publish
                await publishPost({
                    id: String(draft.id),  // Convert number to string
                    text: draft.description || draft.title,  // Use description as content
                    imageUrl: draft.url || undefined,  // Use url as image
                    destination: draft.destination || '',
                    scheduledAt: draft.scheduledAt!,
                    botId: draft.botId || ''
                }, bot.token, bot.companyId || null);

                // Mark as posted
                await prisma.draft.update({
                    where: { id: draft.id },
                    data: {
                        status: 'POSTED',
                        postedAt: new Date()
                    }
                });

                console.log(`[ContentWorker] ✅ Successfully published ${draft.id}`);

                // Rate limiting - wait 1 second between posts
                await new Promise(r => setTimeout(r, 1000));

            } catch (e: any) {
                console.error(`[ContentWorker] Error publishing ${draft.id}:`, e);

                await prisma.draft.update({
                    where: { id: draft.id },
                    data: {
                        status: 'FAILED',
                        metadata: { error: e.message, failedAt: new Date().toISOString() }
                    }
                });
            }
        }

    } catch (e) {
        console.error('[ContentWorker] Critical error:', e);
    } finally {
        isRunning = false;
    }
}

/**
 * Start the content worker
 */
export function startContentWorker(): void {
    if (cronTask) {
        console.log('[ContentWorker] Already running');
        return;
    }

    // Run every minute
    cronTask = cron.schedule('* * * * *', async () => {
        console.log('[ContentWorker] Checking for scheduled posts...');
        await processScheduledPosts();
    });

    console.log('[ContentWorker] 🚀 Started (runs every minute)');

    // Run immediately on start
    processScheduledPosts();
}

/**
 * Stop the content worker
 */
export function stopContentWorker(): void {
    if (cronTask) {
        cronTask.stop();
        cronTask = null;
        console.log('[ContentWorker] ⏹️ Stopped');
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
