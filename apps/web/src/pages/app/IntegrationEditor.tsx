import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useLang } from '../../contexts/LanguageContext';
import { ApiClient } from '../../services/apiClient';
import { SystemSettings } from '../../types';
import {
    Mail, Share2, Table, Webhook, TestTube, Save, ArrowLeft, Database, RefreshCw, Eye
} from 'lucide-react';
import {
    resolveSalesDriveConfigRows,
    summarizeSalesDriveSyncStatus,
    type SalesDriveConfigSummary,
    type SalesDriveSyncStatus,
    type SalesDriveTone
} from './integrations/salesdriveStatus';

/* -------------------------------------------------------------------------- */
/*                                CONSTANTS                                   */
/* -------------------------------------------------------------------------- */
interface IntegrationConfig {
    type: string;
    path: string; // url slug
    name: string;
    description: string;
    icon: any;
    configFields: { key: string; label: string; type: string; placeholder?: string }[];
}

type SalesDriveHealth = {
    status?: string;
    configured?: boolean;
    syncEnabled?: boolean;
    writeEnabled?: boolean;
    httpStatus?: number;
    message?: string;
};

type SalesDrivePreview = {
    configured?: boolean;
    dryRun?: boolean;
    count?: number;
    items?: Array<{
        externalId?: string;
        title?: string;
        contact?: { name?: string };
        duplicate?: { leadId?: string; provider?: string };
        warnings?: string[];
    }>;
};

export const INTEGRATION_DEFS: IntegrationConfig[] = [
    {
        type: 'SALESDRIVE',
        path: 'salesdrive',
        name: 'SalesDrive',
        description: 'Read-only CRM reference, import preview and request sync status',
        icon: Database,
        configFields: []
    },
    {
        type: 'SENDPULSE',
        path: 'sendpulse',
        name: 'SendPulse',
        description: 'Sync leads to SendPulse mailing lists',
        icon: Mail,
        configFields: [
            { key: 'apiUserId', label: 'API User ID', type: 'text' },
            { key: 'apiSecret', label: 'API Secret', type: 'password' },
            { key: 'listId', label: 'List ID', type: 'text', placeholder: 'Optional' }
        ]
    },
    {
        type: 'META_PIXEL',
        path: 'meta',
        name: 'Meta Pixel',
        description: 'Track events with Facebook/Instagram Pixel',
        icon: Share2,
        configFields: [
            { key: 'pixelId', label: 'Pixel ID', type: 'text' },
            { key: 'accessToken', label: 'Access Token', type: 'password' },
            { key: 'testCode', label: 'Test Code (Optional)', type: 'text' }
        ]
    },
    {
        type: 'GOOGLE_SHEETS',
        path: 'sheets',
        name: 'Google Sheets',
        description: 'Export data to Google Sheets',
        icon: Table,
        configFields: [
            { key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text' },
            { key: 'credentials', label: 'Service Account JSON', type: 'textarea' }
        ]
    },
    {
        type: 'WEBHOOK',
        path: 'webhook',
        name: 'Webhook',
        description: 'Send events to custom webhook URL',
        icon: Webhook,
        configFields: [
            { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://...' },
            { key: 'method', label: 'HTTP Method', type: 'select' },
            { key: 'headers', label: 'Headers (JSON)', type: 'textarea' },
            { key: 'events', label: 'Events (comma-separated)', type: 'text', placeholder: 'lead.created,request.updated' }
        ]
    }
];

/* -------------------------------------------------------------------------- */
/*                                COMPONENT                                   */
/* -------------------------------------------------------------------------- */
export const IntegrationEditor = () => {
    const { type } = useParams<{ type: string }>(); // type is the 'path' slug
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { t } = useLang();

    const [definition, setDefinition] = useState<IntegrationConfig | null>(null);
    const [configData, setConfigData] = useState<Record<string, any>>({});
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [saving, setSaving] = useState(false);
    const [salesDriveConfig, setSalesDriveConfig] = useState<SalesDriveConfigSummary | null>(null);
    const [salesDriveHealth, setSalesDriveHealth] = useState<SalesDriveHealth | null>(null);
    const [salesDriveSyncStatus, setSalesDriveSyncStatus] = useState<SalesDriveSyncStatus | null>(null);
    const [salesDrivePreview, setSalesDrivePreview] = useState<SalesDrivePreview | null>(null);
    const [salesDriveLoading, setSalesDriveLoading] = useState(false);
    const [salesDrivePreviewLoading, setSalesDrivePreviewLoading] = useState(false);

    useEffect(() => {
        const def = INTEGRATION_DEFS.find(d => d.path === type);
        if (def) {
            setDefinition(def);
            if (def.type === 'SALESDRIVE') {
                setConfigData({});
                loadSalesDriveStatus();
                return;
            }
            loadSettings();
            loadConfig(def.type);
        }
    }, [type]);

    const apiGet = async <T,>(endpoint: string) => {
        const res = await ApiClient.get<T>(endpoint);
        if (!res.ok) throw new Error(res.message || 'Request failed');
        return res.data as T;
    };

    const apiPut = async <T,>(endpoint: string, body: any) => {
        const res = await ApiClient.put<T>(endpoint, body);
        if (!res.ok) throw new Error(res.message || 'Request failed');
        return res.data as T;
    };

    const apiPost = async <T,>(endpoint: string, body: any) => {
        const res = await ApiClient.post<T>(endpoint, body);
        if (!res.ok) throw new Error(res.message || 'Request failed');
        return res.data as T;
    };

    const loadSalesDriveStatus = async () => {
        setSalesDriveLoading(true);
        try {
            const [configResult, healthResult, syncResult] = await Promise.allSettled([
                apiGet<SalesDriveConfigSummary>('integrations/salesdrive/config'),
                apiGet<SalesDriveHealth>('integrations/salesdrive/health'),
                apiGet<SalesDriveSyncStatus>('integrations/salesdrive/sync/status')
            ]);

            if (configResult.status === 'fulfilled') setSalesDriveConfig(configResult.value);
            if (healthResult.status === 'fulfilled') setSalesDriveHealth(healthResult.value);
            if (syncResult.status === 'fulfilled') setSalesDriveSyncStatus(syncResult.value);

            if ([configResult, healthResult, syncResult].some(result => result.status === 'rejected')) {
                showToast('SalesDrive status partially unavailable', 'error');
            }
        } catch (e: any) {
            showToast(e.message || 'SalesDrive status unavailable', 'error');
        } finally {
            setSalesDriveLoading(false);
        }
    };

    const loadSalesDrivePreview = async () => {
        setSalesDrivePreviewLoading(true);
        try {
            const preview = await apiGet<SalesDrivePreview>('integrations/salesdrive/preview?limit=10');
            setSalesDrivePreview(preview);
        } catch (e: any) {
            showToast(e.message || 'SalesDrive preview unavailable', 'error');
        } finally {
            setSalesDrivePreviewLoading(false);
        }
    };

    const loadSettings = async () => {
        try {
            const data = await apiGet<SystemSettings>('system/settings');
            setSystemSettings(data);
            // After settings load, we might want to prefill if config is empty?
            // Handled in loadConfig or manually below?
            // Keeping simple for now.
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    };

    const prefillFromSettings = (intType: string, settings: SystemSettings) => {
        if (intType === 'META_PIXEL') {
            return {
                pixelId: settings.metaPixelId || '',
                accessToken: settings.metaToken || '',
                testCode: settings.metaTestCode || ''
            };
        }
        if (intType === 'SENDPULSE') {
            return {
                apiUserId: settings.sendpulseId || '',
                apiSecret: settings.sendpulseSecret || '',
                listId: ''
            };
        }
        return {};
    };

    const loadConfig = async (intType: string) => {
        try {
            const data = await apiGet<any>(`integrations/${intType}`);
            // If empty config, try fallback to system settings?
            // Actually, waiting for settings state depends on race.
            // Let's just trust the API returns existing config, or empty.
            if (data.config && Object.keys(data.config).length > 0) {
                setConfigData(data.config);
            } else {
                // Try prefill if we have settings (might need effect)
                // Just start empty for now to avoid complexity or re-fetch settings
                setConfigData(data.config || {});
            }
        } catch (_e) {
            setConfigData({});
        }
    };

    const saveConfig = async () => {
        if (!definition) return;
        setSaving(true);
        try {
            await apiPut(`integrations/${definition.type}`, {
                config: configData,
                isActive: true
            });

            // Mirror into SystemSettings
            if (definition.type === 'META_PIXEL') {
                await apiPut('system/settings', {
                    metaPixelId: configData.pixelId,
                    metaToken: configData.accessToken,
                    metaTestCode: configData.testCode
                });
            }
            if (definition.type === 'SENDPULSE') {
                await apiPut('system/settings', {
                    sendpulseId: configData.apiUserId,
                    sendpulseSecret: configData.apiSecret
                });
            }

            showToast(t('integrations.toast_saved'), 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const testConnection = async () => {
        if (!definition) return;
        try {
            const result = await apiPost<any>(`integrations/${definition.type}/test`, { config: configData });
            if ((result as any)?.success) {
                showToast(t('integrations.test_success'), 'success');
            } else {
                showToast(`${t('integrations.test_failed')}: ${(result as any)?.error || ''}`, 'error');
            }
        } catch (e: any) {
            showToast(`${t('integrations.test_failed')}: ${e.message}`, 'error');
        }
    };

    const testWebhook = async () => {
        try {
            const results = await apiPost<any>('integrations/webhook/trigger', {
                event: 'test',
                payload: { message: 'Test webhook from Cartie' }
            });
            showToast(`${t('integrations.test_success')} (${Array.isArray(results) ? results.length : 1})`, 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    if (!definition) return <div>Integration not found</div>;

    const Icon = definition.icon;
    const toneClass = (tone: SalesDriveTone) => {
        if (tone === 'success') return 'border-green-500/25 bg-green-500/10 text-green-400';
        if (tone === 'warn') return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
        if (tone === 'danger') return 'border-red-500/25 bg-red-500/10 text-red-300';
        return 'border-white/10 bg-white/[0.04] text-[var(--text-secondary)]';
    };

    if (definition.type === 'SALESDRIVE') {
        const configRows = resolveSalesDriveConfigRows(salesDriveConfig || {});
        const syncSummary = summarizeSalesDriveSyncStatus(salesDriveSyncStatus || {});
        const previewItems = salesDrivePreview?.items || [];
        const duplicateCount = previewItems.filter(item => item.duplicate).length;
        const healthTone: SalesDriveTone = salesDriveHealth?.status === 'OK'
            ? 'success'
            : salesDriveHealth?.status === 'CONFIG_MISSING'
                ? 'warn'
                : salesDriveHealth?.status
                    ? 'danger'
                    : 'muted';

        return (
            <div className="max-w-5xl mx-auto p-6 space-y-6">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/integrations')} className="btn-ghost p-2" aria-label="Back to integrations">
                        <ArrowLeft size={20} />
                    </button>
                    <div className="w-12 h-12 rounded-lg bg-gold-500/20 flex items-center justify-center">
                        <Icon size={24} className="text-gold-500" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{definition.name}</h1>
                        <p className="text-sm text-[var(--text-secondary)]">{definition.description}</p>
                    </div>
                    <button onClick={loadSalesDriveStatus} disabled={salesDriveLoading} className="btn-ghost px-4 py-2 flex items-center gap-2 border border-[var(--border-color)]">
                        <RefreshCw size={16} className={salesDriveLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <section className="panel p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-[var(--text-primary)]">Connector</h2>
                            <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${toneClass(healthTone)}`}>
                                {salesDriveHealth?.status || 'Unknown'}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {configRows.map(row => (
                                <div key={row.label} className={`rounded-lg border p-3 ${toneClass(row.tone)}`}>
                                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{row.label}</div>
                                    <div className="mt-1 text-sm font-semibold">{row.value}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
                            <div className="text-xs font-bold uppercase text-[var(--text-secondary)]">Health</div>
                            <div className="mt-1 text-sm text-[var(--text-primary)]">{salesDriveHealth?.message || 'No health check yet'}</div>
                            {salesDriveHealth?.httpStatus ? (
                                <div className="mt-1 text-xs text-[var(--text-secondary)]">HTTP {salesDriveHealth.httpStatus}</div>
                            ) : null}
                        </div>
                    </section>

                    <section className="panel p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-[var(--text-primary)]">Request Sync</h2>
                            <span className="rounded-full border border-[var(--border-color)] px-3 py-1 text-xs font-bold uppercase text-[var(--text-secondary)]">Last 100 logs</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {syncSummary.totals.map(total => (
                                <div key={total.label} className={`rounded-lg border p-3 ${toneClass(total.tone)}`}>
                                    <div className="text-2xl font-black tabular-nums">{total.value}</div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{total.label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                                <div className="text-xs font-bold uppercase text-green-400">Last sent</div>
                                <div className="mt-1 text-sm text-[var(--text-primary)]">{syncSummary.lastSentLabel}</div>
                            </div>
                            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                <div className="text-xs font-bold uppercase text-red-300">Last error</div>
                                <div className="mt-1 text-sm text-[var(--text-primary)]">{syncSummary.lastErrorLabel}</div>
                            </div>
                        </div>
                    </section>
                </div>

                <section className="panel p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <div>
                            <h2 className="text-lg font-bold text-[var(--text-primary)]">Dry-run Import Preview</h2>
                            <p className="text-sm text-[var(--text-secondary)]">No SalesDrive writes are triggered from this screen.</p>
                        </div>
                        <button onClick={loadSalesDrivePreview} disabled={salesDrivePreviewLoading} className="btn-secondary px-4 py-2 flex items-center justify-center gap-2">
                            <Eye size={16} />
                            {salesDrivePreviewLoading ? 'Loading...' : 'Preview 10'}
                        </button>
                    </div>

                    {salesDrivePreview ? (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${toneClass(salesDrivePreview.configured ? 'success' : 'warn')}`}>
                                    {salesDrivePreview.configured ? 'Configured' : 'Missing config'}
                                </span>
                                <span className="rounded-full border border-[var(--border-color)] px-3 py-1 text-xs font-bold uppercase text-[var(--text-secondary)]">
                                    {salesDrivePreview.count || previewItems.length} item(s)
                                </span>
                                <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${toneClass(duplicateCount ? 'warn' : 'success')}`}>
                                    {duplicateCount} duplicate(s)
                                </span>
                            </div>

                            <div className="divide-y divide-[var(--border-color)] rounded-lg border border-[var(--border-color)] overflow-hidden">
                                {previewItems.length ? previewItems.slice(0, 10).map((item, index) => (
                                    <div key={`${item.externalId || index}`} className="p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-semibold text-[var(--text-primary)]">{item.title || item.externalId || 'SalesDrive order'}</div>
                                            <div className="text-xs text-[var(--text-secondary)]">{item.contact?.name || 'Contact not provided'} · {item.externalId || 'external id missing'}</div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {item.duplicate ? (
                                                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${toneClass('warn')}`}>duplicate</span>
                                            ) : null}
                                            {(item.warnings || []).slice(0, 2).map(warning => (
                                                <span key={warning} className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${toneClass('muted')}`}>{warning}</span>
                                            ))}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="p-4 text-sm text-[var(--text-secondary)]">No preview rows returned.</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-[var(--border-color)] p-4 text-sm text-[var(--text-secondary)]">
                            Run preview to inspect SalesDrive orders before any import decision.
                        </div>
                    )}
                </section>

                <section className="panel p-5">
                    <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Recent Sync Events</h2>
                    <div className="divide-y divide-[var(--border-color)] rounded-lg border border-[var(--border-color)] overflow-hidden">
                        {syncSummary.recent.length ? syncSummary.recent.slice(0, 8).map((item, index) => (
                            <div key={`${item.requestId || item.requestPublicId || index}-${item.createdAt || index}`} className="p-3">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                    <div className="text-sm font-semibold text-[var(--text-primary)]">{item.label}</div>
                                    <div className="text-xs text-[var(--text-secondary)]">{item.createdAt || item.sentAt || item.lastErrorAt || ''}</div>
                                </div>
                                {item.detail ? <div className="mt-1 text-xs text-[var(--text-secondary)]">{item.detail}</div> : null}
                            </div>
                        )) : (
                            <div className="p-4 text-sm text-[var(--text-secondary)]">No SalesDrive sync events recorded yet.</div>
                        )}
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-6">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => navigate('/integrations')} className="btn-ghost p-2">
                    <ArrowLeft size={20} />
                </button>
                <div className="w-12 h-12 rounded-lg bg-gold-500/20 flex items-center justify-center">
                    <Icon size={24} className="text-gold-500" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">{definition.name}</h1>
                    <p className="text-sm text-[var(--text-secondary)]">{definition.description}</p>
                </div>
            </div>

            <div className="panel p-6 space-y-6">
                {definition.configFields.map(field => (
                    <div key={field.key}>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                            {field.label}
                        </label>

                        {field.type === 'textarea' ? (
                            <textarea
                                className="textarea h-32 font-mono text-sm"
                                placeholder={field.placeholder}
                                value={configData[field.key] || ''}
                                onChange={e => setConfigData({ ...configData, [field.key]: e.target.value })}
                            />
                        ) : field.type === 'select' ? (
                            <select
                                className="input"
                                value={configData[field.key] || 'POST'}
                                onChange={e => setConfigData({ ...configData, [field.key]: e.target.value })}
                            >
                                <option value="POST">POST</option>
                                <option value="GET">GET</option>
                                <option value="PUT">PUT</option>
                            </select>
                        ) : (
                            <input
                                className="input"
                                type={field.type}
                                placeholder={field.placeholder}
                                value={configData[field.key] || ''}
                                onChange={e => setConfigData({ ...configData, [field.key]: e.target.value })}
                            />
                        )}
                    </div>
                ))}

                <div className="flex gap-4 pt-4 border-t border-[var(--border-color)]">
                    <button
                        onClick={saveConfig}
                        disabled={saving}
                        className="btn-primary px-8 py-3 flex items-center gap-2"
                    >
                        <Save size={18} />
                        {saving ? 'Saving...' : 'Save Configuration'}
                    </button>

                    {(definition.type === 'META_PIXEL' || definition.type === 'SENDPULSE' || definition.type === 'WEBHOOK') && (
                        <button
                            onClick={definition.type === 'WEBHOOK' ? testWebhook : testConnection}
                            className="btn-ghost px-6 py-3 flex items-center gap-2 border border-[var(--border-color)]"
                        >
                            <TestTube size={18} />
                            Test Connection
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
