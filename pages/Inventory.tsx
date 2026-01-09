
import React, { useState, useEffect } from 'react';
import { Data } from '../services/data';
import { CarListing, B2BRequest, VariantStatus } from '../types';
import { Plus, X, Search, Edit2, Trash2, MapPin, Calendar, Gauge, Link, UserPlus, CheckSquare, Square, DollarSign, CheckCircle } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';
import { MockDb } from '../services/mockDb';
import { MatchingService } from '../services/matchingService';

export const InventoryPage = () => {
    const [cars, setCars] = useState<CarListing[]>([]);
    const [requests, setRequests] = useState<B2BRequest[]>([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'RESERVED' | 'SOLD'>('AVAILABLE');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCar, setEditingCar] = useState<CarListing | null>(null);
    const [attachModal, setAttachModal] = useState<CarListing | null>(null);
    const [quickLeadModal, setQuickLeadModal] = useState<CarListing | null>(null);
    
    const { showToast } = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        loadData();
        const sub1 = Data.subscribe('UPDATE_INVENTORY', loadData);
        const sub2 = Data.subscribe('UPDATE_REQUESTS', loadData);
        return () => { sub1(); sub2(); };
    }, []);

    const loadData = async () => {
        setCars(await Data.getInventory());
        const reqs = await Data.getRequests();
        setRequests(reqs.filter(r => r.status !== 'CLOSED'));
    };

    const toggleSelection = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(c => c.canonicalId)));
        }
    };

    const handleBulkAction = (action: 'DELETE' | 'SOLD' | 'AVAILABLE') => {
        if (!confirm(`Apply ${action} to ${selectedIds.size} items?`)) return;
        selectedIds.forEach(async id => {
            const car = cars.find(c => c.canonicalId === id);
            if (car) {
                if (action === 'DELETE') await Data.deleteInventoryItem(id);
                else await Data.saveInventoryItem({ ...car, status: action });
            }
        });
        setSelectedIds(new Set());
        showToast(`Bulk Action Completed: ${action}`);
    };

    const handleSave = async (car: CarListing) => {
        await Data.saveInventoryItem(car);
        if (car.status === 'AVAILABLE') {
            const found = MatchingService.notifyIfMatch(car);
            if (found) showToast("System found matching B2B Requests!");
        }
        setIsModalOpen(false);
        setEditingCar(null);
        showToast("Car saved to inventory");
    };

    const openEdit = (car: CarListing) => {
        setEditingCar(car);
        setIsModalOpen(true);
    };

    const handleAttachToRequest = async (car: CarListing, reqId: string) => {
        await MockDb.addVariant(reqId, {
            title: car.title,
            price: car.price, 
            year: car.year,
            location: car.location,
            thumbnail: car.thumbnail,
            url: car.sourceUrl || '#internal',
            source: 'INTERNAL',
            status: VariantStatus.PENDING
        });
        showToast(`Attached ${car.title} to Request`);
        setAttachModal(null);
    };

    const filtered = cars.filter(c => {
        const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || c.location.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    return (
        <div className="space-y-8 h-full flex flex-col relative">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-medium text-[var(--text-primary)]">Inventory</h1>
                    <p className="text-sm text-[var(--text-secondary)]">Internal stock management</p>
                </div>
                <button onClick={() => { setEditingCar(null); setIsModalOpen(true); }} className="btn-primary">
                    <Plus size={20}/> Add Car
                </button>
            </div>

            <div className="flex gap-4 shrink-0 items-center">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={20}/>
                    <input 
                        className="input pl-10" 
                        placeholder="Search by model, year, VIN..." 
                        value={search} 
                        onChange={e => setSearch(e.target.value)} 
                    />
                </div>
                <div className="bg-[var(--bg-input)] p-1.5 rounded-xl flex shrink-0 border border-[var(--border-color)]">
                    {['AVAILABLE', 'RESERVED', 'SOLD', 'ALL'].map(s => (
                        <button 
                            key={s} 
                            onClick={() => setStatusFilter(s as any)}
                            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                                statusFilter === s 
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
                    {selectedIds.size > 0 && selectedIds.size === filtered.length ? <CheckSquare size={20} className="text-gold-500"/> : <Square size={20}/>}
                    Select All ({filtered.length})
                </button>
                {selectedIds.size > 0 && <span className="font-bold text-gold-500">• {selectedIds.size} Selected</span>}
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 content-start pb-24">
                {filtered.map(car => (
                    <div key={car.canonicalId} className={`panel p-0 overflow-hidden group hover:border-gold-500/30 transition-all flex flex-col relative ${selectedIds.has(car.canonicalId) ? 'ring-1 ring-gold-500 border-gold-500' : ''}`}>
                        
                        <div onClick={() => toggleSelection(car.canonicalId)} className="absolute top-4 left-4 z-10 cursor-pointer p-2 rounded-lg bg-black/20 backdrop-blur-md hover:bg-black/40 transition-colors">
                            {selectedIds.has(car.canonicalId) ? <CheckSquare size={20} className="text-gold-500"/> : <Square size={20} className="text-white/70"/>}
                        </div>

                        <div className="relative h-56 bg-[var(--bg-input)]">
                            <img src={car.thumbnail} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" alt={car.title}/>
                            <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => openEdit(car)} className="p-2 bg-white/90 backdrop-blur rounded-lg text-black hover:text-gold-500 shadow-sm"><Edit2 size={16}/></button>
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
                                    <Calendar size={14} className="text-gold-500/70"/> <span className="tabular-nums">{car.year}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <Gauge size={14} className="text-gold-500/70"/> <span className="tabular-nums">{car.mileage.toLocaleString()} km</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                    <MapPin size={14} className="text-gold-500/70"/> {car.location}
                                </div>
                            </div>
                        </div>
                        <div className="bg-[var(--bg-input)] p-4 flex justify-between items-center border-t border-[var(--border-color)] gap-3">
                            <button onClick={() => setAttachModal(car)} className="flex-1 text-sm text-[var(--text-secondary)] hover:text-gold-500 font-medium flex items-center justify-center gap-2 border-r border-[var(--border-color)] pr-2 transition-colors">
                                <Link size={14}/> Attach
                            </button>
                            <button onClick={() => setQuickLeadModal(car)} className="flex-1 text-sm text-[var(--text-secondary)] hover:text-gold-500 font-medium flex items-center justify-center gap-2 transition-colors">
                                <UserPlus size={14}/> Interest
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {selectedIds.size > 0 && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[var(--bg-surface)] text-[var(--text-primary)] px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-6 animate-slide-up z-20 border border-[var(--border-color)] backdrop-blur-md">
                    <span className="font-bold text-base">{selectedIds.size} Selected</span>
                    <div className="h-8 w-px bg-[var(--border-color)]"></div>
                    <div className="flex gap-3">
                        <button onClick={() => handleBulkAction('SOLD')} className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-input)] rounded-lg text-sm font-bold uppercase tracking-wider transition-colors text-green-500">
                            <DollarSign size={16}/> Sold
                        </button>
                        <button onClick={() => handleBulkAction('AVAILABLE')} className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--bg-input)] rounded-lg text-sm font-bold uppercase tracking-wider transition-colors text-blue-500">
                            <CheckCircle size={16}/> Available
                        </button>
                        <button onClick={() => handleBulkAction('DELETE')} className="flex items-center gap-2 px-4 py-2 hover:bg-red-500/20 text-red-500 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors">
                            <Trash2 size={16}/> Delete
                        </button>
                    </div>
                    <button onClick={() => setSelectedIds(new Set())} className="ml-4 p-2 hover:bg-[var(--bg-input)] rounded-full"><X size={20}/></button>
                </div>
            )}

            {isModalOpen && <CarEditor initialData={editingCar} onSave={handleSave} onClose={() => setIsModalOpen(false)} />}
            
            {attachModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel max-w-md w-full p-8 animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-medium text-xl text-[var(--text-primary)]">Attach Car to Request</h3>
                            <button onClick={() => setAttachModal(null)}><X size={24} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"/></button>
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
        </div>
    );
};

const CarEditor = ({ initialData, onSave, onClose }: any) => {
    const [form, setForm] = useState<Partial<CarListing>>(initialData || {
        canonicalId: `inv_${Date.now()}`, source: 'INTERNAL', title: '', price: { amount: 0, currency: 'USD' },
        year: new Date().getFullYear(), mileage: 0, location: 'Kyiv', thumbnail: '', specs: {}, status: 'AVAILABLE', postedAt: new Date().toISOString()
    });

    const handleChange = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="panel w-full max-w-xl p-10 animate-slide-up max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-bold text-2xl text-[var(--text-primary)]">{initialData ? 'Edit Vehicle' : 'New Vehicle'}</h3>
                    <button onClick={onClose}><X size={24} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"/></button>
                </div>
                
                <div className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Title</label>
                        <input className="input" placeholder="e.g. BMW X5 M50d" value={form.title} onChange={e => handleChange('title', e.target.value)} />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Price (USD)</label>
                            <input type="number" className="input tabular-nums" value={form.price?.amount} onChange={e => setForm({...form, price: { ...form.price!, amount: +e.target.value }})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest mb-2">Year</label>
                            <input type="number" className="input tabular-nums" value={form.year} onChange={e => handleChange('year', +e.target.value)} />
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
