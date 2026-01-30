
export interface MTProtoConnector {
    id: string;
    name: string;
    status: 'DISCONNECTED' | 'CONNECTING' | 'READY' | 'ERROR';
    workspaceApiId?: number;
    // workspaceApiHash not returned for security
    phone?: string;
    connectedAt?: string;
    lastError?: string;
    sessionString?: string; // masked in API
}

export interface MTProtoImportJob {
    id: string;
    connectorId: string;
    channelSourceId: string;
    fromDate: string;
    toDate: string;
    mode: 'DRAFT_ONLY' | 'INVENTORY' | string;
    status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | string;
    startedAt?: string;
    finishedAt?: string;
    lastMessageId?: number;
    lastMessageDate?: string;
    totalProcessed?: number;
    totalImported?: number;
    totalSkipped?: number;
    totalErrors?: number;
    lastError?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface MTProtoPreviewItem {
    messageId: number;
    date: string;
    textPreview?: string;
    action: 'CREATE' | 'SKIP' | 'DUPLICATE' | string;
    reason?: string;
    mapped?: {
        title?: string;
        price?: number;
        year?: number;
        mileage?: number;
        location?: string;
        brand?: string;
        model?: string;
    };
}
