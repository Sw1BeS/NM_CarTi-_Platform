
import React, { useState, useEffect } from 'react';
import { Data } from '../services/data';
import { Company, User } from '../types';
import { Briefcase, Plus, Search, MoreVertical, Copy, Shield, X, Users, CheckCircle, Ban, Edit2, Trash2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';

export const CompaniesPage = () => {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [search, setSearch] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
        const sub = Data.subscribe('UPDATE_COMPANIES', loadData);
        return sub;
    }, []);

    const loadData = async () => {
        setCompanies(await Data.getCompanies());
        setUsers(await Data.getUsers());
    };

    const handleSave = async (data: Partial<Company>) => {
        try {
            if (editingCompany) {
                await Data.saveCompany({ ...editingCompany, ...data });
                showToast("Company updated");
            } else {
                await Data.saveCompany({ ...data, id: `comp_${Date.now()}`, createdAt: new Date().toISOString() } as any);
                showToast("Partner Company added");
            }
            setIsModalOpen(false);
            setEditingCompany(null);
            loadData();
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const generateInvite = (id: string) => {
        // Invite code generation logic can be improved or moved to backend
        const code = `INV-${id.substring(0, 4).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
        const company = companies.find(c => c.id === id);
        if (company) {
            Data.saveCompany({ ...company, inviteCode: code });
            showToast(`Invite Code Generated`);
            loadData();
        }
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code);
        showToast("Code copied to clipboard!");
    };

    const deleteCompany = async (id: string) => {
        if (confirm("Delete this company? Users will be detached.")) {
            await Data.deleteCompany(id);
            showToast("Company deleted");
            loadData();
        }
    };

    const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="space-y-6 h-[calc(100vh-100px)] flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-medium text-[var(--text-primary)]">Partner Network</h1>
                    <p className="text-sm text-[var(--text-secondary)]">Manage dealerships and affiliate companies.</p>
                </div>
                <button onClick={() => { setEditingCompany(null); setIsModalOpen(true); }} className="btn-primary">
                    <Plus size={18}/> Add Partner
                </button>
            </div>

            <div className="panel p-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18}/>
                    <input 
                        className="input pl-10"
                        placeholder="Search companies..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-10">
                {filtered.map(c => {
                    const staff = users.filter(u => u.companyId === c.id);
                    return (
                        <div key={c.id} className="panel p-0 overflow-hidden flex flex-col">
                            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-lg text-[var(--text-primary)]">{c.name}</h3>
                                        {c.status === 'ACTIVE' ? <CheckCircle size={16} className="text-green-500"/> : <Ban size={16} className="text-red-500"/>}
                                    </div>
                                    <span className="text-xs text-[var(--text-secondary)]">Added {new Date(c.createdAt).toLocaleDateString()}</span>
                                </div>
                                <div className="p-2 bg-[var(--bg-input)] rounded-lg">
                                    <Briefcase size={20} className="text-[var(--text-secondary)]"/>
                                </div>
                            </div>
                            
                            <div className="p-5 flex-1 space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Invite Code</label>
                                    {c.inviteCode ? (
                                        <div onClick={() => copyCode(c.inviteCode!)} className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 cursor-pointer hover:bg-blue-500/20 transition-colors group">
                                            <code className="text-sm font-mono font-bold text-blue-500">{c.inviteCode}</code>
                                            <Copy size={14} className="text-blue-400 group-hover:text-blue-500"/>
                                        </div>
                                    ) : (
                                        <button onClick={() => generateInvite(c.id)} className="text-xs text-gold-500 font-bold hover:underline">Generate Code</button>
                                    )}
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 block flex items-center gap-1">
                                        <Users size={12}/> Team Members ({staff.length})
                                    </label>
                                    <div className="flex -space-x-2 overflow-hidden">
                                        {staff.slice(0, 5).map(u => (
                                            <div key={u.id} className="inline-block h-8 w-8 rounded-full ring-2 ring-[var(--bg-panel)] bg-[var(--bg-input)] flex items-center justify-center text-xs font-bold text-[var(--text-primary)] border border-[var(--border-color)]" title={u.username}>
                                                {u.username?.substring(0,2).toUpperCase()}
                                            </div>
                                        ))}
                                        {staff.length === 0 && <span className="text-xs text-[var(--text-muted)] italic pl-2">No members yet</span>}
                                    </div>
                                </div>
                                
                                {c.notes && (
                                    <div className="text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] p-2 rounded border border-[var(--border-color)]">
                                        {c.notes}
                                    </div>
                                )}
                            </div>

                            <div className="p-3 bg-[var(--bg-input)] border-t border-[var(--border-color)] flex gap-2">
                                <button onClick={() => { setEditingCompany(c); setIsModalOpen(true); }} className="btn-secondary btn-sm flex-1">
                                    <Edit2 size={12}/> Edit
                                </button>
                                <button onClick={() => deleteCompany(c.id)} className="btn-secondary btn-sm text-red-500 hover:bg-red-500/10 hover:border-red-500/50">
                                    <Trash2 size={14}/>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {isModalOpen && (
                <CompanyModal 
                    initialData={editingCompany} 
                    onSave={handleSave} 
                    onClose={() => setIsModalOpen(false)} 
                />
            )}
        </div>
    );
};

const CompanyModal = ({ initialData, onSave, onClose }: any) => {
    const [form, setForm] = useState(initialData || { name: '', status: 'ACTIVE', notes: '' });

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-md p-6 animate-slide-up shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">{initialData ? 'Edit Company' : 'New Partner'}</h3>
                    <button onClick={onClose}><X size={20} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"/></button>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Company Name</label>
                        <input 
                            className="input" 
                            placeholder="e.g. Prestige Auto" 
                            value={form.name} 
                            onChange={e => setForm({...form, name: e.target.value})} 
                            autoFocus
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Status</label>
                        <select 
                            className="input"
                            value={form.status}
                            onChange={e => setForm({...form, status: e.target.value})}
                        >
                            <option value="ACTIVE">Active</option>
                            <option value="PENDING">Pending</option>
                            <option value="BLOCKED">Blocked</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Notes</label>
                        <textarea 
                            className="textarea h-24"
                            placeholder="Contact info, agreements..."
                            value={form.notes}
                            onChange={e => setForm({...form, notes: e.target.value})}
                        />
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="btn-ghost">Cancel</button>
                    <button onClick={() => onSave(form)} disabled={!form.name} className="btn-primary">
                        Save Partner
                    </button>
                </div>
            </div>
        </div>
    );
};
