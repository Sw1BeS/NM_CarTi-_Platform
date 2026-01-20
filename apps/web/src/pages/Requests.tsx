
import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { RequestsService } from '../services/requestsService';
import { Data } from '../services/data';
import { ApiClient } from '../services/apiClient';
import { ContentGenerator } from '../services/contentGenerator';
import { createDeepLinkKeyboard, buildDeepLink } from '../services/deeplink';
import { B2BRequest, RequestStatus, TelegramDestination, Bot } from '../types';
import { Plus, List as ListIcon, LayoutGrid, Search as SearchIcon, Filter, DollarSign, Calendar, ChevronRight, ChevronLeft, Send } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

export const RequestList: React.FC = () => {
    const [requests, setRequests] = useState<B2BRequest[]>([]);
    const [viewMode, setViewMode] = useState<'LIST' | 'BOARD'>('LIST');

    // Filter/Pagination State
    const [page, setPage] = useState(1);
    const [limit] = useState(24);
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | string>('ALL');

    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();
    const [destinations, setDestinations] = useState<TelegramDestination[]>([]);
    const [bots, setBots] = useState<Bot[]>([]);
    const [broadcastReq, setBroadcastReq] = useState<B2BRequest | null>(null);
    const [broadcastDest, setBroadcastDest] = useState('');
    const [broadcastBotId, setBroadcastBotId] = useState('');
    const [broadcastTemplate, setBroadcastTemplate] = useState<'RAW' | 'IN_STOCK' | 'IN_TRANSIT'>('RAW');
    const [broadcasting, setBroadcasting] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState({
        title: '',
        budgetMin: 0,
        budgetMax: 0,
        yearMin: new Date().getFullYear() - 3,
        yearMax: new Date().getFullYear(),
        city: 'Kyiv',
        description: '',
        priority: 'MEDIUM' as B2BRequest['priority']
    });
    const [creating, setCreating] = useState(false);

    useEffect(() => { loadRequests(); }, [page, search, statusFilter]);
    useEffect(() => {
        const load = async () => {
            const [dests, botList] = await Promise.all([Data.getDestinations(), Data.getBots()]);
            setDestinations(dests.filter(d => d.type === 'CHANNEL'));
            const activeBots = botList.filter(b => b.active);
            setBots(activeBots);
            if (!broadcastBotId && activeBots.length > 0) setBroadcastBotId(activeBots[0].id);
        };
        load();
    }, []);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const data = await RequestsService.getRequests({
                page,
                limit,
                search: search || undefined,
                status: statusFilter
            });
            setRequests(data.items);
            setTotalItems(data.total);
            setTotalPages(data.totalPages);
        } catch (e) {
            console.error(e);
            showToast('Failed to load requests', 'error');
        } finally {
            setLoading(false);
        }
    };

    const openBroadcast = (req: B2BRequest) => {
        setBroadcastReq(req);
        if (destinations.length === 1) {
            setBroadcastDest(destinations[0].identifier);
        }
    };

    const handleBroadcast = async () => {
        if (!broadcastReq) return;
        const bot = bots.find(b => b.id === broadcastBotId);
        if (!bot) {
            showToast('Select an active bot', 'error');
            return;
        }
        if (!broadcastDest) {
            showToast('Select a channel', 'error');
            return;
        }
        setBroadcasting(true);
        try {
            await RequestsService.publishToChannel(broadcastReq.id, {
                botId: bot.id,
                channelId: broadcastDest,
                template: broadcastTemplate
            });
            showToast('Request sent to channel', 'success');
            setBroadcastReq(null);
            setBroadcastDest('');
            setBroadcastTemplate('RAW');
        } catch (e: any) {
            showToast(e.message || 'Failed to send', 'error');
        } finally {
            setBroadcasting(false);
        }
    };

    const handleCreateRequest = async () => {
        if (!createForm.title.trim()) {
            showToast('Title is required', 'error');
            return;
        }
        if (!createForm.budgetMax || createForm.budgetMax <= 0) {
            showToast('Budget must be greater than 0', 'error');
            return;
        }
        setCreating(true);
        try {
            await RequestsService.createRequest({
                ...createForm,
                status: RequestStatus.DRAFT
            } as any);
            setIsCreateOpen(false);
            setCreateForm({
                title: '',
                budgetMin: 0,
                budgetMax: 0,
                yearMin: new Date().getFullYear() - 3,
                yearMax: new Date().getFullYear(),
                city: 'Kyiv',
                description: '',
                priority: 'MEDIUM'
            });
            loadRequests();
            showToast('Request created', 'success');
        } catch (e: any) {
            showToast(e.message || 'Failed to create request', 'error');
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="space-y-8 h-[calc(100vh-140px)] flex flex-col">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-2xl font-medium text-[var(--text-primary)] tracking-tight">Requests</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {totalItems} Requests • Sourcing pipeline
                    </p>
                </div>
                <div className="flex gap-3">
                    <div className="bg-[var(--bg-input)] p-1.5 rounded-xl flex border border-[var(--border-color)]">
                        <button onClick={() => setViewMode('LIST')} className={`p-2.5 rounded-lg transition-all ${viewMode === 'LIST' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}><ListIcon size={20} /></button>
                        <button onClick={() => setViewMode('BOARD')} className={`p-2.5 rounded-lg transition-all ${viewMode === 'BOARD' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}><LayoutGrid size={20} /></button>
                    </div>
                    <button className="btn-primary" onClick={() => setIsCreateOpen(true)}>
                        <Plus size={20} /> New Request
                    </button>
                </div>
            </div>

            <div className="flex gap-4 shrink-0">
                <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={20} />
                    <input
                        className="input pl-10"
                        placeholder="Search requests..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <button className="btn-secondary px-4">
                    <Filter size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-hidden min-h-0 relative">
                {loading && <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-[1px] flex items-center justify-center text-[var(--text-secondary)]">Loading...</div>}

                {viewMode === 'LIST' ? (
                    <div className="panel overflow-hidden h-full p-0 flex flex-col">
                        <div className="table-container flex-1">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>ID</th>
                                        <th>Title</th>
                                        <th>Status</th>
                                        <th>Budget</th>
                                        <th>City</th>
                                        <th>Broadcast</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requests.map(r => (
                                        <tr key={r.id} className="group cursor-pointer">
                                            <td className="font-mono text-sm text-[var(--text-secondary)]">{r.publicId}</td>
                                            <td>
                                                <div className="font-bold text-base text-[var(--text-primary)]">{r.title}</div>
                                                <div className="text-sm text-[var(--text-secondary)] mt-0.5">{r.yearMin}+</div>
                                            </td>
                                            <td>
                                                <span className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${r.status === RequestStatus.DRAFT ? 'bg-blue-500/10 text-blue-500' :
                                                        r.status === RequestStatus.COLLECTING_VARIANTS ? 'bg-amber-500/10 text-amber-400' :
                                                            r.status === RequestStatus.SHORTLIST ? 'bg-purple-500/10 text-purple-400' :
                                                                r.status === RequestStatus.CONTACT_SHARED ? 'bg-teal-500/10 text-teal-400' :
                                                                    r.status === RequestStatus.WON ? 'bg-green-500/10 text-green-500' :
                                                                        r.status === RequestStatus.LOST ? 'bg-red-500/10 text-red-500' :
                                                                            'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                    }`}>
                                                    {r.status.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="tabular-nums text-[var(--text-primary)] font-medium text-base">
                                                ${r.budgetMax.toLocaleString()}
                                            </td>
                                            <td className="text-[var(--text-secondary)] text-sm">{r.city}</td>
                                            <td>
                                                <button
                                                    onClick={() => openBroadcast(r)}
                                                    className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                                                >
                                                    <Send size={14} /> To Channel
                                                </button>
                                            </td>
                                            <td className="text-right">
                                                <button className="text-[var(--text-secondary)] group-hover:text-gold-500 transition-colors">
                                                    <ChevronRight size={20} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination Control */}
                        <div className="p-3 border-t border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-input)]">
                            <div className="text-xs text-[var(--text-secondary)]">
                                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalItems)} of {totalItems}
                            </div>
                            <div className="flex gap-2">
                                <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="btn-secondary p-1 disabled:opacity-50"><ChevronLeft size={16} /></button>
                                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-secondary p-1 disabled:opacity-50"><ChevronRight size={16} /></button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex gap-6 h-full overflow-x-auto pb-4">
                        {[RequestStatus.DRAFT, RequestStatus.PUBLISHED, RequestStatus.COLLECTING_VARIANTS, RequestStatus.SHORTLIST, RequestStatus.CONTACT_SHARED].map(colStatus => (
                            <div key={colStatus} className="w-96 shrink-0 flex flex-col bg-[var(--bg-input)] rounded-2xl border border-[var(--border-color)] h-full backdrop-blur-sm">
                                <div className="p-5 flex justify-between items-center border-b border-[var(--border-color)]">
                                    <span className="font-bold text-xs uppercase tracking-widest text-[var(--text-secondary)]">{colStatus.replace(/_/g, ' ')}</span>
                                    <span className="bg-[var(--bg-panel)] px-3 py-1 rounded text-xs font-bold text-[var(--text-primary)] shadow-sm border border-[var(--border-color)]">
                                        {requests.filter(r => r.status === colStatus).length}
                                        {/* NOTE: In real prod, kanban cols should load individually or counts should be fetched separately. For now, we only show loaded items. */}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {requests.filter(r => r.status === colStatus).map(r => (
                                        <div key={r.id} className="panel p-5 cursor-pointer hover:border-gold-500/50 group relative hover:-translate-y-1 transition-transform">
                                            <div className="flex justify-between items-start mb-3">
                                                <span className="font-mono text-xs text-[var(--text-secondary)]">{r.publicId}</span>
                                                {r.priority === 'HIGH' && <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></span>}
                                            </div>
                                            <h4 className="font-bold text-base text-[var(--text-primary)] mb-4 line-clamp-1">{r.title}</h4>

                                            <div className="grid grid-cols-2 gap-3 text-sm text-[var(--text-secondary)] mb-4">
                                                <div className="flex items-center gap-1.5 bg-[var(--bg-input)] p-2 rounded"><DollarSign size={14} /> {r.budgetMax / 1000}k</div>
                                                <div className="flex items-center gap-1.5 bg-[var(--bg-input)] p-2 rounded"><Calendar size={14} /> {r.yearMin}+</div>
                                            </div>

                                            {r.variants?.length > 0 && (
                                                <div className="flex -space-x-2 pt-2 border-t border-[var(--border-color)]">
                                                    {r.variants.slice(0, 3).map((v, i) => (
                                                        <div key={i} className="w-8 h-8 rounded-full border-2 border-[var(--bg-panel)] overflow-hidden bg-[var(--bg-input)]">
                                                            <img src={v.thumbnail || 'https://via.placeholder.com/50'} className="w-full h-full object-cover" />
                                                        </div>
                                                    ))}
                                                    {r.variants.length > 3 && <div className="w-8 h-8 rounded-full bg-[var(--bg-input)] flex items-center justify-center text-xs font-bold text-[var(--text-secondary)] border border-[var(--border-color)]">+{r.variants.length - 3}</div>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isCreateOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-xl p-8 animate-slide-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-[var(--text-primary)] text-xl">New Request</h3>
                            <button onClick={() => setIsCreateOpen(false)} className="btn-ghost"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Title</label>
                                <input className="input" value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })} placeholder="e.g. BMW X5 2021+" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Budget Min</label>
                                    <input type="number" className="input" value={createForm.budgetMin} onChange={e => setCreateForm({ ...createForm, budgetMin: +e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Budget Max</label>
                                    <input type="number" className="input" value={createForm.budgetMax} onChange={e => setCreateForm({ ...createForm, budgetMax: +e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Year Min</label>
                                    <input type="number" className="input" value={createForm.yearMin} onChange={e => setCreateForm({ ...createForm, yearMin: +e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Year Max</label>
                                    <input type="number" className="input" value={createForm.yearMax} onChange={e => setCreateForm({ ...createForm, yearMax: +e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">City</label>
                                    <input className="input" value={createForm.city} onChange={e => setCreateForm({ ...createForm, city: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Priority</label>
                                    <select className="input" value={createForm.priority} onChange={e => setCreateForm({ ...createForm, priority: e.target.value as any })}>
                                        <option value="HIGH">High</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="LOW">Low</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Description</label>
                                <textarea className="textarea h-24" value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsCreateOpen(false)} className="btn-ghost">Cancel</button>
                            <button onClick={handleCreateRequest} disabled={creating} className="btn-primary">
                                {creating ? 'Saving...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {broadcastReq && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-lg p-6 animate-slide-up">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-[var(--text-primary)]">Broadcast Request</h3>
                            <button onClick={() => setBroadcastReq(null)} className="btn-ghost">Close</button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Bot</label>
                                <select
                                    className="input"
                                    value={broadcastBotId}
                                    onChange={e => setBroadcastBotId(e.target.value)}
                                >
                                    {bots.map(b => (
                                        <option key={b.id} value={b.id}>{b.name} (@{b.username})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Channel</label>
                                <select
                                    className="input"
                                    value={broadcastDest}
                                    onChange={e => setBroadcastDest(e.target.value)}
                                >
                                    <option value="">Select channel...</option>
                                    {destinations.map(d => (
                                        <option key={d.id} value={d.identifier}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg p-3 text-xs text-[var(--text-secondary)]">
                                <div className="font-bold text-[var(--text-primary)] mb-2">Preview</div>
                                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(ContentGenerator.fromRequest(broadcastReq).replace(/\n/g, '<br/>')) }} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Template</label>
                                    <select className="input" value={broadcastTemplate} onChange={e => setBroadcastTemplate(e.target.value as any)}>
                                        <option value="RAW">Raw Card</option>
                                        <option value="IN_STOCK">В наявності</option>
                                        <option value="IN_TRANSIT">В дорозі</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setBroadcastReq(null)} className="btn-ghost">Cancel</button>
                            <button onClick={handleBroadcast} disabled={broadcasting || !broadcastDest || !broadcastBotId} className="btn-primary">
                                {broadcasting ? 'Sending...' : 'Send to Channel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
