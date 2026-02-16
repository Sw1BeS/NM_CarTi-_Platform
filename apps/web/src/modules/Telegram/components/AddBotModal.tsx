
import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { ApiClient } from '../../../services/apiClient';
import { useToast } from '../../../contexts/ToastContext';
import { buildDefaultBotMenuConfig, buildDefaultMiniAppConfig } from '../../../services/defaults';

export const AddBotModal = ({ onClose }: any) => {
    const [name, setName] = useState('');
    const [token, setToken] = useState('');
    const [channelId, setChannelId] = useState('');
    const [adminChatId, setAdminChatId] = useState('');
    // Use company base URL if available
    const [companyBaseUrl, setCompanyBaseUrl] = useState(import.meta.env.VITE_API_URL || window.location.origin.replace(/\/$/, ''));
    const [publicBaseUrl, setPublicBaseUrl] = useState('');
    const [mode, setMode] = useState<'polling' | 'webhook'>('polling');
    const [template, setTemplate] = useState<'CLIENT_LEAD' | 'B2B'>('CLIENT_LEAD');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();
    const effectiveBaseUrl = (publicBaseUrl || companyBaseUrl || window.location.origin).replace(/\/$/, '');

    const buildMiniAppUrl = (baseUrl: string, slug: string) => `${baseUrl.replace(/\/$/, '')}/p/app/${slug}`;
    useEffect(() => {
        Data.getSettings()
            .then(settings => {
                const base = (settings.modules || {}).telegram?.publicBaseUrl;
                if (base) setCompanyBaseUrl(base.replace(/\/$/, ''));
            })
            .catch(() => {});
    }, []);

    const handleAdd = async () => {
        if (!token.trim()) {
            showToast('Token is required', 'error');
            return;
        }
        setSaving(true);
        try {
            // Auto-generate temporary slug if name missing, backend will update it
            const tempSlug = name.trim() ? name.trim().toLowerCase().replace(/\s+/g, '_') : 'bot';
            const baseUrl = effectiveBaseUrl.replace(/\/$/, '');
            // We can resolve final URL after backend returns username, but for initial config we use a placeholder or derived
            const miniAppUrl = buildMiniAppUrl(baseUrl, tempSlug); // This will need dynamic update if slug changes

            const menuConfig = buildDefaultBotMenuConfig(template, miniAppUrl);
            const miniAppConfig = buildDefaultMiniAppConfig(template, miniAppUrl, tempSlug);

            const bot = await Data.saveBot({
                name: name.trim(), // Can be empty now
                username: tempSlug, // Backend will override if auto-fetched
                token: token.trim(),
                role: 'CLIENT',
                template,
                active: true,
                defaultShowcaseSlug: tempSlug,
                channelId: channelId || undefined,
                adminChatId: adminChatId || undefined,
                deliveryMode: mode === 'webhook' ? 'webhook' : 'polling',
                config: {
                    publicBaseUrl: publicBaseUrl ? baseUrl || undefined : undefined,
                    deliveryMode: mode,
                    menuConfig,
                    miniAppConfig
                },
                menuConfig,
                miniAppConfig,
                processedUpdateIds: [],
                stats: { processed: 0, ignored: 0, errors: 0, lastRun: '' }
            } as any);

            if (mode === 'webhook' && bot?.id) {
                try {
                    await ApiClient.post(`bots/${bot.id}/webhook`, {
                        publicBaseUrl: effectiveBaseUrl || window.location.origin
                    });
                } catch (err: any) {
                    console.error(err);
                    showToast(err?.message || 'Webhook setup failed; please set manually', 'error');
                }
            }

            showToast("Bot connected");
            onClose();
        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Failed to connect bot', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-md p-8 animate-slide-up shadow-2xl">
                <h3 className="font-bold text-2xl text-[var(--text-primary)] mb-6">Connect Bot</h3>
                <div className="space-y-4">
                    <input className="input" placeholder="Name (Auto-detected if empty)" value={name} onChange={e => setName(e.target.value)} />
                    <input className="input" placeholder="Token" value={token} onChange={e => setToken(e.target.value)} />
                    <input className="input" placeholder="Channel ID (optional)" value={channelId} onChange={e => setChannelId(e.target.value)} />
                    <input className="input" placeholder="Admin Chat ID (optional)" value={adminChatId} onChange={e => setAdminChatId(e.target.value)} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Mode</label>
                            <select className="input" value={mode} onChange={e => setMode(e.target.value as any)}>
                                <option value="polling">Polling</option>
                                <option value="webhook">Webhook</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Template</label>
                            <select className="input" value={template} onChange={e => setTemplate(e.target.value as 'CLIENT_LEAD' | 'B2B')}>
                                <option value="CLIENT_LEAD">Lead Bot</option>
                                <option value="B2B">B2B Network</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1">
                            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                        </button>
                        {showAdvanced && (
                            <div className="mt-3 animate-slide-down">
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Public Base URL (Webhook)</label>
                                <input className="input" placeholder={companyBaseUrl || 'https://your.domain'} value={publicBaseUrl} onChange={e => setPublicBaseUrl(e.target.value)} />
                                <p className="text-[10px] text-[var(--text-secondary)] mt-1">Leave empty to use company base URL.</p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={onClose} className="btn-ghost">Cancel</button>
                        <button onClick={handleAdd} disabled={saving} className="btn-primary px-6">
                            {saving ? 'Connecting...' : 'Connect'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
