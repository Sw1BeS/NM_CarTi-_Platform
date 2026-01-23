
import React, { useState, useEffect } from 'react';
import { Data } from '../../services/data';
import { Plus, X, Search, Building, User, Check, AlertCircle } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export const PartnersPage = () => {
    const [partners, setPartners] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({ name: '', city: '', contact: '', notes: '' });
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [pList, uList] = await Promise.all([
                Data.listEntities('partner_company'),
                Data.listEntities('partner_user')
            ]);
            setPartners(pList);
            setUsers(uList);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!form.name.trim()) return showToast('Name required', 'error');

        try {
            await Data.saveEntity('partner_company', {
                id: `partner_${Date.now()}`,
                ...form,
                status: 'VERIFIED', // Auto-verify for P0
                createdAt: new Date().toISOString()
            });
            showToast('Partner added');
            setIsModalOpen(false);
            setForm({ name: '', city: '', contact: '', notes: '' });
            loadData();
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    return (
        <div className="flex flex-col h-full gap-6">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">B2B Partners</h1>
                    <p className="text-sm text-[var(--text-secondary)]">Manage dealers and partners</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="btn-primary flex items-center gap-2">
                    <Plus size={18} /> Add Partner
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 overflow-y-auto content-start">
                {partners.map(p => (
                    <div key={p.id} className="panel p-5 flex flex-col gap-3 group border border-transparent hover:border-gold-500/30 transition-all">
                        <div className="flex justify-between items-start">
                            <div className="w-10 h-10 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500">
                                <Building size={20} />
                            </div>
                            <span className="px-2 py-1 bg-green-500/10 text-green-500 text-[10px] font-bold rounded uppercase">
                                {p.status || 'Verified'}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-[var(--text-primary)]">{p.name}</h3>
                            <p className="text-sm text-[var(--text-secondary)]">{p.city || 'Unknown City'}</p>
                        </div>
                        <div className="mt-auto pt-3 border-t border-[var(--border-color)] flex justify-between text-xs text-[var(--text-secondary)]">
                            <span>{p.contact || 'No contact'}</span>
                            <span>{users.filter((u: any) => u.partnerId === p.id).length} Users</span>
                        </div>
                    </div>
                ))}

                {partners.length === 0 && !loading && (
                    <div className="col-span-full text-center py-12 text-[var(--text-secondary)]">
                        No partners found.
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-md p-8 animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-[var(--text-primary)]">New Partner</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={20} className="text-[var(--text-secondary)]" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Company Name</label>
                                <input className="input" autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">City</label>
                                <input className="input" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Contact Info</label>
                                <input className="input" placeholder="Phone / Email" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Notes</label>
                                <textarea className="textarea" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="btn-ghost">Cancel</button>
                            <button onClick={handleSave} className="btn-primary px-6">Create Partner</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
