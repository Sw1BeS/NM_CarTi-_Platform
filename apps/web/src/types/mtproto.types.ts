
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
