import React, { useEffect, useState } from 'react';
import { ApiClient } from '../../../services/apiClient';
import { useToast } from '../../../contexts/ToastContext';
import { TelegramRegistryItem } from '../../../types';
import { Activity, AlertTriangle, PauseCircle, PlayCircle, RefreshCw, Search, Plus, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

type RegistryLogItem = {
    type: string;
    messageId?: number;
    title?: string;
    status?: string;
    direction?: string;
    text?: string;
    createdAt?: string;
};

const statusStyles: Record<string, string> = {
    ACTIVE: 'bg-green-500/10 text-green-500 border-green-500/30',
    PAUSED: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    ERROR: 'bg-red-500/10 text-red-500 border-red-500/30',
    DISCOVERED: 'bg-blue-500/10 text-blue-500 border-blue-500/30'
};

export const SourcesDestinationsRegistry = () => {
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [items, setItems] = useState<TelegramRegistryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeLogs, setActiveLogs] = useState<TelegramRegistryItem | null>(null);
    const [logs, setLogs] = useState<RegistryLogItem[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({
        title: '',
        tgId: '',
        username: '',
        type: 'USER',
        access: 'BOT',
        role: 'DESTINATION'
    });

    const loadItems = async () => {
        setLoading(true);
        try {
            const res = await ApiClient.get<TelegramRegistryItem[]>('integrations/telegram/registry');
            if (!res.ok) throw new Error(res.message);
            setItems(res.data || []);
        } catch (e: any) {
            showToast(e.message || 'Failed to load registry', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadItems();
    }, []);

    const handlePause = async (item: TelegramRegistryItem) => {
        try {
            await ApiClient.post(`integrations/telegram/registry/${item.id}/pause`, {});
            showToast('Source paused', 'success');
            loadItems();
        } catch (e: any) {
            showToast(e.message || 'Pause failed', 'error');
        }
    };

    const handleResume = async (item: TelegramRegistryItem) => {
        try {
            await ApiClient.post(`integrations/telegram/registry/${item.id}/resume`, {});
            showToast('Source resumed', 'success');
            loadItems();
        } catch (e: any) {
            showToast(e.message || 'Resume failed', 'error');
        }
    };

    const handleSync = async (item: TelegramRegistryItem) => {
        try {
            await ApiClient.post(`integrations/telegram/registry/${item.id}/sync`, {});
            showToast('Sync started', 'success');
            loadItems();
        } catch (e: any) {
            showToast(e.message || 'Sync failed', 'error');
        }
    };

    const openLogs = async (item: TelegramRegistryItem) => {
        setActiveLogs(item);
        setLogs([]);
        setLogsLoading(true);
        try {
            const res = await ApiClient.get<RegistryLogItem[]>(`integrations/telegram/registry/${item.id}/logs`);
            if (!res.ok) throw new Error(res.message);
            setLogs(res.data || []);
        } catch (e: any) {
            showToast(e.message || 'Failed to load logs', 'error');
        } finally {
            setLogsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!form.title.trim() || !form.tgId.trim()) {
            showToast('Title and Telegram ID are required', 'error');
            return;
        }
        setCreating(true);
        try {
            const res = await ApiClient.post('integrations/telegram/registry', {
                title: form.title,
                tgId: form.tgId,
                username: form.username || undefined,
                type: form.type,
                access: form.access,
                role: form.role
            });
            if (!res.ok) throw new Error(res.message);
            showToast('Destination created', 'success');
            setIsCreateOpen(false);
            setForm({ title: '', tgId: '', username: '', type: 'USER', access: 'BOT', role: 'DESTINATION' });
            loadItems();
        } catch (e: any) {
            showToast(e.message || 'Create failed', 'error');
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-[var(--text-secondary)]">Loading registry...</div>;
    }

    return (
        <div className="p-6 h-full overflow-y-auto">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                <div>
                    <h3 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Activity className="text-gold-500" size={24} />
                        Sources & Destinations
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Unified registry for Telegram sources, destinations, and dialogs
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={loadItems} className="btn-secondary px-4 py-2 flex items-center gap-2">
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button onClick={() => setIsCreateOpen(true)} className="btn-primary px-4 py-2 flex items-center gap-2">
                        <Plus size={14} /> Add
                    </button>
                </div>
            </div>

            {items.length === 0 ? (
                <div className="panel p-10 text-center">
                    <Search size={48} className="mx-auto mb-4 text-[var(--text-secondary)] opacity-40" />
                    <p className="text-[var(--text-secondary)]">No sources or destinations configured yet</p>
                    <div className="mt-4 flex flex-col sm:flex-row gap-2 justify-center">
                        <button
                            onClick={() => navigate('/telegram?tab=MTPROTO')}
                            className="btn-secondary px-4 py-2"
                        >
                            Connect MTProto
                        </button>
                        <button onClick={() => setIsCreateOpen(true)} className="btn-primary px-4 py-2">
                            Add Destination
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4">
                    {items.map(item => {
                        const status = item.status || 'ACTIVE';
                        const statusStyle = statusStyles[status] || 'bg-[var(--bg-input)] text-[var(--text-secondary)] border-[var(--border-color)]';
                        const isSource = item.role === 'SOURCE' || item.role === 'BOTH';
                        const canSync = item.access === 'MTPROTO' && isSource && status !== 'PAUSED';
                        const canPause = status !== 'PAUSED';

                        return (
                            <div key={item.id} className="panel p-4 border border-[var(--border-color)] bg-[var(--bg-panel)]">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-xs">
                                            TG
                                        </div>
                                        <div>
                                            <div className="font-bold text-[var(--text-primary)]">{item.title}</div>
                                            <div className="text-xs text-[var(--text-secondary)]">
                                                {item.username ? `@${item.username}` : item.tgId}
                                            </div>
                                            <div className="text-[10px] text-[var(--text-muted)] uppercase mt-1">
                                                {item.role} · {item.access} · {item.type}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${statusStyle}`}>{status}</span>
                                        {canSync && (
                                            <button onClick={() => handleSync(item)} className="btn-secondary px-2 py-1 text-xs flex items-center gap-1">
                                                <RefreshCw size={12} /> Sync
                                            </button>
                                        )}
                                        {status === 'ERROR' && (
                                            <button onClick={() => handleSync(item)} className="btn-secondary px-2 py-1 text-xs flex items-center gap-1">
                                                <AlertTriangle size={12} /> Retry
                                            </button>
                                        )}
                                        {canPause ? (
                                            <button onClick={() => handlePause(item)} className="btn-ghost px-2 py-1 text-xs flex items-center gap-1 text-[var(--text-secondary)]">
                                                <PauseCircle size={12} /> Pause
                                            </button>
                                        ) : (
                                            <button onClick={() => handleResume(item)} className="btn-ghost px-2 py-1 text-xs flex items-center gap-1 text-[var(--text-secondary)]">
                                                <PlayCircle size={12} /> Resume
                                            </button>
                                        )}
                                        <button onClick={() => openLogs(item)} className="btn-ghost px-2 py-1 text-xs flex items-center gap-1 text-[var(--text-secondary)]">
                                            <FileText size={12} /> Logs
                                        </button>
                                    </div>
                                </div>
                                <div className="mt-3 text-xs text-[var(--text-secondary)] flex flex-col gap-1">
                                    <span>
                                        Last sync: {item.lastSyncAt ? new Date(item.lastSyncAt).toLocaleString() : '—'}
                                    </span>
                                    {item.lastError && (
                                        <span className="text-red-400">Last error: {item.lastError}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {activeLogs && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-2xl p-6">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h4 className="font-bold text-[var(--text-primary)] text-lg">Logs</h4>
                                <p className="text-xs text-[var(--text-secondary)]">{activeLogs.title}</p>
                            </div>
                            <button className="btn-ghost" onClick={() => setActiveLogs(null)}>Close</button>
                        </div>
                        {logsLoading ? (
                            <div className="text-center text-[var(--text-secondary)]">Loading logs...</div>
                        ) : logs.length === 0 ? (
                            <div className="text-center text-[var(--text-secondary)]">No logs yet</div>
                        ) : (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {logs.map((log, idx) => (
                                    <div key={`${log.type}-${idx}`} className="p-3 rounded border border-[var(--border-color)] bg-[var(--bg-input)]">
                                        <div className="text-xs text-[var(--text-secondary)] flex justify-between">
                                            <span>{log.type}</span>
                                            <span>{log.createdAt ? new Date(log.createdAt).toLocaleString() : ''}</span>
                                        </div>
                                        {log.title && <div className="text-sm text-[var(--text-primary)] mt-1">{log.title}</div>}
                                        {log.text && <div className="text-xs text-[var(--text-secondary)] mt-1">{log.text}</div>}
                                        {log.status && <div className="text-[10px] uppercase mt-1 text-[var(--text-muted)]">Status: {log.status}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isCreateOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-md p-6">
                        <h4 className="font-bold text-[var(--text-primary)] text-lg mb-4">Add Destination</h4>
                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Title</label>
                                <input
                                    className="input"
                                    value={form.title}
                                    onChange={e => setForm({ ...form, title: e.target.value })}
                                    placeholder="e.g. Sales Channel"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Telegram ID</label>
                                <input
                                    className="input"
                                    value={form.tgId}
                                    onChange={e => setForm({ ...form, tgId: e.target.value })}
                                    placeholder="e.g. -1001234567890"
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Username (optional)</label>
                                <input
                                    className="input"
                                    value={form.username}
                                    onChange={e => setForm({ ...form, username: e.target.value })}
                                    placeholder="@channel"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Type</label>
                                    <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                                        <option value="USER">User</option>
                                        <option value="GROUP">Group</option>
                                        <option value="CHANNEL">Channel</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Access</label>
                                    <select className="input" value={form.access} onChange={e => setForm({ ...form, access: e.target.value })}>
                                        <option value="BOT">Bot</option>
                                        <option value="MTPROTO">MTProto</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Role</label>
                                <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                                    <option value="DESTINATION">Destination</option>
                                    <option value="SOURCE">Source</option>
                                    <option value="BOTH">Both</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsCreateOpen(false)} className="btn-ghost">Cancel</button>
                            <button onClick={handleCreate} disabled={creating} className="btn-primary">
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
