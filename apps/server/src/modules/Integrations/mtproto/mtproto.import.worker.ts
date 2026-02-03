import { prisma } from '../../../services/prisma.js';
import type { TelegramImportJob } from '@prisma/client';
import { MTProtoService } from './mtproto.service.js';
import { processParsedMessage, processParsedMessageToDraft } from '../../../services/mtproto-mapping.service.js';
import { ChannelSourceRepository } from '../../../repositories/channelSource.repository.js';
import { logIntegrationEvent } from '../../../services/integrationEventLog.service.js';
import { logger } from '../../../utils/logger.js';

const BATCH_LIMIT = 50;
const MAX_MESSAGES_PER_RUN = 200;

export class MTProtoImportWorker {
    private isRunning = false;
    private channelSourceRepo = new ChannelSourceRepository(prisma);

    async runOnce() {
        if (this.isRunning) return;
        this.isRunning = true;

        try {
            const job = await prisma.telegramImportJob.findFirst({
                where: { status: { in: ['PENDING', 'RUNNING'] } },
                orderBy: { createdAt: 'asc' }
            });

            if (!job) return;

            await prisma.telegramImportJob.update({
                where: { id: job.id },
                data: {
                    status: 'RUNNING',
                    startedAt: job.startedAt || new Date(),
                    lastError: null
                }
            });

            await logIntegrationEvent({
                companyId: job.companyId,
                integration: 'TELEGRAM_MTPROTO',
                entityId: job.id,
                action: 'import_started',
                status: 'OK',
                meta: {
                    channelSourceId: job.channelSourceId,
                    fromDate: job.fromDate,
                    toDate: job.toDate,
                    mode: job.mode
                }
            });

            await this.processJob(job);
        } catch (e: any) {
            logger.error('[MTProtoImportWorker] Failed to run:', e);
        } finally {
            this.isRunning = false;
        }
    }

    private async processJob(job: TelegramImportJob) {
        let sourceId: string | null = job.channelSourceId || null;
        try {
            const source = await prisma.channelSource.findUnique({
                where: { id: job.channelSourceId },
                include: { connector: true }
            });

            if (!source) {
                await prisma.telegramImportJob.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', lastError: 'Channel source not found', finishedAt: new Date() }
                });
                return;
            }

            if (!source.connector || source.connector.status !== 'READY') {
                await prisma.telegramImportJob.update({
                    where: { id: job.id },
                    data: { status: 'FAILED', lastError: 'Connector not ready', finishedAt: new Date() }
                });
                return;
            }

            const client = await MTProtoService.getClient(source.connectorId);
            await client.connect();

            const fromDate = job.fromDate as Date;
            const toDate = job.toDate as Date;
            const mode = job.mode === 'DRAFT_ONLY' ? 'DRAFT_ONLY' : 'INVENTORY';

            let offsetDate = job.lastMessageDate
                ? Math.floor(new Date(job.lastMessageDate).getTime() / 1000)
                : Math.floor(toDate.getTime() / 1000);
            let offsetId = job.lastMessageId || 0;

            let totalProcessed = job.totalProcessed || 0;
            let totalImported = job.totalImported || 0;
            let totalSkipped = job.totalSkipped || 0;
            let totalErrors = job.totalErrors || 0;

            let processedThisRun = 0;
            let done = false;

            while (!done && processedThisRun < MAX_MESSAGES_PER_RUN) {
                const batch = await MTProtoService.getHistory(source.connectorId, source.channelId, BATCH_LIMIT, offsetId, offsetDate, {
                    username: source.username,
                    sourceId: source.id
                });
                if (!batch.length) {
                    done = true;
                    break;
                }

                for (const msg of batch) {
                    if (!msg.message) continue;
                    const msgDate = new Date(msg.date * 1000);

                    if (msgDate < fromDate) {
                        done = true;
                        break;
                    }
                    if (msgDate >= toDate) continue;

                    const media = await MTProtoService.extractMediaItems(client, msg, {
                        companyId: source.connector?.companyId,
                        sourceChatId: source.channelId,
                        sourceMessageId: msg.id,
                        channelSourceId: source.id
                    });
                    const message = {
                        chatId: source.channelId,
                        messageId: msg.id,
                        text: msg.message,
                        date: msgDate,
                        mediaUrls: media.mediaUrls,
                        mediaItems: media.mediaItems,
                        mediaGroupKey: msg.groupedId?.toString()
                    };

                    totalProcessed += 1;
                    processedThisRun += 1;

                    try {
                        if (mode === 'DRAFT_ONLY') {
                            const result = await processParsedMessageToDraft(message, source);
                            if (result.imported) totalImported += 1;
                            else totalSkipped += 1;
                        } else {
                            const result = await processParsedMessage(message, source);
                            if (result.created) totalImported += 1;
                            else totalSkipped += 1;
                        }
                    } catch (e) {
                        totalErrors += 1;
                    }

                    if (processedThisRun >= MAX_MESSAGES_PER_RUN) break;
                }

                const last = batch[batch.length - 1];
                if (!last) {
                    done = true;
                } else {
                    offsetId = last.id;
                    offsetDate = last.date;
                }

                await prisma.telegramImportJob.update({
                    where: { id: job.id },
                    data: {
                        lastMessageId: offsetId || job.lastMessageId,
                        lastMessageDate: offsetDate ? new Date(offsetDate * 1000) : job.lastMessageDate,
                        totalProcessed,
                        totalImported,
                        totalSkipped,
                        totalErrors
                    }
                });

                await logIntegrationEvent({
                    companyId: job.companyId,
                    integration: 'TELEGRAM_MTPROTO',
                    entityId: job.id,
                    action: 'import_chunk',
                    status: 'OK',
                    meta: {
                        processedThisRun,
                        totalProcessed,
                        totalImported,
                        totalSkipped,
                        totalErrors,
                        lastMessageId: offsetId || undefined,
                        lastMessageDate: offsetDate ? new Date(offsetDate * 1000) : undefined
                    }
                });
            }

            if (done) {
                await prisma.telegramImportJob.update({
                    where: { id: job.id },
                    data: {
                        status: 'DONE',
                        finishedAt: new Date(),
                        totalProcessed,
                        totalImported,
                        totalSkipped,
                        totalErrors
                    }
                });

                await logIntegrationEvent({
                    companyId: job.companyId,
                    integration: 'TELEGRAM_MTPROTO',
                    entityId: job.id,
                    action: 'import_finished',
                    status: 'OK',
                    meta: {
                        totalProcessed,
                        totalImported,
                        totalSkipped,
                        totalErrors
                    }
                });

                await this.channelSourceRepo.update(source.id, {
                    lastSyncedAt: new Date(),
                    lastError: null,
                    status: 'ACTIVE'
                });
            }
        } catch (e: any) {
            logger.error('[MTProtoImportWorker] Job failed:', e);
            await prisma.telegramImportJob.update({
                where: { id: job.id },
                data: { status: 'FAILED', lastError: e.message || 'Import failed', finishedAt: new Date() }
            });
            await logIntegrationEvent({
                companyId: job.companyId,
                integration: 'TELEGRAM_MTPROTO',
                entityId: job.id,
                action: 'import_failed',
                status: 'ERROR',
                message: e.message || 'Import failed'
            });
            if (sourceId) {
                await this.channelSourceRepo.update(sourceId, {
                    status: 'ERROR',
                    lastError: e.message || 'Import failed'
                });
            }
        }
    }
}

export const mtprotoImportWorker = new MTProtoImportWorker();
