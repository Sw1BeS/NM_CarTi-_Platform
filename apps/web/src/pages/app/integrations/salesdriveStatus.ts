export type SalesDriveTone = 'success' | 'warn' | 'danger' | 'muted';

export type SalesDriveConfigSummary = {
    configured?: boolean;
    syncEnabled?: boolean;
    writeEnabled?: boolean;
    missing?: string[];
    apiKeyConfigured?: boolean;
    apiKeyMasked?: string;
};

export type SalesDriveSyncStatusItem = {
    requestId?: string;
    requestPublicId?: string;
    action?: string;
    status?: string;
    reason?: string;
    attempts?: number;
    salesDriveOrderId?: string;
    httpStatus?: number;
    message?: string;
    createdAt?: string;
    sentAt?: string;
    lastErrorAt?: string;
};

export type SalesDriveSyncStatus = {
    counts?: Partial<Record<'queued' | 'sent' | 'failed' | 'skipped', number>>;
    lastSent?: SalesDriveSyncStatusItem | null;
    lastError?: SalesDriveSyncStatusItem | null;
    recent?: SalesDriveSyncStatusItem[];
};

export type SalesDriveConfigRow = {
    label: string;
    value: string;
    tone: SalesDriveTone;
};

const toNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const toText = (value: unknown) => String(value || '').trim();

const itemCode = (item?: SalesDriveSyncStatusItem | null) =>
    toText(item?.requestPublicId) || toText(item?.requestId) || 'Request';

const compactJoin = (parts: string[]) => parts.filter(Boolean).join(' · ');

const itemMessageLabel = (item?: SalesDriveSyncStatusItem | null, empty = 'No events yet') => {
    if (!item) return empty;
    const message = toText(item.message) || toText(item.reason) || 'No message';
    return compactJoin([itemCode(item), message]);
};

export const summarizeSalesDriveSyncStatus = (status: SalesDriveSyncStatus = {}) => {
    const counts = status.counts || {};
    const recent = (status.recent || []).map((item) => ({
        ...item,
        label: compactJoin([
            itemCode(item),
            toText(item.action),
            toText(item.status)
        ]),
        detail: toText(item.message) || toText(item.reason) || ''
    }));

    return {
        totals: [
            { label: 'Queued', value: toNumber(counts.queued), tone: 'warn' as const },
            { label: 'Sent', value: toNumber(counts.sent), tone: 'success' as const },
            { label: 'Failed', value: toNumber(counts.failed), tone: 'danger' as const },
            { label: 'Skipped', value: toNumber(counts.skipped), tone: 'muted' as const }
        ],
        lastSentLabel: itemMessageLabel(status.lastSent, 'No successful sync yet'),
        lastErrorLabel: itemMessageLabel(status.lastError, 'No sync errors yet'),
        recent
    };
};

export const resolveSalesDriveConfigRows = (config: SalesDriveConfigSummary = {}): SalesDriveConfigRow[] => {
    const missing = (config.missing || []).map(toText).filter(Boolean);
    return [
        {
            label: 'Configured',
            value: config.configured ? 'Yes' : 'No',
            tone: config.configured ? 'success' : 'warn'
        },
        {
            label: 'API key',
            value: config.apiKeyConfigured || config.apiKeyMasked ? 'Configured' : 'Missing',
            tone: config.apiKeyConfigured || config.apiKeyMasked ? 'success' : 'warn'
        },
        {
            label: 'Sync queue',
            value: config.syncEnabled ? 'Enabled' : 'Disabled',
            tone: config.syncEnabled ? 'success' : 'muted'
        },
        {
            label: 'Write access',
            value: config.writeEnabled ? 'Enabled' : 'Disabled',
            tone: config.writeEnabled ? 'warn' : 'muted'
        },
        {
            label: 'Missing env',
            value: missing.length ? missing.join(', ') : 'None',
            tone: missing.length ? 'warn' : 'success'
        }
    ];
};
