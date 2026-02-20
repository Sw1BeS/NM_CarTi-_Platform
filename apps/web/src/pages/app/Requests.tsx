
import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { RequestsService } from '../../services/requestsService';
import { Data } from '../../services/data';
import { ContentGenerator } from '../../services/contentGenerator';
import { createDeepLinkKeyboard, buildDeepLink } from '../../services/deeplink';
import { B2BRequest, RequestStatus, TelegramDestination, Bot } from '../../types';
import { Plus, List as ListIcon, LayoutGrid, Search as SearchIcon, DollarSign, Calendar, ChevronRight, ChevronLeft, Send, X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { CarPicker } from '../../components/CarPicker';

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return !!value && typeof value === 'object' && !Array.isArray(value);
};

const getSourceLabel = (payload?: Record<string, unknown>) => {
    if (!payload || !isRecord(payload)) return undefined;
    const source = payload.source;
    return typeof source === 'string' ? source : undefined;
};

const getTelegramLabel = (payload?: Record<string, unknown>, chatId?: string) => {
    if (!payload || !isRecord(payload)) return chatId ? `TG ${chatId}` : undefined;
    const telegram = isRecord(payload.telegram) ? payload.telegram : undefined;
    const username = telegram && typeof telegram.username === 'string' ? telegram.username : undefined;
    const name = telegram && typeof telegram.name === 'string' ? telegram.name : undefined;
    const userId = telegram && typeof telegram.userId === 'string' ? telegram.userId : undefined;
    if (username) return `@${username}`;
    if (name) return name;
    if (userId) return `TG ${userId}`;
    return chatId ? `TG ${chatId}` : undefined;
};

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
    const [botFilter, setBotFilter] = useState<string>('ALL');

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
    const [detailRequest, setDetailRequest] = useState<B2BRequest | null>(null);
    const [showCarPicker, setShowCarPicker] = useState(false);
    const [createForm, setCreateForm] = useState({
        title: '',
        type: 'BUY' as 'BUY' | 'SELL',
        budgetMin: 0,
        budgetMax: 0,
        yearMin: new Date().getFullYear() - 3,
        yearMax: new Date().getFullYear(),
        city: 'Kyiv',
        description: '',
        priority: 'NORMAL' as B2BRequest['priority']
    });
    const [creating, setCreating] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => { loadRequests(); }, [page, search, statusFilter, botFilter]);
    useEffect(() => {
        if (!detailRequest) return;
        const updated = requests.find(r => r.id === detailRequest.id);
        if (updated) setDetailRequest(updated);
    }, [requests]);
    useEffect(() => {
        if (searchParams.get('create') === '1') {
            setIsCreateOpen(true);
            const next = new URLSearchParams(searchParams);
            next.delete('create');
            setSearchParams(next, { replace: true });
        }
    }, [searchParams, setSearchParams]);
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
                status: statusFilter,
                botId: botFilter
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
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to send';
            showToast(message, 'error');
        } finally {
            setBroadcasting(false);
        }
    };

    const handleCreateRequest = async () => {
        if (!createForm.title.trim()) {
            showToast('Title is required', 'error');
            return;
        }
        if (createForm.type === 'BUY' && (!createForm.budgetMax || createForm.budgetMax <= 0)) {
            showToast('Budget must be greater than 0', 'error');
            return;
        }
        setCreating(true);
        try {
            const yearMinVal = Number(createForm.yearMin) || 0;
            const yearMaxVal = Number(createForm.yearMax) || 0;
            await RequestsService.createRequest({
                title: createForm.title,
                type: createForm.type,
                description: createForm.description || '',
                budgetMin: Number(createForm.budgetMin) || 0,
                budgetMax: Number(createForm.budgetMax),
                yearMin: yearMinVal > 0 ? yearMinVal : undefined,
                yearMax: yearMaxVal > 0 ? yearMaxVal : undefined,
                city: createForm.city,
                priority: createForm.priority,
                status: RequestStatus.DRAFT,
                clientChatId: undefined, // Explicit undefined to avoid null issues if backend is strict
                assigneeId: undefined
            });
            setIsCreateOpen(false);
            setCreateForm({
                title: '',
                type: 'BUY',
                budgetMin: 0,
                budgetMax: 0,
                yearMin: new Date().getFullYear() - 3,
                yearMax: new Date().getFullYear(),
                city: 'Kyiv',
                description: '',
                priority: 'NORMAL'
            });
            loadRequests();
            showToast('Request created', 'success');
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to create request';
            showToast(message, 'error');
        } finally {
            setCreating(false);
        }
    };

    const openDetails = (req: B2BRequest) => {
        setDetailRequest(req);
    };

    const handleAddFromInventory = async (car: any) => {
        if (!detailRequest) return;
        const carId = car.canonicalId || car.id;
        try {
            const added = await RequestsService.addVariantsFromInventory(detailRequest.id, [carId]);
            setRequests(prev => prev.map(r => r.id === detailRequest.id ? { ...r, variants: [...(r.variants || []), ...added] } : r));
            setDetailRequest(prev => prev ? { ...prev, variants: [...(prev.variants || []), ...added] } : prev);
            showToast('Car added to request', 'success');
        } catch (e: any) {
            showToast(e.message || 'Failed to add car', 'error');
        } finally {
            setShowCarPicker(false);
        }
    };

    const statusOptions = ['ALL', ...Object.values(RequestStatus)];
    const botOptions = [{ id: 'ALL', name: 'All Bots' }, ...bots];
    const b2bRuntimeRequests = requests.filter(r => getSourceLabel(r.payload) === 'telegram_b2b');
    const awaitingOffers = b2bRuntimeRequests.filter(r => r.status === RequestStatus.COLLECTING_VARIANTS).length;
    const readyForAdmin = b2bRuntimeRequests.filter(r => r.status === RequestStatus.CONTACT_SHARED || r.status === RequestStatus.SHORTLIST).length;

    return (
        <div className="space-y-8 h-[calc(100vh-140px)] flex flex-col">
            <PageHeader
                title="Requests"
                subtitle={`${totalItems} Requests • Sourcing pipeline`}
                actions={(
                    <>
                        <div className="bg-[var(--bg-input)] p-1.5 rounded-xl flex border border-[var(--border-color)]">
                            <button onClick={() => setViewMode('LIST')} className={`p-2.5 rounded-lg transition-all ${viewMode === 'LIST' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}><ListIcon size={20} /></button>
                            <button onClick={() => setViewMode('BOARD')} className={`p-2.5 rounded-lg transition-all ${viewMode === 'BOARD' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}><LayoutGrid size={20} /></button>
                        </div>
                        <button className="btn-primary" onClick={() => setIsCreateOpen(true)}>
                            <Plus size={20} /> New Request
                        </button>
                    </>
                )}
            />

            <div className="flex gap-4 shrink-0 flex-wrap">
                <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={20} />
                    <input
                        className="input pl-10"
                        placeholder="Search requests..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <select
                    className="input min-w-[160px]"
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                >
                    {statusOptions.map(status => (
                        <option key={status} value={status}>{status}</option>
                    ))}
                </select>
                <select
                    className="input min-w-[180px]"
                    value={botFilter}
                    onChange={e => { setBotFilter(e.target.value); setPage(1); }}
                >
                    {botOptions.map(bot => (
                        <option key={bot.id} value={bot.id}>{(bot as any).name || (bot as any).username || bot.id}</option>
                    ))}
                </select>
            </div>

            <div className="panel p-4 shrink-0 border border-gold-500/20 bg-gold-500/5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-xs uppercase tracking-wider font-bold text-gold-500">B2B Runtime</div>
                        <div className="text-sm text-[var(--text-secondary)]">
                            B2B bot uses flow-first runtime. Legacy hard-flow fallback is temporary and controlled by server flag.
                        </div>
                    </div>
                    <div className="flex gap-2 text-xs">
                        <span className="px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-secondary)]">
                            Requests: {b2bRuntimeRequests.length}
                        </span>
                        <span className="px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-secondary)]">
                            Awaiting offers: {awaitingOffers}
                        </span>
                        <span className="px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-secondary)]">
                            Routed to admin: {readyForAdmin}
                        </span>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-hidden min-h-0 relative">
                {loading && <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-[1px] flex items-center justify-center text-[var(--text-secondary)]">Loading...</div>}

                {viewMode === 'LIST' ? (
                    <div className="panel overflow-hidden h-full p-0 flex flex-col">
                        <div className="table-container flex-1 overflow-x-auto">
                            <table className="table min-w-[900px]">
                                <thead>
                                    <tr>
                                        <th className="hidden md:table-cell">ID</th>
                                        <th>Title</th>
                                        <th>Status</th>
                                        <th>Offers</th>
                                        <th className="hidden md:table-cell">Budget</th>
                                        <th className="hidden lg:table-cell">City</th>
                                        <th className="hidden lg:table-cell">Broadcast</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requests.map(r => {
                                        const updatedAt = new Date(r.updatedAt || r.createdAt);
                                        const isFresh = Date.now() - updatedAt.getTime() < 1000 * 60 * 60 * 24;
                                        const offersCount = Array.isArray(r.variants) ? r.variants.length : 0;
                                        const sourceLabel = getSourceLabel(r.payload);
                                        const telegramLabel = getTelegramLabel(r.payload, r.clientChatId);
                                        return (
                                        <tr key={r.id} onClick={() => openDetails(r)} className={`group cursor-pointer ${isFresh ? 'bg-amber-500/5' : ''}`}>
                                            <td className="font-mono text-sm text-[var(--text-secondary)] hidden md:table-cell">{r.publicId}</td>
                                            <td>
                                                <div className="font-bold text-base text-[var(--text-primary)]">{r.title}</div>
                                                <div className="text-sm text-[var(--text-secondary)] mt-0.5">{r.yearMin ? `${r.yearMin}+` : ''}</div>
                                                {(sourceLabel || telegramLabel) && (
                                                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                                                        {sourceLabel && <span className="mr-2">Source: {sourceLabel}</span>}
                                                        {telegramLabel && <span>Telegram: {telegramLabel}</span>}
                                                    </div>
                                                )}
                                                <div className="text-xs text-[var(--text-secondary)] mt-1 md:hidden">
                                                    {r.city || '—'} • ${r.budgetMax ? r.budgetMax.toLocaleString() : '—'}
                                                </div>
                                            </td>
                                            <td>
                                                <StatusBadge status={r.status} />
                                            </td>
                                            <td className="text-sm font-semibold text-[var(--text-primary)]">
                                                <span className={`px-2 py-1 rounded-lg border ${offersCount ? 'border-gold-500/30 bg-gold-500/10 text-gold-400' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}>
                                                    {offersCount} {offersCount === 1 ? 'offer' : 'offers'}
                                                </span>
                                            </td>
                                            <td className="tabular-nums text-[var(--text-primary)] font-medium text-base hidden md:table-cell">
                                                ${r.budgetMax ? r.budgetMax.toLocaleString() : '—'}
                                            </td>
                                            <td className="text-[var(--text-secondary)] text-sm hidden lg:table-cell">{r.city || '—'}</td>
                                            <td className="hidden lg:table-cell">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); openBroadcast(r); }}
                                                    className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                                                >
                                                    <Send size={14} /> To Channel
                                                </button>
                                            </td>
                                            <td className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openBroadcast(r); }}
                                                        className="btn-secondary text-[10px] px-2 py-1 lg:hidden"
                                                    >
                                                        <Send size={12} />
                                                    </button>
                                                    <button className="text-[var(--text-secondary)] group-hover:text-gold-500 transition-colors">
                                                        <ChevronRight size={20} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        );
                                    })}
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
                                        <div key={r.id} onClick={() => openDetails(r)} className="panel p-5 cursor-pointer hover:border-gold-500/50 group relative hover:-translate-y-1 transition-transform">
                                            {(() => {
                                                const sourceLabel = getSourceLabel(r.payload);
                                                const telegramLabel = getTelegramLabel(r.payload, r.clientChatId);
                                                return (sourceLabel || telegramLabel) ? (
                                                    <div className="text-[10px] text-[var(--text-secondary)] mb-2">
                                                        {sourceLabel && <span className="mr-2">Source: {sourceLabel}</span>}
                                                        {telegramLabel && <span>Telegram: {telegramLabel}</span>}
                                                    </div>
                                                ) : null;
                                            })()}
                                            <div className="flex justify-between items-start mb-3">
                                                <span className="font-mono text-xs text-[var(--text-secondary)]">{r.publicId}</span>
                                                {r.priority === 'HIGH' && <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></span>}
                                            </div>
                                            <h4 className="font-bold text-base text-[var(--text-primary)] mb-4 line-clamp-1">{r.title}</h4>

                                            <div className="grid grid-cols-2 gap-3 text-sm text-[var(--text-secondary)] mb-4">
                                                <div className="flex items-center gap-1.5 bg-[var(--bg-input)] p-2 rounded"><DollarSign size={14} /> {r.budgetMax ? `${r.budgetMax / 1000}k` : '—'}</div>
                                                <div className="flex items-center gap-1.5 bg-[var(--bg-input)] p-2 rounded"><Calendar size={14} /> {r.yearMin ? `${r.yearMin}+` : '—'}</div>
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
                    <div className="panel w-full max-w-3xl p-10 animate-slide-up">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-[var(--text-primary)] text-xl">New Request</h3>
                            <button onClick={() => setIsCreateOpen(false)} className="btn-ghost"><X size={20} /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Title</label>
                                    <input className="input" value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })} placeholder="e.g. BMW X5 2021+" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Type</label>
                                    <select className="input" value={createForm.type} onChange={e => setCreateForm({ ...createForm, type: e.target.value as any })}>
                                        <option value="BUY">BUY</option>
                                        <option value="SELL">SELL</option>
                                    </select>
                                </div>
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
                                        <option value="NORMAL">Normal</option>
                                        <option value="LOW">Low</option>
                                        <option value="URGENT">Urgent</option>
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

            {detailRequest && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-4xl p-6 animate-slide-up">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-[var(--text-primary)] text-xl">{detailRequest.title}</h3>
                                <div className="text-xs text-[var(--text-secondary)]">{detailRequest.publicId} • {detailRequest.status}</div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowCarPicker(true)} className="btn-secondary text-xs">Add From Inventory</button>
                                <button onClick={() => { setDetailRequest(null); setShowCarPicker(false); }} className="btn-ghost text-xs">Close</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="panel p-4 bg-[var(--bg-input)]">
                                <div className="text-xs text-[var(--text-secondary)] uppercase font-bold mb-2">Request Details</div>
                                <div className="text-sm text-[var(--text-primary)]">Budget: {detailRequest.budgetMax ? `$${detailRequest.budgetMax.toLocaleString()}` : '—'}</div>
                                <div className="text-sm text-[var(--text-primary)]">Year: {detailRequest.yearMin ? `${detailRequest.yearMin}+` : '—'}</div>
                                <div className="text-sm text-[var(--text-primary)]">City: {detailRequest.city || '—'}</div>
                                <div className="text-xs text-[var(--text-secondary)] mt-3">{detailRequest.description || 'No description.'}</div>
                            </div>
                            <div className="panel p-4 bg-[var(--bg-input)]">
                                <div className="text-xs text-[var(--text-secondary)] uppercase font-bold mb-2">Variants</div>
                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {(detailRequest.variants || []).map(v => (
                                        <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)]">
                                            <div className="w-16 h-12 rounded overflow-hidden bg-[var(--bg-input)]">
                                                <img src={v.thumbnail || 'https://via.placeholder.com/80'} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-bold text-[var(--text-primary)] truncate">{v.title}</div>
                                                <div className="text-[10px] text-[var(--text-secondary)]">{v.year} • {v.price?.amount ? `$${v.price.amount}` : '—'}</div>
                                            </div>
                                            <span className="text-[10px] uppercase font-bold px-2 py-1 rounded bg-gold-500/10 text-gold-500 border border-gold-500/20">
                                                {v.status}
                                            </span>
                                        </div>
                                    ))}
                                    {(detailRequest.variants || []).length === 0 && (
                                        <div className="text-xs text-[var(--text-secondary)]">No variants yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showCarPicker && (
                <CarPicker
                    onSelect={handleAddFromInventory}
                    onClose={() => setShowCarPicker(false)}
                />
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
