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
 */
export function generateDealerInviteLink(
    botUsername: string,
    dealerId: string,
    requestId?: string
): string {
    const payload = requestId
        ? `dealer_invite:${dealerId}:${requestId}`
        : `dealer_invite:${dealerId}`;
    return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}

/**
 * Generate deep-link for public request sharing
 * @param botUsername Bot username
 * @param publicRequestId Public request ID
 * @returns Full t.me link
 */
export function generateRequestLink(
    botUsername: string,
    publicRequestId: string
): string {
    const payload = `request:${publicRequestId}`;
    return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}

/**
 * Generate deep-link for offer notification
 * @param botUsername Bot username
 * @param requestId Request ID
 * @param offerId Optional offer/variant ID
 * @returns Full t.me link
 */
export function generateOfferLink(
    botUsername: string,
    requestId: string,
    offerId?: string
): string {
    const payload = offerId
        ? `offer:${requestId}:${offerId}`
        : `offer:${requestId}`;
    return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}

/**
 * Parse /start command payload
 * @param payload Raw payload string from /start command
 * @returns Parsed payload object or null if invalid
 */
export function parseStartPayload(payload: string): DeepLinkPayload | null {
    if (!payload || typeof payload !== 'string') return null;

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

        default:
            return {
                type: 'unknown',
                id: payload
            };
    }
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
