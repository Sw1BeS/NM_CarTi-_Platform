
import React, { useState } from 'react';
import { Data } from '../../../services/data';
import { ApiClient } from '../../../services/apiClient';
import { useToast } from '../../../contexts/ToastContext';
import { DEFAULT_MENU_CONFIG, DEFAULT_MINI_APP_CONFIG } from '../../../services/defaults';
import { X } from 'lucide-react';

export const AddBotModal = ({ onClose }: any) => {
    const [name, setName] = useState('');
    const [token, setToken] = useState('');
    const [channelId, setChannelId] = useState('');
    const [adminChatId, setAdminChatId] = useState('');
    // Use env var or window origin
    const [publicBaseUrl, setPublicBaseUrl] = useState(import.meta.env.VITE_API_URL || window.location.origin.replace(/\/$/, ''));
    const [mode, setMode] = useState<'polling' | 'webhook'>('polling');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    const handleAdd = async () => {
        if (!name.trim() || !token.trim()) {
            showToast('Name and token are required', 'error');
            return;
        }
        setSaving(true);
        try {
            const bot = await Data.saveBot({
                name: name.trim(),
                username: name.trim().toLowerCase().replace(/\s+/g, '_'),
                token: token.trim(),
                role: 'CLIENT',
                active: true,
                channelId: channelId || undefined,
                adminChatId: adminChatId || undefined,
                deliveryMode: mode === 'webhook' ? 'webhook' : 'polling',
                config: {
                    publicBaseUrl: publicBaseUrl || undefined,
                    deliveryMode: mode,
                    menuConfig: DEFAULT_MENU_CONFIG,
                    miniAppConfig: DEFAULT_MINI_APP_CONFIG
                },
                menuConfig: DEFAULT_MENU_CONFIG,
                miniAppConfig: DEFAULT_MINI_APP_CONFIG,
                processedUpdateIds: [],
                stats: { processed: 0, ignored: 0, errors: 0, lastRun: '' }
            } as any);

            if (mode === 'webhook' && bot?.id) {
                try {
                    await ApiClient.post(`bots/${bot.id}/webhook`, {
                        publicBaseUrl: publicBaseUrl || window.location.origin
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
                    <input className="input" placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
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
                    </div>

                    <div className="pt-2">
                        <button onClick={() => setShowAdvanced(!showAdvanced)} className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1">
                            {showAdvanced ? 'Hide' : 'Show'} Advanced Settings
                        </button>
                        {showAdvanced && (
                             <div className="mt-3 animate-slide-down">
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Public Base URL (Webhook)</label>
                                <input className="input" placeholder="https://your.domain" value={publicBaseUrl} onChange={e => setPublicBaseUrl(e.target.value)} />
                                <p className="text-[10px] text-[var(--text-secondary)] mt-1">Leave as is unless you are using a tunnel or custom domain proxy.</p>
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
