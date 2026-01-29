import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { MTProtoService } from '../modules/Integrations/mtproto/mtproto.service.js';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

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

    logger.info('⏰ Scheduler: Started. Jobs: [sync_telegram_channels]');
};

async function syncAllChannels() {
    const sources = await prisma.channelSource.findMany({
        where: { status: 'ACTIVE' }
    });

    logger.info(`⏰ Scheduler: Found ${sources.length} active channel sources.`);

    for (const source of sources) {
        try {
            logger.info(`⏰ Scheduler: Syncing ${source.title} (${source.id})...`);
            await MTProtoService.syncChannel(source.connectorId, source.id);
            logger.info(`⏰ Scheduler: Synced ${source.title}.`);
            // Rate limit: 2 seconds between channels to avoid FloodWait
            await new Promise(r => setTimeout(r, 2000));
        } catch (e: any) {
            logger.error(`⏰ Scheduler: Failed to sync ${source.title}`, e.message);
            // Don't throw, allow other sources to sync
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
