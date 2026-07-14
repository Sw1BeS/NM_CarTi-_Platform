import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { MTProtoService } from '../modules/Integrations/mtproto/mtproto.service.js';
import { mtprotoWorker } from '../modules/Integrations/mtproto/mtproto.worker.js';
import { parsingWorker } from './parsing.worker.js';
import { logIntegrationEvent } from '../services/integrationEventLog.service.js';
import { logger } from '../utils/logger.js';
import { skillPackService } from '../modules/Orchestration/skillPack.service.js';
import { importService } from '../modules/Orchestration/import.service.js';
import { processSalesDriveRequestSyncQueue } from '../modules/Integrations/salesdrive/salesdriveSync.service.js';

const prisma = new PrismaClient();
let scheduledJobsTableAvailable = true;

const isMissingScheduledJobsTable = (error: any) => {
    return error?.code === 'P2021'
        && typeof error?.meta?.table === 'string'
        && String(error.meta.table).includes('ScheduledJob');
};

export const startScheduler = () => {
    logger.info('⏰ Scheduler: Initializing...');

    // Sync Telegram Channels every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        logger.info('⏰ Scheduler: Starting Job [sync_telegram_channels]');
        try {
            await syncAllChannels();
        } catch (e) {
            logger.error('⏰ Scheduler: Job [sync_telegram_channels] Failed', e);
        }
    });

    // Process MTProto import jobs every minute
    cron.schedule('* * * * *', async () => {
        logger.info('⏰ Scheduler: Starting Job [mtproto_import_jobs]');
        try {
            await mtprotoWorker.runImportJobs();
        } catch (e) {
            logger.error('⏰ Scheduler: Job [mtproto_import_jobs] Failed', e);
        }
    });

    // Process parsing jobs every minute
    cron.schedule('* * * * *', async () => {
        logger.info('⏰ Scheduler: Starting Job [parsing_jobs]');
        try {
            await parsingWorker.runJobs();
        } catch (e) {
            logger.error('⏰ Scheduler: Job [parsing_jobs] Failed', e);
        }
    });

    // Process Scheduled Jobs (Reminders, Delays, etc)
    cron.schedule('* * * * *', async () => {
        logger.info('⏰ Scheduler: Starting Job [scheduled_jobs]');
        try {
            await processScheduledJobs();
        } catch (e) {
            logger.error('⏰ Scheduler: Job [scheduled_jobs] Failed', e);
        }
    });

    // Refresh stale orchestration skill packs every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
        logger.info('⏰ Scheduler: Starting Job [orchestration_refresh]');
        try {
            await skillPackService.refreshStaleSkillPacks();
        } catch (e) {
            logger.error('⏰ Scheduler: Job [orchestration_refresh] Failed', e);
        }
    });

    // Process staged imports every minute
    cron.schedule('* * * * *', async () => {
        logger.info('⏰ Scheduler: Starting Job [import_analysis]');
        try {
            await importService.processPendingBatches();
        } catch (e) {
            logger.error('⏰ Scheduler: Job [import_analysis] Failed', e);
        }
    });

    // Process SalesDrive request sync intents every minute. Writes remain gated by SALESDRIVE_SYNC_ENABLED and SALESDRIVE_WRITE_ENABLED.
    cron.schedule('* * * * *', async () => {
        logger.info('⏰ Scheduler: Starting Job [salesdrive_request_sync]');
        try {
            const result = await processSalesDriveRequestSyncQueue();
            if (result.processed || result.failed) {
                logger.info('⏰ Scheduler: SalesDrive request sync result', result);
            }
        } catch (e) {
            logger.error('⏰ Scheduler: Job [salesdrive_request_sync] Failed', e);
        }
    });

    logger.info('⏰ Scheduler: Started. Jobs: [sync_telegram_channels, mtproto_import_jobs, parsing_jobs, scheduled_jobs, orchestration_refresh, import_analysis, salesdrive_request_sync]');
};

async function syncAllChannels() {
    const legacySyncEnabled = String(process.env.MTPROTO_LEGACY_SYNC_ENABLED || 'false').toLowerCase() === 'true';
    if (!legacySyncEnabled) {
        logger.info('⏰ Scheduler: Job [sync_telegram_channels] skipped; legacy MTProto sync is disabled.');
        return;
    }

    const sources = await prisma.channelSource.findMany({
        where: { status: 'ACTIVE' },
        include: { connector: true }
    });

    logger.info(`⏰ Scheduler: Found ${sources.length} active channel sources.`);

    for (const source of sources) {
        try {
            await logIntegrationEvent({
                companyId: source.connector?.companyId || undefined,
                integration: 'TELEGRAM_MTPROTO',
                entityId: source.id,
                action: 'channel_sync_started',
                status: 'OK',
                meta: {
                    channelId: source.channelId,
                    title: source.title
                }
            });
            logger.info(`⏰ Scheduler: Syncing ${source.title} (${source.id})...`);
            await MTProtoService.syncChannel(source.connectorId, source.id);
            logger.info(`⏰ Scheduler: Synced ${source.title}.`);
            await logIntegrationEvent({
                companyId: source.connector?.companyId || undefined,
                integration: 'TELEGRAM_MTPROTO',
                entityId: source.id,
                action: 'channel_sync_finished',
                status: 'OK',
                meta: {
                    channelId: source.channelId,
                    title: source.title
                }
            });
            // Rate limit: 2 seconds between channels to avoid FloodWait
            await new Promise(r => setTimeout(r, 2000));
        } catch (e: any) {
            logger.error(`⏰ Scheduler: Failed to sync ${source.title}`, e.message);
            await logIntegrationEvent({
                companyId: source.connector?.companyId || undefined,
                integration: 'TELEGRAM_MTPROTO',
                entityId: source.id,
                action: 'channel_sync_failed',
                status: 'ERROR',
                message: e.message || 'Sync failed',
                meta: {
                    channelId: source.channelId,
                    title: source.title
                }
            });
            // Don't throw, allow other sources to sync
        }
    }
}


async function processScheduledJobs() {
    if (!scheduledJobsTableAvailable) return;
    const now = new Date();
    let jobs: any[] = [];
    try {
        jobs = await prisma.scheduledJob.findMany({
            where: {
                status: 'PENDING',
                runAt: { lte: now }
            },
            take: 50 // batch size
        });
    } catch (e: any) {
        if (isMissingScheduledJobsTable(e)) {
            scheduledJobsTableAvailable = false;
            logger.warn('⏰ Scheduler: ScheduledJob table is missing, scheduled_jobs task disabled until migration is applied.');
            return;
        }
        throw e;
    }

    if (jobs.length === 0) return;
    logger.info(`⏰ Scheduler: Found ${jobs.length} due jobs.`);

    for (const job of jobs) {
        try {
            await prisma.scheduledJob.update({
                where: { id: job.id },
                data: { status: 'PROCESSING' }
            });

            // Handle Job Type
            // For now, we only support specific types or generic 'DELAY'
            // We can emit event or handle logic here
            // If it's a generic delay for scenario, maybe we need ScenarioEngine?
            // User requirement: "Сценарный нод DELAY или SCHEDULE_REMINDER: создаёт ScheduledJob, который потом отправит сообщение пользователю/админу"
            // So logic should happen here or dispatch.

            // Dispatch to Platform Events?
            // e.g. platformEvents.emit('scheduled.job.due', job);

            if (job.type === 'SCENARIO_RESUME') {
                const { botId, chatId, scenarioId, nodeId } = job.payload as any;
                const bot = await prisma.botConfig.findUnique({ where: { id: botId } });
                const session = await prisma.botSession.findFirst({ where: { botId, chatId } });

                if (bot && session && scenarioId && nodeId) {
                    const { ScenarioEngine } = await import('../modules/Communication/bots/scenario.engine.js');
                    const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });

                    if (scenario) {
                        const botRuntime: any = {
                            id: bot.id,
                            token: bot.token,
                            companyId: bot.companyId,
                            config: bot.config,
                            adminChatId: bot.adminChatId,
                            channelId: bot.channelId
                        };

                        await ScenarioEngine.executeNode(
                            botRuntime,
                            session,
                            session.variables as Record<string, any>,
                            session.history as string[],
                            scenario as any,
                            nodeId
                        );
                    }
                }
            }

            // Or simple placeholder implementation for Reminder
            if (job.type === 'REMINDER' || job.type === 'DELAY') {
                // Logic to send message?
                // payload: { botId, chatId, message }
                const p = job.payload as Record<string, any>;
                if (p && p.botId && p.chatId && p.message) {
                    const bot = await prisma.botConfig.findUnique({ where: { id: p.botId } });
                    if (bot) {
                        const { telegramOutbox } = await import('../modules/Communication/telegram/messaging/outbox/telegramOutbox.js');
                        await telegramOutbox.sendMessage({
                            botId: bot.id,
                            token: bot.token,
                            chatId: p.chatId,
                            text: p.message,
                            companyId: bot.companyId
                        });
                    }
                }
            }

            await prisma.scheduledJob.update({
                where: { id: job.id },
                data: { status: 'COMPLETED' }
            });

        } catch (e: any) {
            console.error(`Failed to process job ${job.id}`, e);
            await prisma.scheduledJob.update({
                where: { id: job.id },
                data: {
                    status: 'FAILED',
                    lastError: e.message,
                    attempts: { increment: 1 }
                }
            });
        }
    }
}

// Allow standalone execution for testing
import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    logger.info('⏰ Scheduler: Standalone Run');
    syncAllChannels()
        .then(() => {
            logger.info('⏰ Scheduler: Standalone Run Complete');
            process.exit(0);
        })
        .catch(e => {
            console.error(e);
            process.exit(1);
        });
}
