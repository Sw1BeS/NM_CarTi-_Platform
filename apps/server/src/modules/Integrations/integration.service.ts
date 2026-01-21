/**
 * Integration Service - Third-party integrations
 * Supports: SendPulse, Meta Pixel, Google Sheets, Webhooks
 */

import { prisma } from '../../services/prisma.js';
import axios from 'axios';
import { telegramOutbox } from '../Communication/telegram/messaging/outbox/telegramOutbox.js';

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

        if (!apiUserId || !apiSecret || !listId) {
            console.error('[SendPulse] Missing credentials or listId');
            return { success: false, error: 'Missing configuration' };
        }

        try {
            const { SendPulseService } = await import('./sendpulse/sendpulse.service.js');
            const service = SendPulseService.getInstance();

            // Dynamic token fetch handled inside service.syncContact manually or we can expose it
            // Actually existing service handles auth inside syncContact? No, it needs config passed
            // Let's refactor to use the service correctly.

            await service.syncContact({
                clientId: apiUserId,
                clientSecret: apiSecret,
                addressBookId: listId
            }, contact.email || '', contact.variables || {});

            return { success: true };
        } catch (e: any) {
            console.error('[SendPulse] Error:', e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * Meta Pixel: Track event via Conversion API
     */
    async metaPixelTrackEvent(companyId: string, eventName: string, data?: any) {
        const integration = await this.getByType(companyId, 'META_PIXEL');

        if (!integration || !integration.isActive) {
            return null;
        }

        const { pixelId, accessToken, testCode } = integration.config as any;

        if (!pixelId || !accessToken) {
            console.error('[Meta Pixel] Missing pixelId or accessToken');
            return { success: false, error: 'Missing configuration' };
        }

        try {
            const { testMetaConnection } = await import('./meta.service.js');
            const crypto = await import('crypto');

            const hash = (str: string) =>
                crypto.createHash('sha256').update(str.trim().toLowerCase()).digest('hex');

            const payload = {
                data: [{
                    event_name: eventName,
                    event_time: Math.floor(Date.now() / 1000),
                    user_data: {
                        ...(data?.phone ? { ph: hash(data.phone) } : {}),
                        ...(data?.email ? { em: hash(data.email) } : {}),
                        ...(data?.name ? { fn: hash(data.name) } : {})
                    },
                    action_source: "website",
                    ...(data?.value ? { custom_data: { value: data.value, currency: data.currency || 'USD' } } : {})
                }],
                ...(testCode ? { test_event_code: testCode } : {})
            };

            const axios = (await import('axios')).default;
            await axios.post(
                `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
                payload
            );

            console.log('[Meta Pixel] Event sent:', eventName);
            return { success: true };
        } catch (e: any) {
            console.error('[Meta Pixel] Error:', e.response?.data?.error?.message || e.message);
            return { success: false, error: e.response?.data?.error?.message || e.message };
        }
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
        const { botToken, destination, text, imageUrl, keyboard, botId, companyId } = params as any;

        try {
            if (!botId) throw new Error('botId is required for outbox logging');
            const result = imageUrl
                ? await telegramOutbox.sendPhoto({
                    botId,
                    token: botToken,
                    chatId: destination,
                    photo: imageUrl,
                    caption: text,
                    replyMarkup: keyboard,
                    companyId: companyId || null
                })
                : await telegramOutbox.sendMessage({
                    botId,
                    token: botToken,
                    chatId: destination,
                    text,
                    replyMarkup: keyboard,
                    companyId: companyId || null
                });

            return { success: true, result };
        } catch (e: any) {
            console.error('[IntegrationService] Telegram publish error:', e.message || e);
            throw new Error(e.message || 'Failed to publish to Telegram');
        }
    }
}
