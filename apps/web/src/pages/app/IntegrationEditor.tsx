import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import { useLang } from '../../contexts/LanguageContext';
import { ApiClient } from '../../services/apiClient';
import { SystemSettings } from '../../types';
import {
    Plug, Mail, Share2, Table, Webhook, TestTube, Save, ArrowLeft
} from 'lucide-react';

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

export const INTEGRATION_DEFS: IntegrationConfig[] = [
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

    useEffect(() => {
        const def = INTEGRATION_DEFS.find(d => d.path === type);
        if (def) {
            setDefinition(def);
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
