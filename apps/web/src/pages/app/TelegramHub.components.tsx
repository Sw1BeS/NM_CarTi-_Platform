import React, { useState, useEffect } from 'react';
import { Data } from '../../services/data';
import { ApiClient } from '../../services/apiClient';
import { TelegramAPI } from '../../services/telegram';
import { useToast } from '../../contexts/ToastContext';
import { Bot } from '../../types';
import { DEFAULT_MENU_CONFIG, DEFAULT_MINI_APP_CONFIG } from '../../services/defaults';
import { AlertTriangle, Activity, Globe, Terminal } from 'lucide-react';

export const AddBotModal = ({ onClose }: { onClose: () => void }) => {
    const [name, setName] = useState('');
    const [token, setToken] = useState('');
    const [channelId, setChannelId] = useState('');
    const [adminChatId, setAdminChatId] = useState('');
    // @ts-ignore
    const envUrl = import.meta.env.VITE_PUBLIC_URL;
    const [publicBaseUrl, setPublicBaseUrl] = useState(envUrl || window.location.origin.replace(/\/$/, ''));
    const [mode, setMode] = useState<'polling' | 'webhook'>('polling');
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
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Public Base URL (HTTPS)</label>
                            <input className="input" placeholder="https://your.domain" value={publicBaseUrl} onChange={e => setPublicBaseUrl(e.target.value)} />
                            {publicBaseUrl.includes('localhost') && (
                                <div className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                                    <AlertTriangle size={10} /> Localhost won't work for Telegram Webhooks/Mini Apps
                                </div>
                            )}
                        </div>
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

export const BotSettings = ({ bot }: { bot: Bot }) => {
    const { showToast } = useToast();
    const [form, setForm] = useState(bot);

    // Diagnostic stats
    const lastError = TelegramAPI.lastError;

    useEffect(() => { setForm(bot); }, [bot.id]);

    const save = async () => {
        await Data.saveBot(form);
        showToast("Settings Saved");
    };

    const handleSyncMenu = async () => {
        try {
            // Respect publicBaseUrl
            const baseUrl = form.publicBaseUrl || window.location.origin;
            const appUrl = `${baseUrl}/#/p/app`;
            await TelegramAPI.setChatMenuButton(form.token, "Open App", appUrl);
            showToast("Menu Button Synced");
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const handleSyncCommands = async () => {
        try {
            const scenarios = await Data.getScenarios();
            const commands = scenarios.filter(s => s.isActive && s.triggerCommand).map(s => ({ command: s.triggerCommand, description: s.name }));
            commands.push({ command: 'start', description: 'Restart' });
            commands.push({ command: 'menu', description: 'Menu' });
            await TelegramAPI.setMyCommands(form.token, commands);
            showToast("Commands Synced");
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const getMiniAppUrl = () => {
        if (!form.username) return '';
        // Assuming default app name is 'app' or 'startapp' parameter
        return `https://t.me/${form.username}/app`; // Standard deep link
    };

    return (
        <div className="max-w-2xl mx-auto p-8 space-y-8 overflow-y-auto h-full">
            <div className="panel p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-4">
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">General Settings</h3>
                    {form.username && (
                        <a
                            href={getMiniAppUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-blue-500 hover:underline flex items-center gap-1"
                        >
                            Open Mini App <Globe size={12} />
                        </a>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Bot Name</label>
                        <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Username</label>
                        <input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">API Token</label>
                    <input className="input font-mono text-sm" type="password" value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} />
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Public App Base URL</label>
                    <input className="input font-mono text-sm" placeholder="https://your-domain.com" value={form.publicBaseUrl || ''} onChange={e => setForm({ ...form, publicBaseUrl: e.target.value })} />
                    {!form.publicBaseUrl && (
                        <div className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                            <AlertTriangle size={10} /> Using current origin. Mini App may not open if local/private.
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between bg-[var(--bg-input)] p-4 rounded-xl">
                    <span className="font-bold text-[var(--text-primary)]">Auto-Sync</span>
                    <button onClick={() => setForm({ ...form, active: !form.active })} className={`w-12 h-6 rounded-full relative transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.active ? 'left-7' : 'left-1'}`}></div>
                    </button>
                </div>
                <div className="flex justify-end">
                    <button onClick={save} className="btn-primary px-6">Save Changes</button>
                </div>
            </div>

            {/* DIAGNOSTICS PANEL */}
            <div className="panel p-6 border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-2 mb-4">
                    <Activity size={20} className="text-blue-500" />
                    <h3 className="font-bold text-blue-500">Diagnostics & Network</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-[var(--bg-input)] p-3 rounded-lg">
                        <div className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Polling Status</div>
                        <div className="font-mono text-sm text-[var(--text-primary)] mt-1 flex items-center gap-2">
                            {form.active ? <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> : <span className="w-2 h-2 bg-red-500 rounded-full"></span>}
                            {form.active ? 'Active' : 'Stopped'}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                    <button onClick={async () => {
                        try {
                            await TelegramAPI.getMe(form.token);
                            showToast("Connection OK");
                        } catch (e: any) { showToast(e.message, 'error'); }
                    }} className="btn-secondary text-xs py-1.5">Test Connection</button>

                    <button onClick={() => {
                        form.lastUpdateId = 0;
                        save();
                        showToast("Offset Reset to 0");
                    }} className="btn-secondary text-xs py-1.5">Reset Offset</button>

                    <button onClick={() => {
                        form.processedUpdateIds = [];
                        save();
                        showToast("Dedupe Buffer Cleared");
                    }} className="btn-secondary text-xs py-1.5">Clear Buffer</button>

                    <button onClick={handleSyncMenu} className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
                        <Globe size={12} /> Sync Menu URL
                    </button>

                    <button onClick={handleSyncCommands} className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
                        <Terminal size={12} /> Sync Commands
                    </button>
                </div>

                {lastError && (
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-start gap-2">
                        <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                            <div className="text-xs font-bold text-red-500">Last Network Error</div>
                            <div className="text-xs text-red-400 font-mono mt-1 break-all">{lastError}</div>
                        </div>
                    </div>
                )}
            </div>

            <div className="panel p-6 border-red-500/20 bg-red-500/5">
                <h3 className="font-bold text-red-500 mb-2">Danger Zone</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">Disconnecting the bot will stop all automation.</p>
                <button onClick={async () => { if (confirm("Disconnect bot?")) { await Data.deleteBot(bot.id); window.location.reload(); } }} className="btn-secondary text-red-500 border-red-500/30 hover:bg-red-500/10">Disconnect Bot</button>
            </div>
        </div>
    );
};
