import { ApiClient } from './apiClient';

export interface MTProtoConnector {
    id: string;
    name: string;
    status: string;
    phone?: string;
    sessionString?: string | null;
}

export interface MTProtoSendCodeResult {
    phoneCodeHash: string;
    isCodeViaApp: boolean;
    sentCodeType?: string | null;
    nextCodeType?: string | null;
    codeLength?: number | null;
    timeoutAt?: string | null;
    forceSmsAttempted?: boolean;
    forceSmsSucceeded?: boolean;
    forceSmsError?: string | null;
    initialSentCodeType?: string | null;
}

export interface ChannelSource {
    id: string;
    title: string;
    username?: string;
    channelId: string;
    status: string;
    lastSyncedAt?: string;
    importRules?: any;
}

export interface ImportPreview {
    mode: string;
    fromDate: string;
    toDate: string;
    items: {
        messageId: number;
        textPreview: string;
        action: string;
        reason?: string;
        mapped: boolean;
        date: string;
    }[];
}

export const mtprotoService = {
    // Connectors
    listConnectors: async () => {
        const res = await ApiClient.get<MTProtoConnector[]>('/integrations/mtproto/connectors');
        if (!res.ok) throw new Error(res.message);
        return res.data;
    },

    // Auth
    sendCode: async (connectorId: string, phone: string, options: { forceSms?: boolean } = {}) => {
        const res = await ApiClient.post<MTProtoSendCodeResult>('/integrations/mtproto/auth/send-code', { connectorId, phone, ...options });
        if (!res.ok) throw new Error(res.message);
        return res.data;
    },
    signIn: async (payload: any) => {
        const res = await ApiClient.post<{ success: boolean }>('/integrations/mtproto/auth/sign-in', payload);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    },

    // Channels
    listChannels: async (connectorId: string) => {
        const res = await ApiClient.get<ChannelSource[]>(`/integrations/mtproto/${connectorId}/channels`);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    },
    resolveChannel: async (connectorId: string, query: string) => {
        const res = await ApiClient.get<any>(`/integrations/mtproto/${connectorId}/resolve?query=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    },
    addChannel: async (connectorId: string, channel: any) => {
        const res = await ApiClient.post<ChannelSource>(`/integrations/mtproto/${connectorId}/channels`, { channel });
        if (!res.ok) throw new Error(res.message);
        return res.data;
    },

    // Import
    previewImport: async (connectorId: string, sourceId: string, payload: { fromDate: string; toDate: string; mode: string }) => {
        const res = await ApiClient.post<ImportPreview>(`/integrations/mtproto/${connectorId}/channels/${sourceId}/preview`, payload);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    },
    startImport: async (connectorId: string, sourceId: string, payload: { fromDate: string; toDate: string; mode: string }) => {
        const res = await ApiClient.post<any>(`/integrations/mtproto/${connectorId}/channels/${sourceId}/import`, payload);
        if (!res.ok) throw new Error(res.message);
        return res.data;
    },

    // Jobs
    listJobs: async (sourceId?: string) => {
        const res = await ApiClient.get<any[]>('/integrations/mtproto/import-jobs' + (sourceId ? `?sourceId=${sourceId}` : ''));
        if (!res.ok) throw new Error(res.message);
        return res.data;
    }
};
