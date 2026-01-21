
import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { MTProtoConnector, Bot } from '../../../types';
import { Plus, Send, Activity, Wifi, RefreshCw, List as ListIcon, Trash2, X, AlertTriangle, Check, Search } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';

export const MTProtoManager = ({ bot }: { bot: Bot }) => {
    const [connectors, setConnectors] = useState<MTProtoConnector[]>([]);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [managingConnector, setManagingConnector] = useState<MTProtoConnector | null>(null);
    const { showToast } = useToast();

    const load = async () => setConnectors(await Data.getMTProtoConnectors());

    useEffect(() => {
        load();
        const sub = Data.subscribe('UPDATE_MTPROTO', load);
        return sub;
    }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to disconnect? Session will be terminated.')) return;
        try {
            await Data.deleteMTProtoConnector(id);
            showToast('Disconnected successfully');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="p-6 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-panel)]">
                <div>
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">Channel Sources</h3>
                    <p className="text-xs text-[var(--text-secondary)]">Connect Telegram accounts to import content</p>
                </div>
                <button onClick={() => setIsWizardOpen(true)} className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
                    <Plus size={16} /> Connect Account
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {connectors.map(conn => (
                    <div key={conn.id} className="panel p-5 flex flex-col gap-4 border-l-4 border-l-blue-500 relative overflow-hidden">
                        <div className="flex justify-between items-start z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                    <Send size={20} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-[var(--text-primary)]">{conn.name}</h4>
                                    <div className="text-xs text-[var(--text-secondary)] font-mono">{conn.phone}</div>
                                </div>
                            </div>
                            <div className={`px-2 py-1 rounded text-[10px] font-bold ${conn.status === 'READY' ? 'bg-green-500/10 text-green-500' :
                                conn.status === 'ERROR' ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-500'
                                }`}>
                                {conn.status}
                            </div>
                        </div>

                        <div className="flex gap-4 text-xs text-[var(--text-secondary)] z-10">
                            <div className="flex items-center gap-1"><Activity size={12} /> {conn.workspaceApiId || 'Default API'}</div>
                            <div className="flex items-center gap-1"><Wifi size={12} /> {conn.sessionString ? 'Active Session' : 'No Session'}</div>
                        </div>

                        {conn.lastError && (
                            <div className="bg-red-500/10 p-2 rounded text-xs text-red-500 z-10 break-all">
                                Error: {conn.lastError}
                            </div>
                        )}

                        <div className="pt-2 border-t border-[var(--border-color)] flex justify-end gap-2 z-10">
                            <button onClick={() => Data.syncMTProto(conn.id)} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1">
                                <RefreshCw size={12} /> Sync
                            </button>
                            <button onClick={() => setManagingConnector(conn)} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1">
                                <ListIcon size={12} /> Manage Channels
                            </button>
                            <button onClick={() => handleDelete(conn.id)} className="text-red-500 hover:bg-red-500/10 p-1.5 rounded text-xs flex items-center gap-1 transition-colors">
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                ))}

                {connectors.length === 0 && (
                    <div className="col-span-full py-12 flex flex-col items-center justify-center text-[var(--text-secondary)] opacity-50 border-2 border-dashed border-[var(--border-color)] rounded-xl">
                        <Wifi size={48} className="mb-4" />
                        <p>No accounts connected yet.</p>
                        <button onClick={() => setIsWizardOpen(true)} className="mt-4 text-gold-500 hover:underline">Connect one now</button>
                    </div>
                )}
            </div>

            {isWizardOpen && <MTProtoWizard onResult={load} onClose={() => setIsWizardOpen(false)} />}
            {managingConnector && <ChannelManagerModal connector={managingConnector} onClose={() => setManagingConnector(null)} />}
        </div>
    );
};

const MTProtoWizard = ({ onResult, onClose }: any) => {
    const [step, setStep] = useState<'PHONE' | 'CODE' | 'PASSWORD' | 'SUCCESS'>('PHONE');
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    // Form Data
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [apiId, setApiId] = useState('');
    const [apiHash, setApiHash] = useState('');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');

    // State from backend
    const [connectorId, setConnectorId] = useState<string | null>(null);
    const [phoneCodeHash, setPhoneCodeHash] = useState<string | null>(null);

    const handleSendCode = async () => {
        if (!phone) return showToast('Phone required', 'error');
        setLoading(true);
        try {
            // 1. Create Connector
            const conn = await Data.createMTProtoConnector({ name: name || phone, apiId, apiHash });
            setConnectorId(conn.id);

            // 2. Send Code
            const res = await Data.sendMTProtoCode(conn.id, phone);
            setPhoneCodeHash(res.phoneCodeHash);

            setStep('CODE');
            showToast('Code sent to Telegram app!');
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSignIn = async () => {
        if (!code) return showToast('Code required', 'error');
        setLoading(true);
        try {
            await Data.signInMTProto({
                connectorId,
                phone,
                code,
                phoneCodeHash,
                password: password || undefined
            });
            setStep('SUCCESS');
            onResult();
        } catch (e: any) {
            if (e.message.includes('PASSWORD_NEEDED') || e.message.includes('SESSION_PASSWORD_NEEDED')) {
                setStep('PASSWORD');
                showToast('2FA Password required');
            } else {
                showToast(e.message, 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSignIn = async () => {
        setLoading(true);
        try {
            await Data.signInMTProto({
                connectorId,
                phone,
                code,
                phoneCodeHash,
                password
            });
            setStep('SUCCESS');
            onResult();
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-md p-8 animate-slide-up shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6 z-10 relative">
                    <h3 className="font-bold text-xl text-[var(--text-primary)]">Connect Telegram</h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)]" /></button>
                </div>

                {step === 'PHONE' && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="bg-blue-500/10 p-3 rounded text-xs text-blue-400 mb-4">
                            We recommend using a dedicated Telegram account for automations.
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Account Name</label>
                            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Content Bot" autoFocus />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Phone Number</label>
                            <input className="input font-mono" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1234567890" />
                        </div>
                        <div className="pt-2">
                            <details className="text-xs text-[var(--text-secondary)] cursor-pointer">
                                <summary>Advanced: Custom API ID/Hash</summary>
                                <div className="mt-2 space-y-2 p-2 bg-[var(--bg-input)] rounded">
                                    <input className="input text-xs" value={apiId} onChange={e => setApiId(e.target.value)} placeholder="API ID" />
                                    <input className="input text-xs" value={apiHash} onChange={e => setApiHash(e.target.value)} placeholder="API Hash" />
                                </div>
                            </details>
                        </div>
                        <button onClick={handleSendCode} disabled={loading || !phone} className="btn-primary w-full mt-4 flex justify-center items-center gap-2">
                            {loading ? <RefreshCw className="animate-spin" size={16} /> : <Send size={16} />} Send Code
                        </button>
                    </div>
                )}

                {step === 'CODE' && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="text-center mb-4">
                            <div className="text-sm text-[var(--text-secondary)]">Enter code sent to</div>
                            <div className="font-bold text-lg font-mono">{phone}</div>
                        </div>
                        <input
                            className="input text-center text-2xl tracking-widest font-mono py-3"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            placeholder="12345"
                            maxLength={5}
                            autoFocus
                        />
                        <button onClick={handleSignIn} disabled={loading || !code} className="btn-primary w-full mt-4 flex justify-center items-center gap-2">
                            {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />} Sign In
                        </button>
                    </div>
                )}

                {step === 'PASSWORD' && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="text-center mb-4 text-sm text-[var(--text-secondary)]">
                            Two-Step Verification is enabled.<br />Please enter your cloud password.
                        </div>
                        <input
                            type="password"
                            className="input"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Password"
                            autoFocus
                        />
                        <button onClick={handlePasswordSignIn} disabled={loading || !password} className="btn-primary w-full mt-4 flex justify-center items-center gap-2">
                            {loading ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />} Confirm Password
                        </button>
                    </div>
                )}

                {step === 'SUCCESS' && (
                    <div className="text-center py-8 animate-fade-in">
                        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-black shadow-lg shadow-green-500/50">
                            <Check size={32} strokeWidth={3} />
                        </div>
                        <h3 className="text-xl font-bold text-green-500 mb-2">Connected!</h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-6">Your Telegram account is now ready to use.</p>
                        <button onClick={onClose} className="btn-primary w-full">Done</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const ChannelManagerModal = ({ connector, onClose }: { connector: MTProtoConnector, onClose: () => void }) => {
    const [channels, setChannels] = useState<any[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const { showToast } = useToast();

    const load = async () => setChannels(await Data.getMTProtoChannels(connector.id));

    useEffect(() => {
        load();
        return Data.subscribe('UPDATE_CHANNELS', load);
    }, [connector.id]);

    const handleDelete = async (id: string) => {
        if (!confirm('Stop syncing this channel?')) return;
        try {
            await Data.deleteMTProtoChannel(id);
            showToast('Channel removed');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-2xl p-6 h-[80vh] flex flex-col shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-6 border-b border-[var(--border-color)] pb-4">
                    <div>
                        <h3 className="font-bold text-xl text-[var(--text-primary)]">Manage Channels</h3>
                        <p className="text-xs text-[var(--text-secondary)]">Source channels for {connector.name}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setIsAddOpen(true)} className="btn-primary text-sm px-3 flex items-center gap-2">
                            <Plus size={16} /> Add Channel
                        </button>
                        <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)]" /></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                    {channels.length === 0 && (
                        <div className="text-center py-12 text-[var(--text-secondary)] opacity-50">
                            No channels added yet.
                        </div>
                    )}
                    {channels.map(ch => (
                        <div key={ch.id} className="p-4 bg-[var(--bg-input)] rounded flex justify-between items-center group hover:bg-[var(--bg-hover)] transition-colors">
                            <div>
                                <div className="font-bold text-[var(--text-primary)]">{ch.title}</div>
                                <div className="text-xs text-[var(--text-secondary)]">@{ch.username || 'private'} • {ch.status}</div>
                                {ch.lastSyncedAt && <div className="text-[10px] text-[var(--text-modifier)] mt-1">Last synced: {new Date(ch.lastSyncedAt).toLocaleString()}</div>}
                            </div>
                            <button onClick={() => handleDelete(ch.id)} className="text-red-500 opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 rounded">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>

                {isAddOpen && <AddChannelSourceModal connectorId={connector.id} onClose={() => setIsAddOpen(false)} />}
            </div>
        </div>
    );
};

const AddChannelSourceModal = ({ connectorId, onClose }: { connectorId: string, onClose: () => void }) => {
    const [query, setQuery] = useState('');
    const [preview, setPreview] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { showToast } = useToast();

    const handleSearch = async () => {
        if (!query) return;
        setLoading(true);
        setError(null);
        try {
            const res = await Data.resolveMTProtoChannel(connectorId, query);
            setPreview(res);
        } catch (e: any) {
            setError(e.message || 'Channel not found');
            setPreview(null);
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!preview) return;
        setLoading(true);
        try {
            await Data.addMTProtoChannel(connectorId, preview, { autoPublish: false });
            showToast('Channel added successfully');
            onClose();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4">
            <div className="panel w-full max-w-md p-6 animate-slide-up shadow-2xl relative">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">Add Channel Source</h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)]" /></button>
                </div>

                <div className="flex gap-2 mb-4">
                    <input
                        className="input flex-1"
                        placeholder="@username or t.me/link"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        autoFocus
                    />
                    <button onClick={handleSearch} disabled={loading} className="btn-secondary px-3">
                        {loading ? <RefreshCw className="animate-spin" size={16} /> : <Search size={16} />}
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/10 text-red-500 p-3 rounded text-sm mb-4 flex items-center gap-2">
                        <AlertTriangle size={16} /> {error}
                    </div>
                )}

                {preview && (
                    <div className="bg-[var(--bg-input)] p-4 rounded mb-4 animate-fade-in">
                        <div className="font-bold text-[var(--text-primary)] text-lg">{preview.title}</div>
                        <div className="text-sm text-[var(--text-secondary)]">@{preview.username}</div>
                        <div className="text-xs text-[var(--text-modifier)] mt-1">{preview.participantsCount?.toLocaleString()} subscribers</div>

                        <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                            <button onClick={handleAdd} disabled={loading} className="btn-primary w-full flex justify-center items-center gap-2">
                                <Plus size={16} /> Add Source
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
