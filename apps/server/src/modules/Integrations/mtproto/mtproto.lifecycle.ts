import { prisma } from '../../../services/prisma.js';
import { MTProtoService } from './mtproto.service.js';

export class MTProtoLifeCycle {
    /**
     * Initializes all active MTProto sessions on server startup.
     * This prevents sessions from being lost when the server restarts.
     */
    static async initAll() {
        console.log('🔄 MTProtoLifeCycle: Initializing saved sessions...');
        try {
            // Find all connectors that are supposed to be active
            const connectors = await prisma.mTProtoConnector.findMany({
                where: {
                    status: { in: ['READY', 'CONNECTED'] },
                    sessionString: { not: null }
                }
            });

            console.log(`Found ${connectors.length} MTProto sessions to restore.`);

            for (const connector of connectors) {
                try {
                    console.log(`Restoring session for ${connector.name} (${connector.phone})...`);
                    const client = await MTProtoService.getClient(connector.id);
                    await client.connect();

                    // Verify connection
                    const me = await client.getMe();
                    if (me) {
                        console.log(`✅ Connected as ${me.username || me.id}`);

                        // Re-attach listeners if any exist in the worker logic
                        // Note: If mtprotoWorker.startLiveSync() handles this, we might be redundant,
                        // but getClient() ensures the client is in the Map.
                    } else {
                        console.warn(`⚠️ Session invalid for ${connector.id}`);
                        // Optionally update status to ERROR?
                    }
                } catch (err: any) {
                    console.error(`❌ Failed to restore session ${connector.id}:`, err.message);
                }
            }
            console.log('✅ MTProtoLifeCycle: Initialization complete.');
        } catch (e: any) {
            console.error('❌ MTProtoLifeCycle Error:', e);
        }
    }
}
