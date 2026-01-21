import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useLang } from '../../contexts/LanguageContext';
import {
    Plug, Mail, Share2, Table, Webhook, Settings,
    X, TestTube
} from 'lucide-react';
import { ApiClient } from '../../services/apiClient';
import { SystemSettings } from '../../types';

interface Integration {
    id: string;
    type: string;
    isActive: boolean;
    createdAt: string;
    config?: Record<string, any>;
}

interface IntegrationConfig {
    type: string;
    name: string;
    description: string;
    icon: any;
    configFields: { key: string; label: string; type: string; placeholder?: string }[];
}

const INTEGRATIONS: IntegrationConfig[] = [
    {
        type: 'SENDPULSE',
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
        name: 'Meta Pixel',
        description: 'Track events with Facebook/Instagram Pixel',
        icon: Share2,
        configFields: [
            { key: 'pixelId', label: 'Pixel ID', type: 'text' },
            { key: 'accessToken', label: 'Access Token', type: 'password' }
        ]
    },
    {
        type: 'GOOGLE_SHEETS',
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

export const IntegrationsPage = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [integrations, setIntegrations] = useState<Integration[]>([]);
    const [editingType, setEditingType] = useState<string | null>(null);
    const [configData, setConfigData] = useState<Record<string, any>>({});
    const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadIntegrations();
        loadSettings();
    }, []);

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

    const loadIntegrations = async () => {
        try {
            const data = await apiGet<Integration[]>('integrations');
            setIntegrations(data);
        } catch (e) {
            console.error('Failed to load integrations:', e);
        }
    };

    const loadSettings = async () => {
        try {
            const data = await apiGet<SystemSettings>('system/settings');
            setSystemSettings(data);
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    };

    const prefillFromSettings = (type: string) => {
        if (!systemSettings) return {};
        if (type === 'META_PIXEL') {
            return {
                pixelId: systemSettings.metaPixelId || '',
                accessToken: systemSettings.metaToken || '',
                testCode: systemSettings.metaTestCode || ''
            };
        }
        if (type === 'SENDPULSE') {
            return {
                apiUserId: systemSettings.sendpulseId || '',
                apiSecret: systemSettings.sendpulseSecret || '',
                listId: ''
            };
        }
        return {};
    };

    const loadConfig = async (type: string) => {
        try {
            const data = await apiGet<any>(`integrations/${type}`);
            setConfigData(data.config || prefillFromSettings(type));
            setEditingType(type);
        } catch (_e) {
            setConfigData(prefillFromSettings(type));
            setEditingType(type);
        }
    };

    const saveConfig = async () => {
        if (!editingType) return;
        setSaving(true);
        try {
            await apiPut(`integrations/${editingType}`, {
                config: configData,
                isActive: true
            });

            // Mirror critical credentials into SystemSettings for backend Meta/SendPulse flows
            if (editingType === 'META_PIXEL') {
                await apiPut('system/settings', {
                    metaPixelId: configData.pixelId,
                    metaToken: configData.accessToken,
                    metaTestCode: configData.testCode
                });
                await loadSettings();
            }
            if (editingType === 'SENDPULSE') {
                await apiPut('system/settings', {
                    sendpulseId: configData.apiUserId,
                    sendpulseSecret: configData.apiSecret
                });
                await loadSettings();
            }

            showToast(t('integrations.toast_saved'), 'success');
            setEditingType(null);
            setConfigData({});
            loadIntegrations();
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (type: string, isActive: boolean) => {
        try {
            await apiPost(`integrations/${type}/toggle`, { isActive });
            showToast(isActive ? t('integrations.toast_enabled') : t('integrations.toast_disabled'), 'success');
            loadIntegrations();
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const testConnection = async (type: string) => {
        try {
            const result = await apiPost<any>(`integrations/${type}/test`, { config: configData });
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

    const getIntegrationStatus = (type: string) => {
        return integrations.find(i => i.type === type);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="panel p-6">
                <div className="flex items-center gap-3">
                    <Plug size={24} className="text-gold-500" />
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('integrations.title')}</h1>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">{t('integrations.subtitle')}</p>
                    </div>
                </div>
            </div>

            {/* Integrations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {INTEGRATIONS.map(integration => {
                    const Icon = integration.icon;
                    const status = getIntegrationStatus(integration.type);

                    return (
                        <div key={integration.type} className="panel p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-lg bg-gold-500/20 flex items-center justify-center">
                                        <Icon size={24} className="text-gold-500" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-[var(--text-primary)]">{integration.name}</h3>
                                        <p className="text-xs text-[var(--text-secondary)] mt-1">{integration.description}</p>
                                    </div>
                                </div>

                                {status && (
                                    <button
                                        onClick={() => toggleActive(integration.type, !status.isActive)}
                                        className={`px-3 py-1 rounded text-xs font-bold ${status.isActive
                                            ? 'bg-green-500/20 text-green-500'
                                            : 'bg-gray-500/20 text-gray-500'
                                            }`}
                                    >
                                        {status.isActive ? t('integrations.active') : t('integrations.inactive')}
                                    </button>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => loadConfig(integration.type)}
                                    className="btn-secondary flex-1 py-2 text-xs"
                                >
                                    <Settings size={14} className="inline mr-1" /> {t('integrations.configure')}
                                </button>

                                {integration.type === 'WEBHOOK' && status && (
                                    <button
                                        onClick={testWebhook}
                                        className="btn-ghost px-3 py-2 text-xs"
                                    >
                                        <TestTube size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Config Modal */}
            {editingType && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-2xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-[var(--text-primary)]">
                                {t('integrations.config_modal_title').replace('{{name}}', INTEGRATIONS.find(i => i.type === editingType)?.name || '')}
                            </h3>
                            <button onClick={() => { setEditingType(null); setConfigData({}); }}>
                                <X size={20} className="text-[var(--text-secondary)]" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {INTEGRATIONS.find(i => i.type === editingType)?.configFields.map(field => (
                                <div key={field.key}>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                        {field.label}
                                    </label>

                                    {field.type === 'textarea' ? (
                                        <textarea
                                            className="textarea h-24"
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

                            {/* Test Connection Button (for supported integrations) */}
                            {(editingType === 'META_PIXEL' || editingType === 'SENDPULSE' || editingType === 'WEBHOOK') && (
                                <button
                                    onClick={() => testConnection(editingType)}
                                    className="btn-ghost w-full py-3 flex items-center justify-center gap-2 border border-[var(--border-color)]"
                                >
                                    <TestTube size={18} /> {t('integrations.test_connection')}
                                </button>
                            )}

                            <button onClick={saveConfig} disabled={saving} className="btn-primary w-full py-3">
                                {saving ? 'Saving...' : t('integrations.save_config')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
