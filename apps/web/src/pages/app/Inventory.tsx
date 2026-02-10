
import React, { useState, useEffect } from 'react';
import { InventoryService } from '../../services/inventoryService';
import { ApiClient } from '../../services/apiClient';
import { CarListing, B2BRequest, Showcase } from '../../types';
import { Plus, X, Search, Edit2, Trash2, MapPin, Calendar, Gauge, Link, UserPlus, CheckSquare, Square, DollarSign, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { MatchingService } from '../../services/matchingService';
import { RequestsService } from '../../services/requestsService';
import { parseListingFromUrl, saveParserProfile } from '../../services/parserClient';
import { PageHeader } from '../../components/ui/PageHeader';
import { ShowcaseService } from '../../services/showcaseService';

export const InventoryPage = () => {
    // Data State
    const [cars, setCars] = useState<CarListing[]>([]);
    const [requests, setRequests] = useState<B2BRequest[]>([]);

    // Filter State
    const [page, setPage] = useState(1);
    const [limit] = useState(24); // 4x6 grid
    const [totalItems, setTotalItems] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'RESERVED' | 'SOLD'>('AVAILABLE');

    const [loading, setLoading] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Modals
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCar, setEditingCar] = useState<CarListing | null>(null);
    const [attachModal, setAttachModal] = useState<CarListing | null>(null);
    const [quickLeadModal, setQuickLeadModal] = useState<CarListing | null>(null);
    const [importing, setImporting] = useState(false);
    const [importUrl, setImportUrl] = useState('');
    const [mappingModal, setMappingModal] = useState<{ url: string, domain: string, variables: Record<string, any>, images?: string[] } | null>(null);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [showcases, setShowcases] = useState<Showcase[]>([]);
    const [showcaseModalOpen, setShowcaseModalOpen] = useState(false);
    const [showcaseForm, setShowcaseForm] = useState({
        id: '',
        name: '',
        slug: '',
        mode: 'FILTER' as 'FILTER' | 'MANUAL' | 'HYBRID',
        isPublic: true,
        statusFilters: [] as string[],
        priceMin: '',
        priceMax: '',
        yearMin: '',
        yearMax: '',
        includeIds: '',
        excludeIds: ''
    });

    const { showToast } = useToast();
    const navigate = useNavigate();
    const parserEnabled = (import.meta as any)?.env?.VITE_PARSER_ENABLED === 'true';

    const getCarImages = (car: CarListing) => {
        const itemUrls = (car.mediaItems || [])
            .map(item => item.url || item.previewUrl)
            .filter(Boolean) as string[];
        const baseUrls = itemUrls.length ? itemUrls : (car.mediaUrls || []);
        const combined = car.thumbnail ? [car.thumbnail, ...baseUrls] : baseUrls;
        return Array.from(new Set(combined.filter(Boolean)));
    };

    useEffect(() => {
        loadData();
    }, [page, search, statusFilter]);

    useEffect(() => {
        loadShowcases();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await InventoryService.getInventory({
                page,
                limit,
                search: search || undefined,
                status: statusFilter
            });
            // Map Prisma 'id' to 'canonicalId' if needed for old types compatibility
            const mapped = data.items.map(c => ({
                ...c,
                canonicalId: (c as any).id || c.canonicalId // Handle prisma 'id'
            }));
            setCars(mapped);
            setTotalItems(data.total);
            setTotalPages(data.totalPages);

            // Fetch Requests for the "Attach" modal
            const reqData = await RequestsService.getRequests({ limit: 100, status: 'ALL' });
            setRequests(reqData.items.filter(r => r.status !== 'CLOSED'));
        } catch (e) {
            console.error(e);
            showToast('Failed to load inventory', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadShowcases = async () => {
        try {
            const list = await ShowcaseService.getShowcases();
            setShowcases(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error(e);
        }
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === cars.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(cars.map(c => c.canonicalId)));
        }
    };

    const handleBulkAction = (action: 'DELETE' | 'SOLD' | 'AVAILABLE') => {
        if (!confirm(`Apply ${action} to ${selectedIds.size} items?`)) return;

        const ids = Array.from(selectedIds);
        (async () => {
            try {
                if (action === 'DELETE') {
                    await Promise.all(ids.map(id => InventoryService.deleteCar(id)));
                } else {
                    await InventoryService.bulkUpdate(ids, { status: action });
                }
                setSelectedIds(new Set());
                showToast(`Bulk Action Completed: ${action}`);
                await loadData();
            } catch (e: any) {
                showToast(e.message || 'Bulk action failed', 'error');
            }
        })();
    };

    const handleSave = async (car: CarListing) => {
        if (!car.title || !car.title.trim()) {
            showToast('Title is required', 'error');
            return;
        }
        if (!car.price?.amount || car.price.amount <= 0) {
            showToast('Price must be greater than 0', 'error');
            return;
        }
        if (!car.year || car.year < 1980 || car.year > new Date().getFullYear() + 1) {
            showToast('Year looks invalid', 'error');
            return;
        }
        await InventoryService.saveCar(car);
        if (car.status === 'AVAILABLE') {
            const found = MatchingService.notifyIfMatch(car);
            if (found) showToast("System found matching B2B Requests!");
        }
        setIsModalOpen(false);
        setEditingCar(null);
        showToast("Car saved to inventory");
        loadData();
    };

    const openEdit = (car: CarListing) => {
        setEditingCar(car);
        setIsModalOpen(true);
    };

    const handleAttachToRequest = async (car: CarListing, reqId: string) => {
        const carId = car.canonicalId || (car as any).id;
        await RequestsService.addVariantsFromInventory(reqId, [carId]);
        showToast(`Attached ${car.title} to Request`);
        setAttachModal(null);
    };

    const resetShowcaseForm = () => {
        setShowcaseForm({
            id: '',
            name: '',
            slug: '',
            mode: 'FILTER',
            isPublic: true,
            statusFilters: [],
            priceMin: '',
            priceMax: '',
            yearMin: '',
            yearMax: '',
            includeIds: '',
            excludeIds: ''
        });
    };

    const openShowcaseModal = () => {
        setShowcaseModalOpen(true);
        loadShowcases();
    };

    const editShowcase = (sc: Showcase) => {
        setShowcaseForm({
            id: sc.id,
            name: sc.name,
            slug: sc.slug,
            mode: (sc.rules?.mode || 'FILTER') as any,
            isPublic: sc.isPublic,
            statusFilters: sc.rules?.filters?.status || [],
            priceMin: sc.rules?.filters?.priceMin ? String(sc.rules.filters.priceMin) : '',
            priceMax: sc.rules?.filters?.priceMax ? String(sc.rules.filters.priceMax) : '',
            yearMin: sc.rules?.filters?.yearMin ? String(sc.rules.filters.yearMin) : '',
            yearMax: sc.rules?.filters?.yearMax ? String(sc.rules.filters.yearMax) : '',
            includeIds: (sc.rules?.includeIds || []).join(','),
            excludeIds: (sc.rules?.excludeIds || []).join(',')
        });
    };

    const saveShowcase = async () => {
        if (!showcaseForm.name.trim()) {
            showToast('Showcase name is required', 'error');
            return;
        }
        const slug = showcaseForm.slug.trim() || showcaseForm.name.trim().toLowerCase().replace(/\s+/g, '-');
        const rules = {
            mode: showcaseForm.mode,
            filters: {
                status: showcaseForm.statusFilters.length ? showcaseForm.statusFilters : undefined,
                priceMin: showcaseForm.priceMin ? Number(showcaseForm.priceMin) : undefined,
                priceMax: showcaseForm.priceMax ? Number(showcaseForm.priceMax) : undefined,
                yearMin: showcaseForm.yearMin ? Number(showcaseForm.yearMin) : undefined,
                yearMax: showcaseForm.yearMax ? Number(showcaseForm.yearMax) : undefined
            },
            includeIds: showcaseForm.includeIds.split(',').map(s => s.trim()).filter(Boolean),
            excludeIds: showcaseForm.excludeIds.split(',').map(s => s.trim()).filter(Boolean)
        };
        try {
            if (showcaseForm.id) {
                await ShowcaseService.updateShowcase(showcaseForm.id, { name: showcaseForm.name, slug, isPublic: showcaseForm.isPublic, rules });
                showToast('Showcase updated');
            } else {
                await ShowcaseService.createShowcase({ name: showcaseForm.name, slug, isPublic: showcaseForm.isPublic, rules });
                showToast('Showcase created');
            }
            resetShowcaseForm();
            loadShowcases();
        } catch (e: any) {
            showToast(e.message || 'Failed to save showcase', 'error');
        }
    };

    const deleteShowcase = async (id: string) => {
        if (!confirm('Delete this showcase?')) return;
        try {
            await ShowcaseService.deleteShowcase(id);
            loadShowcases();
            showToast('Showcase deleted');
        } catch (e: any) {
            showToast(e.message || 'Failed to delete showcase', 'error');
        }
    };

    return (
        <div className="space-y-8 h-full flex flex-col relative">
            <PageHeader
                title="Inventory"
                subtitle={`${totalItems} vehicles • Page ${page} of ${totalPages}`}
                actions={(
                    <>
                        <button onClick={openShowcaseModal} className="btn-secondary">
                            <Plus size={18} /> Showcases
                        </button>
                        <button onClick={() => setImporting(true)} className="btn-secondary">
                            <Plus size={18} /> Import URL
                        </button>
                        <button onClick={() => { setEditingCar(null); setIsModalOpen(true); }} className="btn-primary">
                            <Plus size={20} /> Add Car
                        </button>
                    </>
                )}
            />

            <div className="flex gap-4 shrink-0 items-center">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={20} />
                    <input
                        className="input pl-10"
                        placeholder="Search by model, year, VIN..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <div className="bg-[var(--bg-input)] p-1.5 rounded-xl flex shrink-0 border border-[var(--border-color)]">
                    {['AVAILABLE', 'RESERVED', 'SOLD', 'ALL'].map(s => (
                        <button
                            key={s}
                            onClick={() => { setStatusFilter(s as any); setPage(1); }}
                            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${statusFilter === s
                                ? 'bg-[var(--bg-panel)] shadow-sm text-gold-500'
                                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)] px-1">
                <button onClick={toggleSelectAll} className="flex items-center gap-2 hover:text-gold-500 transition-colors">
                    {selectedIds.size > 0 && selectedIds.size === cars.length ? <CheckSquare size={20} className="text-gold-500" /> : <Square size={20} />}
                    Select All ({cars.length})
                </button>
                {selectedIds.size > 0 && <span className="font-bold text-gold-500">• {selectedIds.size} Selected</span>}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 relative">
                {loading && <div className="absolute inset-0 z-10 bg-[var(--bg-surface)]/50 backdrop-blur-[1px] flex items-center justify-center text-[var(--text-secondary)]">Loading...</div>}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 content-start pb-8">
                    {cars.map(car => {
                        const images = getCarImages(car);
                        const coverImage = images[0] || car.thumbnail || '';

                        return (
                        <div key={car.canonicalId} className={`panel p-0 overflow-hidden group hover:border-gold-500/30 transition-all flex flex-col relative ${selectedIds.has(car.canonicalId) ? 'ring-1 ring-gold-500 border-gold-500' : ''}`}>

                            <div onClick={() => toggleSelection(car.canonicalId)} className="absolute top-4 left-4 z-10 cursor-pointer p-2 rounded-lg bg-black/20 backdrop-blur-md hover:bg-black/40 transition-colors">
                                {selectedIds.has(car.canonicalId) ? <CheckSquare size={20} className="text-gold-500" /> : <Square size={20} className="text-white/70" />}
                            </div>

                            <div className="relative h-56 bg-[var(--bg-input)]">
                                {coverImage ? (
                                    <img src={coverImage} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={car.title} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-xs">No photo</div>
                                )}
                                {images.length > 1 && (
                                    <div className="absolute bottom-3 right-3 flex gap-1 bg-black/50 p-1 rounded-lg">
                                        {images.slice(0, 4).map((url, idx) => (
                                            <img key={`${car.canonicalId}-thumb-${idx}`} src={url} className="w-8 h-8 object-cover rounded" alt="" />
                                        ))}
                                        {images.length > 4 && (
                                            <div className="w-8 h-8 rounded bg-black/60 text-white text-[10px] flex items-center justify-center">
                                                +{images.length - 4}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEdit(car)} className="p-2 bg-white/90 backdrop-blur rounded-lg text-black hover:text-gold-500 shadow-sm"><Edit2 size={16} /></button>
                                </div>
                                <div className="absolute bottom-4 left-4 bg-black/60 text-white text-sm px-3 py-1.5 rounded-lg font-bold backdrop-blur-md border border-white/10 tabular-nums">
                                    {car.price.amount.toLocaleString()} {car.price.currency}
                                </div>
                                {car.status !== 'AVAILABLE' && (
                                    <div className={`absolute top-4 left-14 px-2 py-1 rounded-md font-bold text-xs uppercase shadow-sm border border-white/10 backdrop-blur-md ${car.status === 'SOLD' ? 'bg-red-500/80 text-white' : 'bg-amber-500/80 text-white'}`}>
                                        {car.status}
                                    </div>
                                )}
                            </div>
                            <div className="p-6 flex-1">
                                <h3 className="font-bold text-[var(--text-primary)] mb-2 line-clamp-1 text-base">{car.title}</h3>
                                <div className="text-sm text-[var(--text-secondary)] mb-4 line-clamp-2 min-h-[3em] leading-relaxed">
                                    {car.specs?.engine || 'N/A'} • {car.specs?.transmission || 'N/A'} • {car.specs?.fuel || 'N/A'}
                                </div>

                                <div className="flex flex-col gap-2 mt-auto">
                                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                        <Calendar size={14} className="text-gold-500/70" /> <span className="tabular-nums">{car.year}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                        <Gauge size={14} className="text-gold-500/70" /> <span className="tabular-nums">{car.mileage.toLocaleString()} km</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                        <MapPin size={14} className="text-gold-500/70" /> {car.location}
                                    </div>
                                </div>
                            </div>
                            <div className="bg-[var(--bg-input)] p-4 flex flex-col sm:flex-row justify-between items-center border-t border-[var(--border-color)] gap-2">
                                <button onClick={() => setAttachModal(car)} className="flex-1 w-full sm:w-auto text-sm text-[var(--text-secondary)] hover:text-gold-500 font-medium flex items-center justify-center gap-2 sm:border-r border-[var(--border-color)] sm:pr-2 transition-colors">
                                    <Link size={14} /> Attach
                                </button>
                                <button onClick={() => setQuickLeadModal(car)} className="flex-1 w-full sm:w-auto text-sm text-[var(--text-secondary)] hover:text-gold-500 font-medium flex items-center justify-center gap-2 transition-colors">
                                    <UserPlus size={14} /> Interest
                                </button>
                            </div>
                        </div>
                    );
                    })}

                    {cars.length === 0 && !loading && (
                        <div className="col-span-4 text-center py-12 text-[var(--text-secondary)]">
                            No vehicles found matching criteria.
                        </div>
                    )}
                </div>
            </div>

            {/* Pagination Controls */}
            <div className="flex justify-between items-center pt-4 border-t border-[var(--border-color)]">
                <button
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                    className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                >
                    <ChevronLeft size={16} /> Previous
                </button>
                <div className="flex gap-1.5">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        // Simple pagination logic for demonstration
                        let p = i + 1;
                        if (page > 3 && totalPages > 5) p = page - 2 + i;
                        if (p > totalPages) return null;
                        return (
                            <button
                                key={p}
                                onClick={() => setPage(p)}
                                className={`w-8 h-8 rounded-lg text-sm font-bold transition-all ${page === p ? 'bg-[var(--bg-panel)] text-gold-500 border border-gold-500/30' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-input)]'
                                    }`}
                            >
                                {p}
                            </button>
                        );
                    })}
                </div>
                <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                    className="btn-secondary flex items-center gap-2 disabled:opacity-50"
                >
                    Next <ChevronRight size={16} />
                </button>
            </div>


            {selectedIds.size > 0 && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-[var(--bg-surface)] text-[var(--text-primary)] px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-6 animate-slide-up z-20 border border-[var(--border-color)] backdrop-blur-md">
                    <span className="font-bold text-base">{selectedIds.size} Selected</span>
                    <div className="h-8 w-px bg-[var(--border-color)]"></div>
                    <div className="flex gap-3">
                        <button onClick={() => handleBulkAction('SOLD')} className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-input)] rounded-lg text-sm font-bold uppercase tracking-wider transition-colors text-green-500">
                            <DollarSign size={16} /> Sold
                        </button>
                        <button onClick={() => handleBulkAction('AVAILABLE')} className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-input)] rounded-lg text-sm font-bold uppercase tracking-wider transition-colors text-blue-500">
                            <CheckCircle size={16} /> Available
                        </button>
                        <button onClick={() => handleBulkAction('DELETE')} className="flex items-center gap-2 px-4 py-2 hover:bg-red-500/20 text-red-500 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors">
                            <Trash2 size={16} /> Delete
                        </button>
                    </div>
                    <button onClick={() => setSelectedIds(new Set())} className="ml-4 p-2 hover:bg-[var(--bg-input)] rounded-full"><X size={20} /></button>
                </div>
            )}

            {isModalOpen && <CarEditor initialData={editingCar} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
            {attachModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel max-w-md w-full p-8 animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-medium text-xl text-[var(--text-primary)]">Attach Car to Request</h3>
                            <button onClick={() => setAttachModal(null)}><X size={24} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" /></button>
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                            {requests.map(r => (
                                <button key={r.id} onClick={() => handleAttachToRequest(attachModal, r.id)} className="w-full text-left p-5 border border-[var(--border-color)] rounded-xl transition-all hover:border-gold-500/50 hover:bg-gold-500/5 group">
                                    <div className="font-bold text-base text-[var(--text-primary)]">{r.title}</div>
                                    <div className="text-sm text-[var(--text-secondary)] group-hover:text-gold-500 mt-1">{r.publicId} • {r.status}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {showcaseModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-4xl p-6 animate-slide-up">
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="font-bold text-[var(--text-primary)] text-lg">Showcases</h3>
                                <p className="text-xs text-[var(--text-secondary)]">Create saved inventory presets for Mini App and sharing.</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={resetShowcaseForm} className="btn-secondary text-xs">New</button>
                                <button onClick={() => setShowcaseModalOpen(false)} className="btn-ghost text-xs">Close</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <div className="text-xs font-bold text-[var(--text-secondary)] uppercase">Existing</div>
                                <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                                    {showcases.map(sc => (
                                        <div key={sc.id} className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-sm text-[var(--text-primary)]">{sc.name}</div>
                                                <div className="text-[10px] text-[var(--text-secondary)]">{sc.slug} • {sc.rules?.mode || 'FILTER'}</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => editShowcase(sc)} className="btn-secondary text-[10px]">Edit</button>
                                                <button onClick={() => deleteShowcase(sc.id)} className="btn-secondary text-[10px] text-red-500">Delete</button>
                                            </div>
                                        </div>
                                    ))}
                                    {showcases.length === 0 && (
                                        <div className="text-xs text-[var(--text-secondary)]">No showcases yet.</div>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="text-xs font-bold text-[var(--text-secondary)] uppercase">Showcase Form</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input className="input col-span-2" placeholder="Name" value={showcaseForm.name} onChange={e => setShowcaseForm(prev => ({ ...prev, name: e.target.value }))} />
                                    <input className="input col-span-2" placeholder="Slug" value={showcaseForm.slug} onChange={e => setShowcaseForm(prev => ({ ...prev, slug: e.target.value }))} />
                                    <select className="input" value={showcaseForm.mode} onChange={e => setShowcaseForm(prev => ({ ...prev, mode: e.target.value as any }))}>
                                        <option value="FILTER">Filter</option>
                                        <option value="MANUAL">Manual</option>
                                        <option value="HYBRID">Hybrid</option>
                                    </select>
                                    <select className="input" value={showcaseForm.isPublic ? 'public' : 'private'} onChange={e => setShowcaseForm(prev => ({ ...prev, isPublic: e.target.value === 'public' }))}>
                                        <option value="public">Public</option>
                                        <option value="private">Private</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <input className="input" placeholder="Price min" value={showcaseForm.priceMin} onChange={e => setShowcaseForm(prev => ({ ...prev, priceMin: e.target.value }))} />
                                    <input className="input" placeholder="Price max" value={showcaseForm.priceMax} onChange={e => setShowcaseForm(prev => ({ ...prev, priceMax: e.target.value }))} />
                                    <input className="input" placeholder="Year min" value={showcaseForm.yearMin} onChange={e => setShowcaseForm(prev => ({ ...prev, yearMin: e.target.value }))} />
                                    <input className="input" placeholder="Year max" value={showcaseForm.yearMax} onChange={e => setShowcaseForm(prev => ({ ...prev, yearMax: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-[var(--text-secondary)]">Status Filters</label>
                                    <div className="flex gap-2 mt-1">
                                        {['AVAILABLE', 'RESERVED', 'SOLD'].map(status => (
                                            <button
                                                key={status}
                                                onClick={() => setShowcaseForm(prev => ({
                                                    ...prev,
                                                    statusFilters: prev.statusFilters.includes(status)
                                                        ? prev.statusFilters.filter(s => s !== status)
                                                        : [...prev.statusFilters, status]
                                                }))}
                                                className={`px-3 py-1 text-[10px] rounded border ${showcaseForm.statusFilters.includes(status) ? 'border-gold-500 text-gold-500 bg-gold-500/10' : 'border-[var(--border-color)] text-[var(--text-secondary)]'}`}
                                            >
                                                {status}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-[var(--text-secondary)]">Include IDs (comma)</label>
                                    <input className="input" value={showcaseForm.includeIds} onChange={e => setShowcaseForm(prev => ({ ...prev, includeIds: e.target.value }))} placeholder="car_1,car_2" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-[var(--text-secondary)]">Exclude IDs (comma)</label>
                                    <input className="input" value={showcaseForm.excludeIds} onChange={e => setShowcaseForm(prev => ({ ...prev, excludeIds: e.target.value }))} placeholder="car_3,car_4" />
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button onClick={saveShowcase} className="btn-primary text-xs px-4">Save Showcase</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {importing && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-lg p-6 animate-slide-up">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-[var(--text-primary)] text-lg">Import Inventory</h3>
                            <button onClick={() => setImporting(false)} className="btn-ghost"><X size={20} /></button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Option A: Parse URL</h4>
                                <div className="space-y-2">
                                    <input className="input" placeholder="https://..." value={importUrl} onChange={e => setImportUrl(e.target.value)} />
                                    <p className="text-xs text-[var(--text-secondary)]">
                                        Support for AutoRia, OLX, Mobile.de (basic).
                                        <button
                                            onClick={() => { setImporting(false); navigate('/settings?tab=PARSER'); }}
                                            className="ml-2 underline text-gold-500"
                                        >
                                            Parser profiles
                                        </button>
                                    </p>
                                </div>
                            </div>

                            <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-[var(--border-color)]"></div>
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-[var(--bg-surface)] px-2 text-[var(--text-secondary)]">OR</span>
                                </div>
                            </div>

                            <div>
                                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">Option B: Upload CSV</h4>
                                <div className="border-2 border-dashed border-[var(--border-color)] rounded-xl p-6 text-center hover:border-gold-500/50 transition-colors cursor-pointer" onClick={() => document.getElementById('csv-upload')?.click()}>
                                    <input id="csv-upload" type="file" className="hidden" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] || null)} />
                                    {csvFile ? (
                                        <div className="text-gold-500 font-bold">{csvFile.name}</div>
                                    ) : (
                                        <div className="text-[var(--text-secondary)]">Click to upload CSV</div>
                                    )}
                                </div>
                                <p className="text-[10px] text-[var(--text-secondary)] mt-2">Required columns: Title, Price, Year. Optional: Mileage, Location.</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setImporting(false)} className="btn-ghost">Cancel</button>
                            {csvFile ? (
                                <button className="btn-primary" onClick={async () => {
                                    if (!csvFile) return;
                                    const text = await csvFile.text();
                                    const rows = text.split('\n').map(row => row.split(','));
                                    const header = rows[0].map(h => h.trim().toLowerCase());

                                    const titleIdx = header.findIndex(h => h.includes('title') || h.includes('name') || h.includes('model'));
                                    const priceIdx = header.findIndex(h => h.includes('price') || h.includes('cost'));
                                    const yearIdx = header.findIndex(h => h.includes('year'));

                                    if (titleIdx === -1 || priceIdx === -1) {
                                        showToast('CSV must have Title and Price columns', 'error');
                                        return;
                                    }

                                    let importedCount = 0;
                                    for (let i = 1; i < rows.length; i++) {
                                        const row = rows[i];
                                        if (row.length < header.length) continue;

                                        const title = row[titleIdx]?.trim();
                                        const priceRaw = row[priceIdx]?.replace(/[^0-9]/g, '') || '0';
                                        const yearRaw = yearIdx > -1 ? row[yearIdx]?.replace(/[^0-9]/g, '') : '2020';

                                        if (!title) continue;

                                        try {
                                            await InventoryService.saveCar({
                                                title,
                                                price: { amount: parseInt(priceRaw), currency: 'USD' },
                                                year: parseInt(yearRaw),
                                                mileage: 0,
                                                status: 'AVAILABLE',
                                                source: 'MANUAL',
                                                canonicalId: `csv_${Date.now()}_${i}`
                                            });
                                            importedCount++;
                                        } catch (e) {}
                                    }

                                    showToast(`Imported ${importedCount} items`);
                                    setImporting(false);
                                    setCsvFile(null);
                                    loadData();
                                }}>
                                    Import CSV
                                </button>
                            ) : (
                                <div className="flex flex-col items-start">
                                <button
                                    className="btn-primary"
                                    disabled={!parserEnabled}
                                    onClick={async () => {
                                    if (!parserEnabled) {
                                        showToast('URL parser is disabled in this build', 'error');
                                        return;
                                    }
                                    if (!importUrl.trim()) return showToast('URL required', 'error');
                                    try {
                                        const parsed = await parseListingFromUrl(importUrl.trim());

                                        if (parsed.confidence === 'low') {
                                            if (confirm('Confidence is low. Map fields manually?')) {
                                                 try {
                                                    const domain = new URL(importUrl.trim()).hostname;
                                                    setMappingModal({
                                                        url: importUrl.trim(),
                                                        domain,
                                                        variables: parsed.variables || {},
                                                        images: parsed.raw?.images || []
                                                    });
                                                    // Don't close import modal yet, let mapping handle it
                                                    return;
                                                 } catch(e) {}
                                            }
                                        }

                                        const now = new Date();
                                        const car: any = {
                                            canonicalId: `imp_${now.getTime()}`,
                                            source: 'EXTERNAL',
                                            sourceUrl: parsed.url || importUrl.trim(),
                                            title: parsed.title || 'Imported Car',
                                            price: { amount: parsed.price || 0, currency: (parsed.currency || 'USD') as any },
                                            year: parsed.year || now.getFullYear(),
                                            mileage: parsed.mileage || 0,
                                            location: parsed.location || '',
                                            thumbnail: parsed.thumbnail || '',
                                            mediaUrls: parsed.raw?.images || [],
                                            specs: {
                                                engine: parsed.raw?.jsonLd?.engine || '',
                                                fuel: parsed.currency ? '' : '',
                                                vin: parsed.raw?.jsonLd?.vin || ''
                                            },
                                            status: 'AVAILABLE',
                                            postedAt: now.toISOString()
                                        };
                                        setEditingCar(car);
                                        setIsModalOpen(true);
                                        setImporting(false);
                                        setImportUrl('');
                                        showToast('Parsed data loaded');
                                    } catch (e: any) {
                                        showToast(e.message || 'Parse failed', 'error');
                                    }
                                    }}
                                >
                                    Import
                                </button>
                                {!parserEnabled && (
                                    <div className="mt-2 text-xs text-orange-400">
                                        URL parsing is disabled for this release.
                                    </div>
                                )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {mappingModal && (
                <MappingModal
                    domain={mappingModal.domain}
                    variables={mappingModal.variables}
                    images={mappingModal.images}
                    onClose={() => setMappingModal(null)}
                    onSave={async (selectors: any) => {
                         try {
                             await saveParserProfile(mappingModal.domain, selectors);
                             showToast('Profile saved. Retrying...');
                             const parsed = await parseListingFromUrl(mappingModal.url);

                             const now = new Date();
                             const car: any = {
                                 canonicalId: `imp_${now.getTime()}`,
                                 source: 'EXTERNAL',
                                 sourceUrl: parsed.url || mappingModal.url,
                                 title: parsed.title || 'Imported Car',
                                 price: { amount: parsed.price || 0, currency: (parsed.currency || 'USD') as any },
                                 year: parsed.year || now.getFullYear(),
                                 mileage: parsed.mileage || 0,
                                 location: parsed.location || '',
                                 thumbnail: parsed.thumbnail || '',
                                 mediaUrls: parsed.raw?.images || [],
                                 specs: {
                                     engine: parsed.raw?.jsonLd?.engine || '',
                                     fuel: parsed.currency ? '' : '',
                                     vin: parsed.raw?.jsonLd?.vin || ''
                                 },
                                 status: 'AVAILABLE',
                                 postedAt: now.toISOString()
                             };
                             setEditingCar(car);
                             setIsModalOpen(true);
                             setMappingModal(null);
                             setImporting(false);
                             setImportUrl('');
                         } catch(e: any) {
                             showToast(e.message || 'Retry failed', 'error');
                         }
                    }}
                />
            )}
        </div>
    );
};

const MappingModal = ({ domain, variables, images, onClose, onSave }: any) => {
    const targetFields = [
        { key: 'title', label: 'Title' },
        { key: 'price', label: 'Price' },
        { key: 'currency', label: 'Currency' },
        { key: 'year', label: 'Year' },
        { key: 'mileage', label: 'Mileage' },
        { key: 'location', label: 'Location' },
        { key: 'description', label: 'Description' },
        { key: 'vin', label: 'VIN' },
        { key: 'url', label: 'Source URL' },
        { key: 'images', label: 'Images' }
    ];

    const sourceKeys = Object.keys(variables || {});
    if (!sourceKeys.includes('images')) sourceKeys.push('images');

    const [mapping, setMapping] = useState<Record<string, string>>(() => {
        const next: Record<string, string> = {};
        targetFields.forEach(f => {
            if (sourceKeys.includes(f.key)) next[f.key] = f.key;
        });
        return next;
    });

    const previewValue = (key: string) => {
        if (!key) return '';
        if (key === 'images') return `${(images || []).length} images`;
        const value = variables?.[key];
        if (value === undefined || value === null) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <div className="panel w-full max-w-2xl p-6 animate-slide-up">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-[var(--text-primary)] text-lg">Map Fields: {domain}</h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)]" /></button>
                </div>
                <p className="text-xs text-[var(--text-secondary)] mb-4">
                    Choose which extracted variable should fill each inventory field.
                </p>

                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {targetFields.map(field => (
                        <div key={field.key} className="grid grid-cols-3 gap-3 items-center">
                            <div className="text-xs font-bold text-[var(--text-secondary)] uppercase">{field.label}</div>
                            <select
                                className="input text-sm"
                                value={mapping[field.key] || ''}
                                onChange={e => setMapping({ ...mapping, [field.key]: e.target.value })}
                            >
                                <option value="">— not mapped —</option>
                                {sourceKeys.map(k => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                            <div className="text-xs text-[var(--text-secondary)] truncate" title={previewValue(mapping[field.key] || '')}>
                                {previewValue(mapping[field.key] || '') || '—'}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="btn-ghost">Cancel</button>
                    <button onClick={() => onSave({ mode: 'fieldMap', fields: mapping })} className="btn-primary">Save Mapping</button>
                </div>
            </div>
        </div>
    );
};

const CarEditor = ({ initialData, onSave, onClose }: any) => {
    // If opening Existing car, ensure ID is passed
    const [form, setForm] = useState<Partial<CarListing>>(initialData || {
        // No canonicalId init here, backend handles it or it's empty
        source: 'INTERNAL', sourceUrl: '', title: '', price: { amount: 0, currency: 'USD' },
        year: new Date().getFullYear(), mileage: 0, location: 'Kyiv', thumbnail: '', specs: {}, status: 'AVAILABLE'
    });
    const [uploading, setUploading] = useState(false);

    const handleChange = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));
    const addMediaUrl = (url: string) => {
        if (!url) return;
        setForm(prev => {
            const current = Array.isArray(prev.mediaUrls) ? prev.mediaUrls : [];
            const next = Array.from(new Set([...current, url]));
            return {
                ...prev,
                mediaUrls: next,
                thumbnail: prev.thumbnail || url
            };
        });
    };

    const removeMediaUrl = (url: string) => {
        setForm(prev => {
            const current = Array.isArray(prev.mediaUrls) ? prev.mediaUrls : [];
            const next = current.filter(u => u !== url);
            const nextThumb = prev.thumbnail === url ? (next[0] || '') : prev.thumbnail;
            return { ...prev, mediaUrls: next, thumbnail: nextThumb };
        });
    };

    const handleImageUpload = async (file: File) => {
        if (!file) return;
        setUploading(true);
        try {
            const reader = new FileReader();
            const content = await new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });

            const res = await ApiClient.post<{ ok: boolean; url?: string; name?: string }>('storage/upload', {
                name: file.name,
                content,
                type: file.type
            });

            if (!res.ok || !res.data?.url) {
                throw new Error(res.message || 'Upload failed');
            }
            addMediaUrl(res.data.url);
        } catch (e) {
            console.error(e);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="panel w-full max-w-xl p-10 animate-slide-up max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-bold text-2xl text-[var(--text-primary)]">{initialData ? 'Edit Vehicle' : 'New Vehicle'}</h3>
                    <button onClick={onClose}><X size={24} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors" /></button>
                </div>

                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Title</label>
                            <input className="input" placeholder="e.g. BMW X5 M50d" value={form.title} onChange={e => handleChange('title', e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Source</label>
                            <select className="input" value={form.source || 'INTERNAL'} onChange={e => handleChange('source', e.target.value as any)}>
                                <option value="INTERNAL">Internal</option>
                                <option value="EXTERNAL">External</option>
                                <option value="AUTORIA">AutoRia</option>
                                <option value="OLX">OLX</option>
                                <option value="REONO">Reono</option>
                                <option value="MANUAL">Manual</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Price (USD)</label>
                            <input type="number" className="input tabular-nums" value={form.price?.amount} onChange={e => setForm({ ...form, price: { ...form.price!, amount: +e.target.value } })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Year</label>
                            <input type="number" className="input tabular-nums" value={form.year} onChange={e => handleChange('year', +e.target.value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Mileage (km)</label>
                            <input type="number" className="input tabular-nums" value={form.mileage} onChange={e => handleChange('mileage', +e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Location</label>
                            <input className="input" value={form.location} onChange={e => handleChange('location', e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Source URL</label>
                        <input className="input" placeholder="https://..." value={form.sourceUrl || ''} onChange={e => handleChange('sourceUrl', e.target.value)} />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Images</label>
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-3">
                                {(form.mediaUrls || []).map((url) => (
                                    <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-input)]">
                                        <img src={url} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => removeMediaUrl(url)}
                                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                                        >
                                            ×
                                        </button>
                                        <button
                                            onClick={() => setForm(prev => ({ ...prev, thumbnail: url }))}
                                            className={`absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded ${form.thumbnail === url ? 'bg-gold-500 text-black' : 'bg-black/60 text-white'}`}
                                        >
                                            Cover
                                        </button>
                                    </div>
                                ))}
                                {!form.mediaUrls?.length && (
                                    <div className="text-xs text-[var(--text-secondary)]">No images yet.</div>
                                )}
                            </div>
                            <div className="flex gap-2 items-center">
                                <label className="btn-secondary text-xs cursor-pointer">
                                    {uploading ? 'Uploading...' : 'Upload Image'}
                                    <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
                                </label>
                                <input
                                    className="input flex-1 text-xs"
                                    placeholder="Paste image URL"
                                    value={form.thumbnail || ''}
                                    onChange={e => setForm(prev => ({ ...prev, thumbnail: e.target.value }))}
                                />
                                <button onClick={() => form.thumbnail && addMediaUrl(form.thumbnail)} className="btn-secondary text-xs">Add URL</button>
                            </div>
                            <div className="text-[10px] text-[var(--text-secondary)]">Tip: Choose "Cover" to set the main thumbnail.</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">VIN</label>
                            <input className="input" value={form.specs?.vin || ''} onChange={e => setForm(prev => ({ ...prev, specs: { ...(prev.specs || {}), vin: e.target.value } }))} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Engine</label>
                            <input className="input" value={form.specs?.engine || ''} onChange={e => setForm(prev => ({ ...prev, specs: { ...(prev.specs || {}), engine: e.target.value } }))} />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Transmission</label>
                            <input className="input" value={form.specs?.transmission || ''} onChange={e => setForm(prev => ({ ...prev, specs: { ...(prev.specs || {}), transmission: e.target.value } }))} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Fuel</label>
                            <input className="input" value={form.specs?.fuel || ''} onChange={e => setForm(prev => ({ ...prev, specs: { ...(prev.specs || {}), fuel: e.target.value } }))} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Drive</label>
                            <input className="input" value={form.specs?.drive || ''} onChange={e => setForm(prev => ({ ...prev, specs: { ...(prev.specs || {}), drive: e.target.value } }))} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Status</label>
                        <select className="input appearance-none" value={form.status} onChange={e => handleChange('status', e.target.value)}>
                            <option value="AVAILABLE">Available</option>
                            <option value="RESERVED">Reserved</option>
                            <option value="SOLD">Sold</option>
                        </select>
                    </div>
                </div>

                <div className="mt-10 flex justify-end gap-3 pt-6 border-t border-[var(--border-color)]">
                    <button onClick={onClose} className="btn-ghost text-base">Cancel</button>
                    <button onClick={() => onSave(form)} disabled={!form.title || !form.price?.amount} className="btn-primary text-base px-8">
                        Save Vehicle
                    </button>
                </div>
            </div>
        </div>
    );
};
