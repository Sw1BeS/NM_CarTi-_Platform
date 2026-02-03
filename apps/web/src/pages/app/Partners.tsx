import React, { useEffect, useState } from 'react';
import { Data } from '../../services/data';
import { Plus, X, Building, User, Handshake, Tag, Mail, Phone, FileText } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

export const PartnersPage = () => {
    const { showToast } = useToast();
    const [companies, setCompanies] = useState<any[]>([]);
    const [contacts, setContacts] = useState<any[]>([]);
    const [deals, setDeals] = useState<any[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

    const [companyModalOpen, setCompanyModalOpen] = useState(false);
    const [contactModalOpen, setContactModalOpen] = useState(false);
    const [dealModalOpen, setDealModalOpen] = useState(false);

    const [companyForm, setCompanyForm] = useState({ name: '', status: 'ACTIVE', tags: '', city: '', email: '', phone: '', website: '', terms: '', notes: '' });
    const [contactForm, setContactForm] = useState({ name: '', role: '', phone: '', email: '', telegram: '', notes: '' });
    const [dealForm, setDealForm] = useState({ status: 'OPEN', value: '', currency: 'USD', requestId: '', notes: '' });

    const load = async () => {
        try {
            const [c, ct, d] = await Promise.all([
                Data.listEntities('partner_company'),
                Data.listEntities('partner_contact'),
                Data.listEntities('partner_deal')
            ]);
            setCompanies(c || []);
            setContacts(ct || []);
            setDeals(d || []);
            if (!selectedCompanyId && c && c.length > 0) setSelectedCompanyId(c[0].id);
        } catch (e) {
            console.error(e);
            showToast('Failed to load partners', 'error');
        }
    };

    useEffect(() => { load(); }, []);

    const selectedCompany = companies.find(c => c.id === selectedCompanyId);
    const companyContacts = contacts.filter(c => c.companyId === selectedCompanyId);
    const companyDeals = deals.filter(d => d.companyId === selectedCompanyId);

    const saveCompany = async () => {
        if (!companyForm.name.trim()) return showToast('Company name is required', 'error');
        await Data.saveEntity('partner_company', {
            ...companyForm,
            tags: companyForm.tags.split(',').map(t => t.trim()).filter(Boolean),
            createdAt: new Date().toISOString()
        } as any);
        setCompanyModalOpen(false);
        setCompanyForm({ name: '', status: 'ACTIVE', tags: '', city: '', email: '', phone: '', website: '', terms: '', notes: '' });
        load();
        showToast('Partner company created', 'success');
    };

    const saveContact = async () => {
        if (!selectedCompanyId) return;
        if (!contactForm.name.trim()) return showToast('Contact name is required', 'error');
        await Data.saveEntity('partner_contact', {
            companyId: selectedCompanyId,
            ...contactForm,
            createdAt: new Date().toISOString()
        } as any);
        setContactModalOpen(false);
        setContactForm({ name: '', role: '', phone: '', email: '', telegram: '', notes: '' });
        load();
        showToast('Contact created', 'success');
    };

    const saveDeal = async () => {
        if (!selectedCompanyId) return;
        await Data.saveEntity('partner_deal', {
            companyId: selectedCompanyId,
            status: dealForm.status,
            value: dealForm.value ? Number(dealForm.value) : undefined,
            currency: dealForm.currency,
            requestId: dealForm.requestId || undefined,
            notes: dealForm.notes,
            createdAt: new Date().toISOString()
        } as any);
        setDealModalOpen(false);
        setDealForm({ status: 'OPEN', value: '', currency: 'USD', requestId: '', notes: '' });
        load();
        showToast('Deal logged', 'success');
    };

    return (
        <div className="flex h-[calc(100vh-140px)] gap-6">
            <div className="w-80 panel flex flex-col overflow-hidden">
                <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-input)] flex justify-between items-center">
                    <div>
                        <h2 className="font-bold text-[var(--text-primary)]">Partner CRM</h2>
                        <p className="text-xs text-[var(--text-secondary)]">Companies & contacts</p>
                    </div>
                    <button onClick={() => setCompanyModalOpen(true)} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
                        <Plus size={14} /> Add
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {companies.map(c => (
                        <button key={c.id} onClick={() => setSelectedCompanyId(c.id)} className={`w-full text-left p-4 border-b border-[var(--border-color)] hover:bg-[var(--bg-input)] transition-colors ${selectedCompanyId === c.id ? 'bg-[var(--bg-input)] border-l-4 border-l-gold-500' : 'border-l-4 border-l-transparent'}`}>
                            <div className="flex justify-between items-center">
                                <div className="font-bold text-sm text-[var(--text-primary)] truncate">{c.name}</div>
                                <span className="text-[10px] uppercase text-[var(--text-secondary)]">{c.status || 'ACTIVE'}</span>
                            </div>
                            <div className="text-xs text-[var(--text-secondary)] mt-1">{c.city || '—'}</div>
                            {Array.isArray(c.tags) && c.tags.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {c.tags.slice(0, 3).map((t: string) => (
                                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-panel)] border border-[var(--border-color)]">#{t}</span>
                                    ))}
                                </div>
                            )}
                        </button>
                    ))}
                    {companies.length === 0 && (
                        <div className="p-6 text-xs text-[var(--text-secondary)]">No partner companies yet.</div>
                    )}
                </div>
            </div>

            <div className="flex-1 panel flex flex-col overflow-hidden">
                {selectedCompany ? (
                    <div className="flex-1 overflow-y-auto">
                        <div className="p-6 border-b border-[var(--border-color)] bg-[var(--bg-panel)]">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500">
                                    <Building size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl text-[var(--text-primary)]">{selectedCompany.name}</h3>
                                    <div className="text-xs text-[var(--text-secondary)]">{selectedCompany.city || '—'} • {selectedCompany.status || 'ACTIVE'}</div>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                <div className="flex items-center gap-2"><User size={12} /> {companyContacts.length} contacts</div>
                                <div className="flex items-center gap-2"><Handshake size={12} /> {companyDeals.length} deals</div>
                                <div className="flex items-center gap-2"><Mail size={12} /> {selectedCompany.email || '—'}</div>
                                <div className="flex items-center gap-2"><Phone size={12} /> {selectedCompany.phone || '—'}</div>
                            </div>
                        </div>

                        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="panel p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-[var(--text-primary)]">Contacts</h4>
                                    <button onClick={() => setContactModalOpen(true)} className="btn-secondary text-xs px-3 py-1.5"><Plus size={12} /> Add</button>
                                </div>
                                <div className="space-y-3">
                                    {companyContacts.map(c => (
                                        <div key={c.id} className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)]">
                                            <div className="flex justify-between">
                                                <div className="font-bold text-sm text-[var(--text-primary)]">{c.name}</div>
                                                <div className="text-[10px] text-[var(--text-secondary)]">{c.role || 'Contact'}</div>
                                            </div>
                                            <div className="text-xs text-[var(--text-secondary)] mt-1">{c.email || c.phone || c.telegram || '—'}</div>
                                        </div>
                                    ))}
                                    {companyContacts.length === 0 && (
                                        <div className="text-xs text-[var(--text-secondary)]">No contacts yet.</div>
                                    )}
                                </div>
                            </div>

                            <div className="panel p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-bold text-[var(--text-primary)]">Deals</h4>
                                    <button onClick={() => setDealModalOpen(true)} className="btn-secondary text-xs px-3 py-1.5"><Plus size={12} /> Log Deal</button>
                                </div>
                                <div className="space-y-3">
                                    {companyDeals.map(d => (
                                        <div key={d.id} className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)]">
                                            <div className="flex justify-between">
                                                <div className="font-bold text-sm text-[var(--text-primary)]">{d.status || 'OPEN'}</div>
                                                <div className="text-xs text-[var(--text-secondary)]">{d.value ? `${d.value} ${d.currency || 'USD'}` : '—'}</div>
                                            </div>
                                            {d.requestId && <div className="text-[10px] text-[var(--text-secondary)] mt-1">Request: {d.requestId}</div>}
                                            {d.notes && <div className="text-[10px] text-[var(--text-secondary)] mt-1">{d.notes}</div>}
                                        </div>
                                    ))}
                                    {companyDeals.length === 0 && (
                                        <div className="text-xs text-[var(--text-secondary)]">No deals logged.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">Select a company</div>
                )}
            </div>

            {companyModalOpen && (
                <Modal title="New Partner Company" onClose={() => setCompanyModalOpen(false)}>
                    <div className="space-y-3">
                        <input className="input" placeholder="Company name" value={companyForm.name} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} />
                        <input className="input" placeholder="City" value={companyForm.city} onChange={e => setCompanyForm({ ...companyForm, city: e.target.value })} />
                        <input className="input" placeholder="Tags (comma separated)" value={companyForm.tags} onChange={e => setCompanyForm({ ...companyForm, tags: e.target.value })} />
                        <input className="input" placeholder="Email" value={companyForm.email} onChange={e => setCompanyForm({ ...companyForm, email: e.target.value })} />
                        <input className="input" placeholder="Phone" value={companyForm.phone} onChange={e => setCompanyForm({ ...companyForm, phone: e.target.value })} />
                        <input className="input" placeholder="Website" value={companyForm.website} onChange={e => setCompanyForm({ ...companyForm, website: e.target.value })} />
                        <textarea className="textarea" placeholder="Notes" value={companyForm.notes} onChange={e => setCompanyForm({ ...companyForm, notes: e.target.value })} />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setCompanyModalOpen(false)} className="btn-ghost">Cancel</button>
                            <button onClick={saveCompany} className="btn-primary">Save</button>
                        </div>
                    </div>
                </Modal>
            )}

            {contactModalOpen && (
                <Modal title="New Contact" onClose={() => setContactModalOpen(false)}>
                    <div className="space-y-3">
                        <input className="input" placeholder="Name" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} />
                        <input className="input" placeholder="Role" value={contactForm.role} onChange={e => setContactForm({ ...contactForm, role: e.target.value })} />
                        <input className="input" placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} />
                        <input className="input" placeholder="Email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} />
                        <input className="input" placeholder="Telegram" value={contactForm.telegram} onChange={e => setContactForm({ ...contactForm, telegram: e.target.value })} />
                        <textarea className="textarea" placeholder="Notes" value={contactForm.notes} onChange={e => setContactForm({ ...contactForm, notes: e.target.value })} />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setContactModalOpen(false)} className="btn-ghost">Cancel</button>
                            <button onClick={saveContact} className="btn-primary">Save</button>
                        </div>
                    </div>
                </Modal>
            )}

            {dealModalOpen && (
                <Modal title="Log Deal" onClose={() => setDealModalOpen(false)}>
                    <div className="space-y-3">
                        <select className="input" value={dealForm.status} onChange={e => setDealForm({ ...dealForm, status: e.target.value })}>
                            <option value="OPEN">OPEN</option>
                            <option value="WON">WON</option>
                            <option value="LOST">LOST</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                            <input className="input" placeholder="Value" value={dealForm.value} onChange={e => setDealForm({ ...dealForm, value: e.target.value })} />
                            <input className="input" placeholder="Currency" value={dealForm.currency} onChange={e => setDealForm({ ...dealForm, currency: e.target.value })} />
                        </div>
                        <input className="input" placeholder="Request ID (optional)" value={dealForm.requestId} onChange={e => setDealForm({ ...dealForm, requestId: e.target.value })} />
                        <textarea className="textarea" placeholder="Notes" value={dealForm.notes} onChange={e => setDealForm({ ...dealForm, notes: e.target.value })} />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setDealModalOpen(false)} className="btn-ghost">Cancel</button>
                            <button onClick={saveDeal} className="btn-primary">Save</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

const Modal = ({ title, onClose, children }: any) => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="panel w-full max-w-lg p-6 animate-slide-up">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-[var(--text-primary)]">{title}</h3>
                <button onClick={onClose}><X size={18} /></button>
            </div>
            {children}
        </div>
    </div>
);
