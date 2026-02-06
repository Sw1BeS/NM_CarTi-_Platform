import { EventEmitter } from 'events';

export const platformEvents = new EventEmitter();

export const EVENTS = {
    MINIAPP_REQUEST_CREATED: 'miniapp.request.created',
    MINIAPP_FAVORITE_ADDED: 'miniapp.favorite.added',
    INVENTORY_INGESTED: 'inventory.ingested'
} as const;

export type PlatformEvents = typeof EVENTS;
