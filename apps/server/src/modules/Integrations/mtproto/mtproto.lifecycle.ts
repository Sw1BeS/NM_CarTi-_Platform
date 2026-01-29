import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from './mtproto.service.js';
import { logger } from '../../../utils/logger.js';

export class MTProtoLifeCycle {
    /**
     * Initializes all active MTProto sessions on server startup.
     * This prevents sessions from being lost when the server restarts.
     */
    static async initAll() {
        logger.info('🔄 MTProtoLifeCycle: Initializing saved sessions...');
        try {
            // Find all connectors that are supposed to be active
            const connectors = await prisma.mTProtoConnector.findMany({
                where: {
                    status: { in: ['READY', 'CONNECTED'] },
                    sessionString: { not: null }
                }
            });

            logger.info(`Found ${connectors.length} MTProto sessions to restore.`);

            for (const connector of connectors) {
                try {
                    logger.info(`Restoring session for ${connector.name} (${connector.phone})...`);
                    const client = await MTProtoService.getClient(connector.id);
                    await client.connect();

                    // Verify connection
                    const me = await client.getMe();
                    if (me) {
                        logger.info(`✅ Connected as ${me.username || me.id}`);

                        // Re-attach listeners if any exist in the worker logic
                        // Note: If mtprotoWorker.startLiveSync() handles this, we might be redundant,
                        // but getClient() ensures the client is in the Map.
                    } else {
                        logger.warn(`⚠️ Session invalid for ${connector.id}`);
                        // Optionally update status to ERROR?
                    }
                } catch (err: any) {
                    logger.error(`❌ Failed to restore session ${connector.id}:`, err.message);
                }
            }
            logger.info('✅ MTProtoLifeCycle: Initialization complete.');
        } catch (e: any) {
            logger.error('❌ MTProtoLifeCycle Error:', e);
        }
    }
}
