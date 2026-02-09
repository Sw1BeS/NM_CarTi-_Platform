/**
 * Deep-Link Utilities for Telegram Bot
 * 
 * Generates and parses deep-links for B2B dealer invitations,
 * request sharing, and offer notifications.
 */

export interface DeepLinkPayload {
    type: 'dealer_invite' | 'request' | 'offer' | 'unknown';
    id: string;
    metadata?: Record<string, any>;
}

/**
 * Generate deep-link for dealer invitation from channel
 * @param botUsername Bot username (without @)
 * @param dealerId Dealer ID or request public ID
 * @param requestId Optional request ID for context
 * @returns Full t.me link
 * 
 * FORMAT: dealer_invite_{dealerId} or dealer_invite_{dealerId}_{requestId}
 * Telegram-safe: uses underscore, no colons
 */
export function generateDealerInviteLink(
    botUsername: string,
    dealerId: string,
    requestId?: string
): string {
    const payload = requestId
        ? `dealer_invite_${dealerId}_${requestId}`
        : `dealer_invite_${dealerId}`;

    // Validate payload length (Telegram limit: 64 chars)
    if (payload.length > 64) {
        throw new Error(`Deep-link payload exceeds 64 chars: ${payload.length}`);
    }

    return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}

/**
 * Generate deep-link for public request sharing
 * @param botUsername Bot username
 * @param publicRequestId Public request ID
 * @returns Full t.me link
 * 
 * FORMAT: request_{publicId}
 */
export function generateRequestLink(
    botUsername: string,
    publicRequestId: string
): string {
    const payload = `request_${publicRequestId}`;

    if (payload.length > 64) {
        throw new Error(`Deep-link payload exceeds 64 chars: ${payload.length}`);
    }

    return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}

/**
 * Generate deep-link for offer notification
 * @param botUsername Bot username
 * @param requestId Request ID
 * @param offerId Optional offer/variant ID
 * @returns Full t.me link
 * 
 * FORMAT: offer_{requestId} or offer_{requestId}_{offerId}
 */
export function generateOfferLink(
    botUsername: string,
    requestId: string,
    offerId?: string
): string {
    const payload = offerId
        ? `offer_${requestId}_${offerId}`
        : `offer_${requestId}`;

    if (payload.length > 64) {
        throw new Error(`Deep-link payload exceeds 64 chars: ${payload.length}`);
    }

    return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}

/**
 * Generate deep-link for inventory item
 * @param botUsername Bot username
 * @param inventoryId Inventory/listing ID
 * @returns Full t.me link
 * 
 * FORMAT: inv_{inventoryId}
 */
export function generateInventoryLink(
    botUsername: string,
    inventoryId: string
): string {
    const payload = `inv_${inventoryId}`;

    if (payload.length > 64) {
        throw new Error(`Deep-link payload exceeds 64 chars: ${payload.length}`);
    }

    return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}

/**
 * Parse /start command payload
 * @param payload Raw payload string from /start command
 * @returns Parsed payload object or null if invalid
 * 
 * SUPPORTS BOTH FORMATS:
 * - NEW: request_<id>, offer_<id>, inv_<id>, dealer_invite_<id>
 * - OLD (backward compat): request:<id>, offer:<id>, inventory:<id>
 */
export function parseStartPayload(payload: string): DeepLinkPayload | null {
    if (!payload || typeof payload !== 'string') return null;

    // Try new format first (underscore-based, Telegram-safe)
    if (payload.includes('_')) {
        const parts = payload.split('_');
        if (parts.length < 2) return null;

        const [type, id, ...rest] = parts;

        switch (type) {
            case 'dealer':
                // dealer_invite_<id> or dealer_invite_<id>_<requestId>
                if (parts[1] === 'invite' && parts[2]) {
                    return {
                        type: 'dealer_invite',
                        id: parts[2],
                        metadata: parts[3] ? { requestId: parts[3] } : undefined
                    };
                }
                break;

            case 'request':
                return {
                    type: 'request',
                    id
                };

            case 'offer':
                return {
                    type: 'offer',
                    id,
                    metadata: rest.length > 0 ? { offerId: rest[0] } : undefined
                };

            case 'inv':
                return {
                    type: 'request', // Treat as request for backward compat
                    id,
                    metadata: { inventoryMode: true }
                };

            default:
                break;
        }
    }

    // Fall back to old format (colon-based, backward compatibility)
    if (payload.includes(':')) {
        const parts = payload.split(':');
        if (parts.length < 2) return null;

        const [type, id, ...rest] = parts;

        switch (type) {
            case 'dealer_invite':
                return {
                    type: 'dealer_invite',
                    id,
                    metadata: rest.length > 0 ? { requestId: rest[0] } : undefined
                };

            case 'request':
                return {
                    type: 'request',
                    id
                };

            case 'offer':
                return {
                    type: 'offer',
                    id,
                    metadata: rest.length > 0 ? { offerId: rest[0] } : undefined
                };

            case 'inventory':
                return {
                    type: 'request', // Map to request type
                    id,
                    metadata: { inventoryMode: true }
                };

            default:
                return {
                    type: 'unknown',
                    id: payload
                };
        }
    }

    // No recognizable format
    return {
        type: 'unknown',
        id: payload
    };
}

/**
 * Create inline button with deep-link
 * @param text Button text
 * @param link Deep-link URL
 * @returns Telegram inline button object
 */
export function createDeepLinkButton(text: string, link: string) {
    return {
        text,
        url: link
    };
}

/**
 * Create inline keyboard with deep-link buttons
 * @param buttons Array of button configs
 * @returns Telegram inline keyboard markup
 */
export function createDeepLinkKeyboard(
    buttons: Array<{ text: string; link: string }>
) {
    return {
        inline_keyboard: buttons.map(btn => [createDeepLinkButton(btn.text, btn.link)])
    };
}
