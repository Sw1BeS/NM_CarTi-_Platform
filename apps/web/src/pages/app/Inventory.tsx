
import React, { useState, useEffect } from 'react';
import { InventoryService } from '../../services/inventoryService';
import { CarListing, B2BRequest, VariantStatus } from '../../types';
import { Plus, X, Search, Edit2, Trash2, MapPin, Calendar, Gauge, Link, UserPlus, CheckSquare, Square, DollarSign, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { MatchingService } from '../../services/matchingService';
import { RequestsService } from '../../services/requestsService';
import { parseListingFromUrl, saveParserProfile } from '../../services/parserClient';
import { PageHeader } from '../../components/ui/PageHeader';

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

    const { showToast } = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, [page, search, statusFilter]);

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

        // This should theoretically be a bulk API call. 
        // For now, loop calls (inefficient but works for small batches).
        Array.from(selectedIds).forEach(async (id: string) => {
            if (action === 'DELETE') {
                await InventoryService.deleteCar(id);
            } else {
                const car = cars.find(c => c.canonicalId === id);
                if (car) await InventoryService.saveCar({ ...car, status: action });
            }
        });

        setTimeout(loadData, 1000); // Lazy refresh
        setSelectedIds(new Set());
        showToast(`Bulk Action Completed: ${action}`);
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
        await RequestsService.addVariant(reqId, {
            title: car.title,
            price: car.price,
            year: car.year,
            location: car.location,
            thumbnail: car.thumbnail,
            url: car.sourceUrl || '#internal',
            source: 'INTERNAL',
            status: VariantStatus.SUBMITTED
        });
        showToast(`Attached ${car.title} to Request`);
        setAttachModal(null);
    };

    return (
        <div className="space-y-8 h-full flex flex-col relative">
            <PageHeader
                title="Inventory"
                subtitle={`${totalItems} vehicles • Page ${page} of ${totalPages}`}
                actions={(
                    <>
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
                    {cars.map(car => (
                        <div key={car.canonicalId} className={`panel p-0 overflow-hidden group hover:border-gold-500/30 transition-all flex flex-col relative ${selectedIds.has(car.canonicalId) ? 'ring-1 ring-gold-500 border-gold-500' : ''}`}>

                            <div onClick={() => toggleSelection(car.canonicalId)} className="absolute top-4 left-4 z-10 cursor-pointer p-2 rounded-lg bg-black/20 backdrop-blur-md hover:bg-black/40 transition-colors">
                                {selectedIds.has(car.canonicalId) ? <CheckSquare size={20} className="text-gold-500" /> : <Square size={20} className="text-white/70" />}
                            </div>

                            <div className="relative h-56 bg-[var(--bg-input)]">
                                <img src={car.thumbnail} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={car.title} />
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
                    ))}

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
                                    <p className="text-xs text-[var(--text-secondary)]">Support for AutoRia, OLX, Mobile.de (basic)</p>
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
                                <button
                                    className="btn-primary"
                                onClick={async () => {
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

    const handleChange = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

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
