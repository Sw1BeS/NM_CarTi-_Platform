
import React, { useState, useEffect } from 'react';
import { RequestsService } from '../services/requestsService';
import { B2BRequest, RequestStatus } from '../types';
import { Plus, List as ListIcon, LayoutGrid, Search as SearchIcon, Filter, DollarSign, Calendar, ChevronRight, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
    const navigate = useNavigate();

    useEffect(() => { loadRequests(); }, [page, search, statusFilter]);

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
                    <button className="btn-primary">
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
                                                <span className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${r.status === 'NEW' ? 'bg-blue-500/10 text-blue-500' :
                                                        r.status === 'IN_PROGRESS' ? 'bg-gold-500/10 text-gold-500' : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                    }`}>
                                                    {r.status.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="tabular-nums text-[var(--text-primary)] font-medium text-base">
                                                ${r.budgetMax.toLocaleString()}
                                            </td>
                                            <td className="text-[var(--text-secondary)] text-sm">{r.city}</td>
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
                        {[RequestStatus.NEW, RequestStatus.IN_PROGRESS, RequestStatus.READY_FOR_REVIEW, RequestStatus.PUBLISHED].map(colStatus => (
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
        </div>
    );
};
