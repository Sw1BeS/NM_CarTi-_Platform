import React, { useState, useEffect } from 'react';
import { ApiClient } from '../../../services/apiClient';
import { MTProtoConnector } from '../../../types/mtproto.types';
import { useToast } from '../../../contexts/ToastContext';
import { Wifi, Plus, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';

export const MTProtoSources = ({ botId }: { botId: string }) => {
    const { showToast } = useToast();
    const [connectors, setConnectors] = useState<MTProtoConnector[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newConnector, setNewConnector] = useState({ name: '', phone: '' });
    const [creating, setCreating] = useState(false);

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
                    {connectors.map(conn => (
                        <div
                            key={conn.id}
                            className="panel p-4 flex justify-between items-center border-l-4 border-l-gold-500"
                        >
                            <div>
                                <h4 className="font-bold text-[var(--text-primary)]">{conn.name}</h4>
                                <p className="text-xs text-[var(--text-secondary)] mt-1">
                                    Status:{' '}
                                    <span
                                        className={`font-bold ${conn.status === 'READY'
                                            ? 'text-green-500'
                                            : conn.status === 'ERROR'
                                                ? 'text-red-500'
                                                : 'text-yellow-500'
                                            }`}
                                    >
                                        {conn.status}
                                    </span>
                                </p>
                                {conn.phone && <p className="text-xs text-[var(--text-muted)] mt-1">Phone: {conn.phone}</p>}
                            </div>
                            <div className="flex gap-2">
                                <button className="btn-secondary px-3 py-1 text-xs">
                                    <RefreshCw size={14} /> Sync
                                </button>
                                <button
                                    onClick={() => deleteConnector(conn.id)}
                                    className="text-red-500 hover:bg-red-500/10 p-2 rounded"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
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
        </div>
    );
};
