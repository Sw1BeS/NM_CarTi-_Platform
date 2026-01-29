import React, { useState, useEffect } from 'react';
import { LeadsService } from '../../services/leadsService';
import { RequestsService } from '../../services/requestsService';
import { Lead, LeadStatus, RequestStatus } from '../../types';
import { Plus, X, ChevronRight, List as ListIcon, LayoutGrid, ChevronLeft, Search } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate, useSearchParams } from 'react-router-dom';

export const Leads: React.FC = () => {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [viewMode, setViewMode] = useState<'LIST' | 'BOARD' | 'DETAIL'>('LIST');
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Pagination & Filter State
    const [page, setPage] = useState(1);
    const [limit] = useState(50);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEW' | 'CONTACTED' | 'WON' | 'LOST'>('ALL');
    const [loading, setLoading] = useState(false);

    const { showToast } = useToast();
    const [formData, setFormData] = useState({ name: '', goal: '', source: 'MANUAL', notes: '', linkedRequestId: '' });
    const [searchParams, setSearchParams] = useSearchParams();

    useEffect(() => { loadLeads(); }, [page, search, statusFilter]);
    useEffect(() => {
        if (searchParams.get('create') === '1') {
            setIsModalOpen(true);
            const next = new URLSearchParams(searchParams);
            next.delete('create');
            setSearchParams(next, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    const loadLeads = async () => {
        setLoading(true);
        try {
            const data = await LeadsService.getLeads({
                page,
                limit,
                search: search || undefined,
                status: statusFilter
            });
            setLeads(data.items);
            setTotalPages(data.totalPages);
            setTotalItems(data.total);
        } catch (e) {
            console.error(e);
            showToast('Failed to load leads', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!formData.name) return showToast('Name is required', 'error');
        try {
            await LeadsService.createLead(formData as any);
            setIsModalOpen(false);
            setFormData({ name: '', goal: '', source: 'MANUAL', notes: '', linkedRequestId: '' });
            loadLeads();
            showToast('Lead created successfully');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        const lead = leads.find(l => l.id === id);
        if (lead) {
            try {
                // Optimistic Update
                setLeads(prev => prev.map(l => l.id === id ? { ...l, status: newStatus as any } : l));
                await LeadsService.updateLead(id, { status: newStatus as any });
                showToast(`Updated to ${newStatus}`);
            } catch (e) {
                showToast('Update failed', 'error');
                loadLeads(); // Revert on fail
            }
        }
    };

    const shareAsRequest = async (lead: Lead) => {
        try {
            await RequestsService.createRequest({
                title: lead.goal || `Request from ${lead.name || 'Lead'}`,
                type: 'BUY',
                description: lead.notes || '',
                budgetMin: 0,
                budgetMax: 0,
                yearMin: new Date().getFullYear() - 5,
                yearMax: new Date().getFullYear() + 1,
                city: 'Kyiv',
                priority: 'NORMAL',
                status: LeadStatus.NEW === lead.status ? RequestStatus.DRAFT : RequestStatus.COLLECTING_VARIANTS,
                clientChatId: lead.telegramChatId,
                assigneeId: undefined
            } as any);
            showToast('Shared as request', 'success');
            setViewMode('LIST');
        } catch (e: any) {
            showToast(e.message || 'Failed to create request', 'error');
        }
    };

    return (
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-medium text-[var(--text-primary)] tracking-tight">CRM Leads</h1>
                    <p className="text-sm text-[var(--text-secondary)]">
                        {totalItems} total leads • Page {page} of {totalPages}
                    </p>
                </div>
                <div className="flex gap-3">
                    <div className="bg-[var(--bg-input)] p-1 rounded-xl flex border border-[var(--border-color)]">
                        <button onClick={() => setViewMode('LIST')} className={`p-2 rounded-lg transition-all ${viewMode === 'LIST' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}><ListIcon size={18} /></button>
                        <button onClick={() => setViewMode('BOARD')} className={`p-2 rounded-lg transition-all ${viewMode === 'BOARD' ? 'bg-[var(--bg-panel)] text-gold-500 shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}><LayoutGrid size={18} /></button>
                    </div>
                    <button onClick={() => setIsModalOpen(true)} className="btn-primary text-sm">
                        <Plus size={18} /> New Contact
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 shrink-0">
                <div className="flex-1 max-w-sm relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
                    <input
                        className="input pl-9"
                        placeholder="Search leads..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <select
                    className="input w-40"
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value as any); setPage(1); }}
                >
                    <option value="ALL">All Statuses</option>
                    <option value="NEW">New</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="WON">Won</option>
                    <option value="LOST">Lost</option>
                </select>
            </div>

            <div className="flex-1 overflow-hidden min-h-0 relative">
                {loading && <div className="absolute inset-0 bg-[var(--bg-surface)]/50 backdrop-blur-[1px] z-10 flex items-center justify-center text-[var(--text-secondary)]">Loading...</div>}

                {viewMode === 'LIST' ? (
                    <div className="panel overflow-hidden h-full p-0 flex flex-col">
                        <div className="table-container flex-1 overflow-x-auto">
                            <table className="table min-w-[900px]">
                                <thead>
                                    <tr>
                                        <th>Client</th>
                                        <th className="hidden md:table-cell">Source</th>
                                        <th>Interest</th>
                                        <th className="hidden lg:table-cell">Last Active</th>
                                        <th>Status</th>
                                        <th>Actions</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leads.map(l => (
                                        <tr key={l.id} className="cursor-pointer group">
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-full bg-gold-500/10 text-gold-600 flex items-center justify-center font-bold text-xs border border-gold-500/20">
                                                        {l.name ? l.name.substring(0, 2).toUpperCase() : '??'}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-[var(--text-primary)]">{l.name}</div>
                                                        <div className="text-[10px] text-[var(--text-secondary)] font-mono">{l.phone || l.telegramUsername || 'No contact'}</div>
                                                        <div className="text-[10px] text-[var(--text-secondary)] mt-1 md:hidden">
                                                            {l.source} • {l.lastInteractionAt ? new Date(l.lastInteractionAt).toLocaleDateString() : 'New'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden md:table-cell"><span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)]">{l.source}</span></td>
                                            <td className="text-[var(--text-primary)]">{l.goal || '—'}</td>
                                            <td className="text-xs text-[var(--text-secondary)] tabular-nums hidden lg:table-cell">
                                                {l.lastInteractionAt ? new Date(l.lastInteractionAt).toLocaleDateString() : 'New'}
                                            </td>
                                            <td onClick={e => e.stopPropagation()}>
                                                <select
                                                    value={l.status}
                                                    onChange={(e) => handleStatusChange(l.id, e.target.value)}
                                                    className={`input px-3 py-1 text-xs font-bold w-auto ${l.status === 'NEW' ? 'text-green-500 bg-green-500/10 border-green-500/20' :
                                                            l.status === 'WON' ? 'text-gold-500 bg-gold-500/10 border-gold-500/20' :
                                                                'text-[var(--text-secondary)]'
                                                        }`}
                                                >
                                                    <option value="NEW">NEW</option>
                                                    <option value="CONTACTED">CONTACTED</option>
                                                    <option value="WON">WON</option>
                                                    <option value="LOST">LOST</option>
                                                </select>
                                            </td>
                                            <td>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); shareAsRequest(l); }}
                                                    className="btn-secondary text-xs px-3 py-1.5"
                                                >
                                                    Share as Request
                                                </button>
                                            </td>
                                            <td className="text-right">
                                                <ChevronRight size={16} className="text-[var(--text-muted)] group-hover:text-gold-500 transition-colors" />
                                            </td>
                                        </tr>
                                    ))}
                                    {leads.length === 0 && !loading && (
                                        <tr><td colSpan={6} className="text-center p-8 text-[var(--text-secondary)]">No leads found matching your criteria.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination Bar */}
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
                        {[LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.WON, LeadStatus.LOST].map(colStatus => (
                            <div key={colStatus} className="w-80 shrink-0 flex flex-col bg-[var(--bg-input)] backdrop-blur-xl rounded-2xl border border-[var(--border-color)] h-full">
                                <div className="p-4 flex justify-between items-center border-b border-[var(--border-color)]">
                                    <span className="font-bold text-xs uppercase tracking-widest text-[var(--text-secondary)]">{colStatus}</span>
                                    <span className="text-xs bg-[var(--bg-panel)] px-2 py-0.5 rounded-full text-[var(--text-primary)] font-bold tabular-nums border border-[var(--border-color)]">
                                        {/* Board view count is inaccurate if paginated, ideally we'd fetch counts per status from API */}
                                        {leads.filter(r => r.status === colStatus).length}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                    {leads.filter(r => r.status === colStatus).map(l => (
                                        <div key={l.id} className="panel p-4 hover:border-gold-500/50 transition-all cursor-pointer group">
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gold-500/10 text-gold-600 flex items-center justify-center font-bold text-[10px]">
                                                        {l.name ? l.name.substring(0, 2).toUpperCase() : '??'}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-sm text-[var(--text-primary)] block">{l.name}</span>
                                                        <span className="text-[10px] text-[var(--text-secondary)] font-mono">{new Date(l.createdAt).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] p-3 rounded-lg border border-[var(--border-color)] leading-relaxed">
                                                {l.goal || 'No goal specified'}
                                            </div>
                                        </div>
                                    ))}
                                    {/* Note: Board view currently only shows loaded leads. For pages, we need infinite scroll or per-column pagination. Keeping simple for now by showing current page's items in board. */}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-md p-8 animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-medium text-xl text-[var(--text-primary)]">New Contact</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Name</label>
                                <input className="input" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Interest</label>
                                <input className="input" value={formData.goal} onChange={e => setFormData({ ...formData, goal: e.target.value })} />
                            </div>
                            <div className="mt-8 flex justify-end gap-3">
                                <button onClick={() => setIsModalOpen(false)} className="btn-ghost">Cancel</button>
                                <button onClick={handleCreate} className="btn-primary">Create</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
