import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../../services/apiClient';
import { MTProtoConnector } from '../../../types/mtproto.types';
import { useToast } from '../../../contexts/ToastContext';
import { Wifi, Plus, Trash2, RefreshCw, AlertTriangle, FileCode } from 'lucide-react';
import { ParsingRuleEditor } from './ParsingRuleEditor';

export const MTProtoSources = ({ botId }: { botId: string }) => {
    const { showToast } = useToast();
    const [connectors, setConnectors] = useState<MTProtoConnector[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newConnector, setNewConnector] = useState({ name: '', phone: '' });
    const [creating, setCreating] = useState(false);
    const [editingRulesFor, setEditingRulesFor] = useState<any>(null); // { id, rules, title }

    useEffect(() => {
        loadConnectors();
    }, []);

    const loadConnectors = async () => {
        setLoading(true);
        try {
            const res = await ApiClient.get<MTProtoConnector[]>('integrations/mtproto/connectors');
            if (res.ok) {
                setConnectors(res.data || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const deleteConnector = async (id: string) => {
        if (!confirm('Delete connector?')) return;
        try {
            await ApiClient.delete(`integrations/mtproto/connectors/${id}`);
            showToast('Connector deleted');
            loadConnectors();
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const handleCreateConnector = async () => {
        if (!newConnector.name.trim() || !newConnector.phone.trim()) {
            showToast('Name and phone are required', 'error');
            return;
        }
        setCreating(true);
        try {
            const res = await ApiClient.post('integrations/mtproto/connectors', {
                name: newConnector.name,
                phone: newConnector.phone,
                botId
            });
            if (!res.ok) throw new Error(res.message);
            showToast('Connector created. Complete auth flow.', 'success');
            setIsAddModalOpen(false);
            setNewConnector({ name: '', phone: '' });
            loadConnectors();
        } catch (e: any) {
            showToast(e.message || 'Failed to create connector', 'error');
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-[var(--text-secondary)]">Loading...</div>;
    }

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-2xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                        <Wifi className="text-gold-500" size={24} />
                        MTProto Sources
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Connect Telegram accounts to import channels
                    </p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="btn-primary px-4 py-2 flex items-center gap-2"
                >
                    <Plus size={16} /> Add Connector
                </button>
            </div>

            {connectors.length === 0 ? (
                <div className="panel p-12 text-center">
                    <Wifi size={48} className="mx-auto mb-4 text-[var(--text-secondary)] opacity-50" />
                    <p className="text-[var(--text-secondary)]">No MTProto connections configured</p>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                        Add a connector to import channels from your Telegram account
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    <div className="grid gap-4">
                        {connectors.map(conn => (
                            <ConnectorItem
                                key={conn.id}
                                connector={conn}
                                onDelete={() => deleteConnector(conn.id)}
                                onEditRules={(source) => setEditingRulesFor(source)}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-8 panel p-4 bg-yellow-500/10 border border-yellow-500/30">
                <div className="flex gap-3">
                    <AlertTriangle size={20} className="text-yellow-500 shrink-0" />
                    <div>
                        <h5 className="font-bold text-sm text-[var(--text-primary)] mb-1">MTProto Integration</h5>
                        <p className="text-xs text-[var(--text-secondary)]">
                            Connect your Telegram account to automatically import car listings from channels. Requires API credentials
                            and phone verification.
                        </p>
                    </div>
                </div>
            </div>

            {/* Add Connector Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-md p-6 animate-slide-up">
                        <h4 className="font-bold text-[var(--text-primary)] text-lg mb-4">Add MTProto Connector</h4>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Name</label>
                                <input
                                    className="input"
                                    placeholder="e.g. My Telegram Account"
                                    value={newConnector.name}
                                    onChange={e => setNewConnector({ ...newConnector, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Phone Number</label>
                                <input
                                    className="input"
                                    placeholder="+380991234567"
                                    value={newConnector.phone}
                                    onChange={e => setNewConnector({ ...newConnector, phone: e.target.value })}
                                />
                                <p className="text-xs text-[var(--text-secondary)] mt-1">Include country code (e.g. +380)</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => { setIsAddModalOpen(false); setNewConnector({ name: '', phone: '' }); }}
                                className="btn-ghost"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateConnector}
                                disabled={creating}
                                className="btn-primary"
                            >
                                {creating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Parsing Rule Editor Modal */}
            {editingRulesFor && (
                <ParsingRuleEditor
                    initialRules={editingRulesFor.importRules}
                    sampleText={`Sample message from ${editingRulesFor.title}...\nLine 2\nPrice: $25000\nYear: 2020`}
                    onClose={() => setEditingRulesFor(null)}
                    onSave={async (rules) => {
                        try {
                            // PUT request to update stats
                            await ApiClient.put(`integrations/mtproto/${editingRulesFor.connectorId}/channels/${editingRulesFor.id}`, { importRules: rules });
                            showToast('Rules saved successfully', 'success');
                            setEditingRulesFor(null);
                            loadConnectors(); // Refresh to update rules in state if needed
                        } catch (e) {
                            showToast('Failed to save rules', 'error');
                        }
                    }}
                />
            )}
        </div>
    );
};

const ConnectorItem = ({ connector, onDelete, onEditRules }: { connector: MTProtoConnector, onDelete: () => void, onEditRules: (s: any) => void }) => {
    const { showToast } = useToast();
    const [channels, setChannels] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [channelQuery, setChannelQuery] = useState('');
    const [syncing, setSyncing] = useState<string | null>(null);

    useEffect(() => {
        loadChannels();
    }, [connector.id]);

    const loadChannels = async () => {
        try {
            const res = await ApiClient.get(`integrations/mtproto/${connector.id}/channels`);
            if (res.ok) setChannels(res.data);
        } catch (e) {
            console.error("Failed to load channels", e);
        }
    };

    const handleSync = async (sourceId: string) => {
        setSyncing(sourceId);
        try {
            await ApiClient.post(`integrations/mtproto/${connector.id}/channels/${sourceId}/sync`, {});
            showToast('Sync started in background', 'success');
        } catch (e) {
            showToast('Sync failed', 'error');
        } finally {
            setSyncing(null);
        }
    };

    const handleAddChannel = async () => {
        if (!channelQuery) return;
        setAdding(true);
        try {
            // 1. Resolve
            const resolveRes = await ApiClient.get(`integrations/mtproto/${connector.id}/resolve?query=${channelQuery}`);
            if (!resolveRes.ok) throw new Error(resolveRes.message);

            const channel = resolveRes.data;
            if (confirm(`Add channel "${channel.title}"?`)) {
                await ApiClient.post(`integrations/mtproto/${connector.id}/channels`, {
                    channel,
                    importRules: { autoPublish: false }
                });
                showToast('Channel added', 'success');
                setChannelQuery('');
                loadChannels();
            }
        } catch (e: any) {
            showToast(e.message || 'Failed to add channel', 'error');
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="panel p-0 overflow-hidden border-l-4 border-l-gold-500">
            {/* Header */}
            <div className="p-4 bg-[var(--bg-input)] flex justify-between items-center">
                <div>
                    <h4 className="font-bold text-[var(--text-primary)]">{connector.name}</h4>
                    <div className="flex gap-2 text-xs mt-1">
                        <span className={`font-bold ${connector.status === 'READY' ? 'text-green-500' : 'text-yellow-500'}`}>{connector.status}</span>
                        <span className="text-[var(--text-muted)]">{connector.phone}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onDelete}
                        className="text-red-500 hover:bg-red-500/10 p-2 rounded"
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            </div>

            {/* Channels List */}
            <div className="p-4 border-t border-[var(--border-color)]">
                <h5 className="font-bold text-xs uppercase text-[var(--text-secondary)] mb-3 flex justify-between">
                    Import Sources
                </h5>
                <div className="space-y-2 mb-4">
                    {channels.map((ch: any) => (
                        <div key={ch.id} className="flex justify-between items-center p-2 rounded bg-[var(--bg-app)] border border-[var(--border-color)]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-xs">TG</div>
                                <div>
                                    <div className="font-bold text-sm text-[var(--text-primary)]">{ch.title}</div>
                                    <div className="text-[10px] text-[var(--text-secondary)]">{ch.username ? '@' + ch.username : 'Private'}</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleSync(ch.id)}
                                    disabled={!!syncing}
                                    className="btn-secondary px-2 py-1 text-xs flex items-center gap-1"
                                >
                                    <RefreshCw size={12} className={syncing === ch.id ? 'animate-spin' : ''} />
                                    {syncing === ch.id ? 'Syncing...' : 'Sync'}
                                </button>
                                <button
                                    onClick={() => onEditRules(ch)}
                                    className="btn-ghost px-2 py-1 text-xs flex items-center gap-1 text-[var(--text-secondary)]"
                                >
                                    <FileCode size={12} /> Rules
                                </button>
                            </div>
                        </div>
                    ))}
                    {channels.length === 0 && <div className="text-xs text-[var(--text-muted)] italic">No channels added.</div>}
                </div>

                {/* Add Channel */}
                <div className="flex gap-2">
                    <input
                        className="input text-sm py-1"
                        placeholder="@channel or t.me/link"
                        value={channelQuery}
                        onChange={e => setChannelQuery(e.target.value)}
                    />
                    <button
                        onClick={handleAddChannel}
                        disabled={adding || !channelQuery}
                        className="btn-primary px-3 py-1 text-xs whitespace-nowrap"
                    >
                        {adding ? 'Checking...' : '+ Add'}
                    </button>
                </div>
            </div>
        </div>
    );
};
