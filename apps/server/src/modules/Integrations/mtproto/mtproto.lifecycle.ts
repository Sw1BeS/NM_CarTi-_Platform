import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from './mtproto.service.js';
import { logger } from '../../../utils/logger.js';

const MTPROTO_AUTH_REVOKED_MARKERS = [
    'SESSION_REVOKED',
    'SESSION_EXPIRED',
    'AUTH_KEY_UNREGISTERED',
    'AUTH_KEY_INVALID',
    'USER_DEACTIVATED'
];

const errorMessage = (error: unknown) => error instanceof Error
    ? error.message
    : String(error || 'MTProto restore failed');

const isAuthRevokedError = (message: string) =>
    MTPROTO_AUTH_REVOKED_MARKERS.some((marker) => message.toUpperCase().includes(marker));

const markConnectorRestoreFailure = async (connectorId: string, message: string) => {
    if (isAuthRevokedError(message)) {
        await MTProtoService.forgetClient(connectorId);
        await prisma.mTProtoConnector.update({
            where: { id: connectorId },
            data: {
                status: 'ERROR',
                sessionString: null,
                lastError: message,
                lastHealthCheckAt: new Date()
            }
        }).catch(() => null);
        return;
    }

    await prisma.mTProtoConnector.update({
        where: { id: connectorId },
        data: {
            lastError: message,
            lastHealthCheckAt: new Date()
        }
    }).catch(() => null);
};

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
                    }
                } catch (err: any) {
                    const message = errorMessage(err);
                    logger.error(`❌ Failed to restore session ${connector.id}:`, message);
                    await markConnectorRestoreFailure(connector.id, message);
                }
            }
            logger.info('✅ MTProtoLifeCycle: Initialization complete.');
        } catch (e: any) {
            logger.error('❌ MTProtoLifeCycle Error:', e);
        }
    }
}
