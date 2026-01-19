export type DeepLinkPayload =
    | { type: 'dealer_invite'; dealerId: string; requestId?: string }
    | { type: 'request'; requestId: string }
    | { type: 'offer'; requestId: string; offerId?: string };

export function buildStartPayload(payload: DeepLinkPayload): string {
    switch (payload.type) {
        case 'dealer_invite': {
            const parts = ['dealer_invite', payload.dealerId];
            if (payload.requestId) parts.push(payload.requestId);
            return parts.join(':');
        }
        case 'request':
            return `request:${payload.requestId}`;
        case 'offer': {
            const parts = ['offer', payload.requestId];
            if (payload.offerId) parts.push(payload.offerId);
            return parts.join(':');
        }
        default:
            return '';
    }
}

export function buildDeepLink(botUsername: string, payload: DeepLinkPayload): string {
    const cleanUsername = botUsername.replace(/^@/, '').trim();
    const startPayload = buildStartPayload(payload);
    return `https://t.me/${cleanUsername}?start=${encodeURIComponent(startPayload)}`;
}

export function createDeepLinkButton(text: string, link: string) {
    return { text, url: link };
}

export function createDeepLinkKeyboard(buttons: Array<{ text: string; link: string }>) {
    return {
        inline_keyboard: buttons.map(btn => [createDeepLinkButton(btn.text, btn.link)])
    };
}
