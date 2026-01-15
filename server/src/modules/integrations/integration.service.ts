/**
 * Integration Service - Third-party integrations
 * Supports: SendPulse, Meta Pixel, Google Sheets, Webhooks
 */

import { prisma } from '../../services/prisma.js';
import axios from 'axios';

export class IntegrationService {
    /**
     * Get all integrations for company
     */
    async getAll(companyId: string) {
        return prisma.integration.findMany({
            where: { companyId },
            select: {
                id: true,
                type: true,
                isActive: true,
                createdAt: true,
                // Don't expose sensitive config by default
                config: false
            }
        });
    }

    /**
     * Get integration by type
     */
    async getByType(companyId: string, type: string) {
        return prisma.integration.findUnique({
            where: {
                companyId_type: {
                    companyId,
                    type: type as any
                }
            }
        });
    }

    /**
     * Create or update integration
     */
    async upsert(companyId: string, data: {
        type: string;
        config: any;
        isActive?: boolean;
    }) {
        return prisma.integration.upsert({
            where: {
                companyId_type: {
                    companyId,
                    type: data.type as any
                }
            },
            create: {
                companyId,
                type: data.type as any,
                config: data.config,
                isActive: data.isActive !== undefined ? data.isActive : true
            },
            update: {
                config: data.config,
                isActive: data.isActive
            }
        });
    }

    /**
     * Delete integration
     */
    async delete(companyId: string, type: string) {
        const integration = await this.getByType(companyId, type);

        if (!integration) {
            throw new Error('Integration not found');
        }

        return prisma.integration.delete({
            where: { id: integration.id }
        });
    }

    /**
     * Toggle integration active status
     */
    async toggle(companyId: string, type: string, isActive: boolean) {
        const integration = await this.getByType(companyId, type);

        if (!integration) {
            throw new Error('Integration not found');
        }

        return prisma.integration.update({
            where: { id: integration.id },
            data: { isActive }
        });
    }

    // ========================================
    // Integration-specific methods
    // ========================================

    /**
     * SendPulse: Add contact to mailing list
     */
    async sendPulseAddContact(companyId: string, contact: {
        email?: string;
        phone?: string;
        variables?: Record<string, any>;
    }) {
        const integration = await this.getByType(companyId, 'SENDPULSE');

        if (!integration || !integration.isActive) {
            return null; // Integration not configured
        }

        const { apiUserId, apiSecret, listId } = integration.config as any;

        // TODO: Implement SendPulse API call
        // This is a placeholder
        console.log('[SendPulse] Add contact:', contact, 'to list:', listId);

        return { success: true };
    }

    /**
     * Meta Pixel: Track event
     */
    async metaPixelTrackEvent(companyId: string, eventName: string, data?: any) {
        const integration = await this.getByType(companyId, 'META_PIXEL');

        if (!integration || !integration.isActive) {
            return null;
        }

        const { pixelId, accessToken } = integration.config as any;

        // TODO: Implement Meta Conversion API
        console.log('[Meta Pixel] Event:', eventName, 'Data:', data, 'Pixel:', pixelId);

        return { success: true };
    }

    /**
     * Webhook: Trigger webhook for event
     */
    async triggerWebhook(companyId: string, event: string, payload: any) {
        const webhooks = await prisma.integration.findMany({
            where: {
                companyId,
                type: 'WEBHOOK',
                isActive: true
            }
        });

        const results = [];

        for (const webhook of webhooks) {
            const { url, method, headers, events } = webhook.config as any;

            // Check if this webhook listens to this event
            if (!events || !events.includes(event)) {
                continue;
            }

            try {
                const response = await axios({
                    method: method || 'POST',
                    url,
                    headers: headers || { 'Content-Type': 'application/json' },
                    data: {
                        event,
                        payload,
                        timestamp: new Date().toISOString()
                    },
                    timeout: 5000
                });

                results.push({
                    webhookId: webhook.id,
                    success: true,
                    status: response.status
                });
            } catch (e: any) {
                results.push({
                    webhookId: webhook.id,
                    success: false,
                    error: e.message
                });
            }
        }

        return results;
    }

    /**
     * Google Sheets: Export data
     */
    async exportToSheets(companyId: string, data: any[], sheetName?: string) {
        const integration = await this.getByType(companyId, 'GOOGLE_SHEETS');

        if (!integration || !integration.isActive) {
            throw new Error('Google Sheets integration not configured');
        }

        const { spreadsheetId, credentials } = integration.config as any;

        // TODO: Implement Google Sheets API
        console.log('[Google Sheets] Export to:', spreadsheetId, 'Sheet:', sheetName);

        return { success: true, rowsAdded: data.length };
    }

    /**
     * Telegram Channel: Publish post
     */
    async publishTelegramChannelPost(params: {
        companyId: string;
        botToken: string;
        botId?: string;
        destination: string;
        text: string;
        imageUrl?: string;
        keyboard?: any;
    }) {
        const { botToken, destination, text, imageUrl, keyboard, botId } = params;

        try {
            const method = imageUrl ? 'sendPhoto' : 'sendMessage';
            const apiParams = imageUrl
                ? { chat_id: destination, photo: imageUrl, caption: text, parse_mode: 'HTML', reply_markup: keyboard }
                : { chat_id: destination, text, parse_mode: 'HTML', reply_markup: keyboard };

            const url = `https://api.telegram.org/bot${botToken}/${method}`;
            const response = await axios.post(url, apiParams, { timeout: 15000 });

            if (!response.data?.ok) {
                throw new Error(response.data?.description || 'Telegram API error');
            }

            const result = response.data.result;

            // Log to BotMessage for consistency
            // We use raw query for performance and to match existing patterns in apiRoutes
            // Ideally this should be a separate service or repository method
            try {
                if (botId) {
                    await prisma.$executeRaw`
                        INSERT INTO "BotMessage" (id, "botId", "chatId", direction, text, "messageId", payload, "createdAt")
                        VALUES (
                            gen_random_uuid()::text,
                            ${String(botId)},
                            ${String(destination)},
                            'OUTGOING',
                            ${String(text)},
                            ${result?.message_id ?? null},
                            ${JSON.stringify({ markup: keyboard || null })}::jsonb,
                            NOW()
                        )
                    `;
                }
            } catch (e) {
                console.error('[IntegrationService] Failed to log outgoing message:', e);
            }

            return { success: true, result };
        } catch (e: any) {
            console.error('[IntegrationService] Telegram publish error:', e.message || e);
            throw new Error(e.message || 'Failed to publish to Telegram');
        }
    }
}
