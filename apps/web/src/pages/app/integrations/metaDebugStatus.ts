export type MetaDebugTone = 'success' | 'warn' | 'danger' | 'muted';

export type MetaDebugLog = {
    action?: string;
    status?: string;
    entityType?: string;
    entityId?: string;
    idempotencyKey?: string;
    message?: string;
    createdAt?: string;
    meta?: {
        eventId?: string;
        hasPhone?: boolean;
        hasEmail?: boolean;
        hasExternalId?: boolean;
        hasFbp?: boolean;
        hasFbc?: boolean;
    };
};

export type MetaDebugSummary = {
    capiEnabled?: boolean;
    counts?: {
        byStatus?: Record<string, number>;
        byAction?: Record<string, number>;
    };
    lastSent?: MetaDebugLog | null;
    lastError?: MetaDebugLog | null;
    dedup?: {
        eventIdField?: string;
        idempotencyKey?: string;
    };
};

export type MetaDebugRow = {
    label: string;
    value: string;
    tone: MetaDebugTone;
};

const toText = (value: unknown) => String(value || '').trim();
const toNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

const countEntries = (source: Record<string, number> | undefined, toneForKey: (key: string) => MetaDebugTone = () => 'muted') =>
    Object.entries(source || {})
        .filter(([key]) => Boolean(toText(key)))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, value]) => ({
            label,
            value: toNumber(value),
            tone: toneForKey(label)
        }));

const statusOrder = (status: string) => {
    const normalized = status.toUpperCase();
    if (normalized === 'SUCCESS' || normalized === 'OK') return 0;
    if (normalized === 'ERROR' || normalized === 'FAILED') return 1;
    if (normalized === 'WARN' || normalized === 'WARNING') return 2;
    return 3;
};

const logLabel = (log: MetaDebugLog | null | undefined, empty: string) => {
    if (!log) return empty;
    return [
        toText(log.action) || 'Event',
        toText(log.entityId) || toText(log.meta?.eventId),
        toText(log.message) || toText(log.status)
    ].filter(Boolean).join(' · ');
};

export const resolveMetaDedupLabel = (summary: MetaDebugSummary = {}) => {
    const eventId = toText(summary.dedup?.eventIdField) || 'event_id';
    const key = toText(summary.dedup?.idempotencyKey) || 'idempotency key';
    return `${eventId} + ${key}`;
};

export const summarizeMetaDebug = (summary: MetaDebugSummary = {}) => ({
    statusTotals: countEntries(summary.counts?.byStatus, (status) => {
        const normalized = status.toUpperCase();
        if (normalized === 'SUCCESS' || normalized === 'OK') return 'success';
        if (normalized === 'ERROR' || normalized === 'FAILED') return 'danger';
        if (normalized === 'WARN' || normalized === 'WARNING') return 'warn';
        return 'muted';
    }).sort((a, b) => statusOrder(a.label) - statusOrder(b.label) || a.label.localeCompare(b.label)),
    actionTotals: countEntries(summary.counts?.byAction),
    lastSentLabel: logLabel(summary.lastSent, 'No sent Meta CAPI events yet'),
    lastErrorLabel: logLabel(summary.lastError, 'No Meta CAPI errors yet'),
    dedupLabel: resolveMetaDedupLabel(summary)
});

export const resolveMetaDebugRows = (summary: MetaDebugSummary = {}): MetaDebugRow[] => [
    {
        label: 'CAPI dispatch',
        value: summary.capiEnabled ? 'Enabled' : 'Disabled',
        tone: summary.capiEnabled ? 'success' : 'muted'
    },
    {
        label: 'Dedup key',
        value: resolveMetaDedupLabel(summary),
        tone: 'success'
    },
    {
        label: 'Last send',
        value: logLabel(summary.lastSent, 'No sent events'),
        tone: summary.lastSent ? 'success' : 'muted'
    },
    {
        label: 'Last error',
        value: logLabel(summary.lastError, 'No errors'),
        tone: summary.lastError ? 'danger' : 'success'
    }
];
