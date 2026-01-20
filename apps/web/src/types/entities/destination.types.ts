
export interface TelegramDestination {
    id: string;
    name: string;
    type: 'USER' | 'GROUP' | 'CHANNEL';
    identifier: string;
    tags: string[];
    verified: boolean;
}
