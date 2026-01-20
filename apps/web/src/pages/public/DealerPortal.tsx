
import React, { useState, useEffect, useRef } from 'react';
import { B2BRequest, RequestStatus, Variant, VariantStatus, User, UserRole, Company } from '../../types';
import { CarSearchEngine } from '../../services/carService';
import { ImageUtils } from '../../services/imageUtils';
import { addPublicVariant, createDealerSession, getPublicRequests } from '../../services/publicApi';
import { Briefcase, ChevronRight, X, DollarSign, Calendar, MapPin, Search, Plus, CheckCircle, Zap, Loader, ExternalLink, RefreshCw, Car, Upload, Image as ImageIcon, Camera, ArrowLeft } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';

export const DealerPortal = () => {
    const [user, setUser] = useState<User | null>(null);
    const [company, setCompany] = useState<Company | null>(null);
    const [requests, setRequests] = useState<B2BRequest[]>([]);
    const [filter, setFilter] = useState('');
    
    // Auth State
    const [isLoading, setIsLoading] = useState(true);
    const [accessError, setAccessError] = useState('');
    
    // View State
    const [selectedReq, setSelectedReq] = useState<B2BRequest | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    
    const [searchParams] = useSearchParams();

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        setIsLoading(true);
        const tg = (window as any).Telegram?.WebApp;
        if (!tg?.initData) {
            setAccessError("Access Denied. Please launch via the verified Telegram Bot.");
            setIsLoading(false);
            return;
        }
        try {
            const session = await createDealerSession(tg.initData);
            setUser(session.user);
            setCompany(null);
        } catch (err: any) {
            console.error(err);
            setAccessError("Partner Access Only.");
            setIsLoading(false);
            return;
        }

        const loadedRequests = await loadRequests();
        const targetId = searchParams.get('request');
        if (targetId) {
            const target = loadedRequests.find(r => r.id === targetId);
            if (target) {
                setSelectedReq(target);
                setFormOpen(true);
            }
        }
        
        if (tg) {
            tg.ready();
            tg.expand();
            tg.enableClosingConfirmation();
        }
        setIsLoading(false);
    };

    const loadRequests = async () => {
        const res = await getPublicRequests();
        const publicRequests = (res.items || []).filter(r => r.status !== 'CLOSED');
        setRequests(publicRequests);
        return publicRequests;
    };

    const handleSubmitVariant = async (data: any) => {
        if (!selectedReq) return;
        const payload = {
            ...data,
            source: 'MANUAL',
            status: VariantStatus.SUBMITTED,
            managerNotes: `Submitted by ${user?.username} (${company?.name || 'Partner'})`
        };
        await addPublicVariant(selectedReq.id, payload);

        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            tg.showPopup({ 
                title: 'Success', 
                message: 'Offer submitted to the manager!', 
                buttons: [{type: 'ok'}]
            }, () => {
                tg.close();
            });
        } else {
            alert('Offer submitted!');
            setFormOpen(false);
            setSelectedReq(null);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-primary)]">
                <Loader className="animate-spin" size={32}/>
            </div>
        );
    }

    if (accessError) {
        return (
            <div className="min-h-screen bg-[var(--bg-app)] flex flex-col items-center justify-center p-6 text-center">
                <div className="bg-red-500/10 p-4 rounded-full text-red-500 mb-4"><Briefcase size={32}/></div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Partner Access Only</h2>
                <p className="text-[var(--text-secondary)] text-sm mb-6">{accessError}</p>
            </div>
        );
    }

    if (formOpen && selectedReq) {
        return <SubmissionForm request={selectedReq} onSubmit={handleSubmitVariant} onCancel={() => setFormOpen(false)} />;
    }

    return (
        <div className="min-h-screen bg-[var(--bg-app)] pb-20 font-sans">
            <div className="bg-[var(--bg-surface)] p-4 sticky top-0 z-10 border-b border-[var(--border-color)]">
                <div className="flex justify-between items-center mb-1">
                    <h1 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                        CarTié Partner <CheckCircle size={16} className="text-blue-500 fill-blue-500/20"/>
                    </h1>
                    {company && <span className="text-[10px] bg-[var(--bg-input)] px-2 py-1 rounded text-[var(--text-secondary)] font-bold uppercase">{company.name}</span>}
                </div>
                <div className="relative mt-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16}/>
                    <input 
                        className="input pl-9 py-2"
                        placeholder="Search requests..."
                        value={filter}
                        onChange={e => setFilter(e.target.value)}
                    />
                </div>
            </div>

            <div className="p-4 space-y-4">
                {requests.filter(r => r.title.toLowerCase().includes(filter.toLowerCase())).map(r => (
                    <div key={r.id} onClick={() => { setSelectedReq(r); setFormOpen(true); }} className="panel p-4 active:scale-95 transition-transform cursor-pointer hover:border-blue-500/50">
                        <div className="flex justify-between items-start mb-2">
                            <span className="bg-blue-500/10 text-blue-500 text-[10px] px-2 py-1 rounded font-bold uppercase">{r.publicId}</span>
                            <span className="text-[10px] text-[var(--text-muted)]">{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                        <h3 className="font-bold text-[var(--text-primary)] text-lg mb-1">{r.title}</h3>
                        <div className="flex flex-wrap gap-2 text-sm text-[var(--text-secondary)] mb-3">
                            <span className="flex items-center gap-1 bg-[var(--bg-input)] px-2 py-1 rounded"><DollarSign size={12}/> {r.budgetMax ? r.budgetMax.toLocaleString() : 'Any'}</span>
                            <span className="flex items-center gap-1 bg-[var(--bg-input)] px-2 py-1 rounded"><Calendar size={12}/> {r.yearMin}+</span>
                            <span className="flex items-center gap-1 bg-[var(--bg-input)] px-2 py-1 rounded"><MapPin size={12}/> {r.city}</span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-3">{r.description || 'No specific details.'}</p>
                        <button className="btn-primary w-full text-sm">
                            Have this car? <ChevronRight size={16}/>
                        </button>
                    </div>
                ))}
                {requests.length === 0 && (
                    <div className="text-center py-10 text-[var(--text-muted)]">
                        <p>No active requests right now.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

const SubmissionForm = ({ request, onSubmit, onCancel }: any) => {
    const [link, setLink] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [thumbnail, setThumbnail] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [data, setData] = useState({
        title: '',
        price: '',
        year: '',
        mileage: '',
        description: '',
        url: '' 
    });

    const handleSmartPaste = async () => {
        if (!link) return;
        setIsParsing(true);
        try {
            const parsed = await CarSearchEngine.parseUrl(link);
            setData({
                title: parsed.title,
                price: String(parsed.price.amount),
                year: String(parsed.year),
                mileage: String(parsed.mileage),
                description: '',
                url: link
            });
            if (parsed.thumbnail) setThumbnail(parsed.thumbnail);
        } catch (e) {
            alert("Could not auto-fill. Please enter details manually.");
            setData({ ...data, url: link });
        } finally {
            setIsParsing(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await ImageUtils.toBase64(e.target.files[0]);
                const compressed = await ImageUtils.compress(base64);
                setThumbnail(compressed);
            } catch (err) {
                alert("Failed to process image");
            }
        }
    };

    const submit = () => {
        if (!data.title || !data.price) return alert("Title and Price are required.");
        onSubmit({
            title: data.title,
            price: { amount: parseInt(data.price), currency: 'USD' }, 
            year: parseInt(data.year) || new Date().getFullYear(),
            mileage: parseInt(data.mileage) || 0,
            sourceUrl: data.url,
            thumbnail: thumbnail,
            managerNotes: data.description
        });
    };

    return (
        <div className="min-h-screen bg-[var(--bg-app)] flex flex-col">
            <div className="p-4 border-b border-[var(--border-color)] flex items-center gap-3 sticky top-0 bg-[var(--bg-surface)] z-20">
                <button onClick={onCancel} className="btn-icon btn-ghost rounded-full"><ArrowLeft size={24}/></button>
                <div className="flex-1">
                    <h3 className="font-bold text-[var(--text-primary)] leading-tight">Submit Offer</h3>
                    <p className="text-xs text-[var(--text-secondary)] truncate w-48">{request.title}</p>
                </div>
            </div>

            <div className="p-4 space-y-6 flex-1 overflow-y-auto">
                <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20">
                    <label className="block text-xs font-bold text-blue-500 uppercase mb-2 flex items-center gap-1">
                        <Zap size={14} className="fill-blue-500"/> Smart Paste
                    </label>
                    <div className="flex gap-2">
                        <input 
                            className="input flex-1" 
                            placeholder="Paste link..."
                            value={link}
                            onChange={e => setLink(e.target.value)}
                        />
                        <button onClick={handleSmartPaste} disabled={!link || isParsing} className="btn-primary">
                            {isParsing ? <Loader className="animate-spin" size={18}/> : 'Fill'}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="block text-xs font-bold text-[var(--text-muted)] uppercase">Photo</label>
                    <div className="flex items-center gap-3">
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-24 h-24 bg-[var(--bg-input)] rounded-xl border border-dashed border-[var(--border-color)] flex flex-col items-center justify-center cursor-pointer hover:border-gold-500 transition-colors overflow-hidden relative"
                        >
                            {thumbnail ? (
                                <img src={thumbnail} className="w-full h-full object-cover" />
                            ) : (
                                <>
                                    <Camera size={24} className="text-[var(--text-muted)] mb-1"/>
                                    <span className="text-[10px] text-[var(--text-muted)]">Add Photo</span>
                                </>
                            )}
                        </div>
                        <div className="flex-1">
                            <p className="text-xs text-[var(--text-secondary)] mb-2">Upload a real photo of the car.</p>
                            <button onClick={() => fileInputRef.current?.click()} className="btn-secondary btn-sm">
                                <Upload size={12}/> Upload
                            </button>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleFileUpload}
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Car Title</label>
                        <input className="input" placeholder="BMW X5..." value={data.title} onChange={e => setData({...data, title: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Price ($)</label>
                            <input type="number" className="input" placeholder="50000" value={data.price} onChange={e => setData({...data, price: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Year</label>
                            <input type="number" className="input" placeholder="2020" value={data.year} onChange={e => setData({...data, year: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-[var(--text-muted)] uppercase mb-1">Description</label>
                        <textarea className="textarea h-24" placeholder="Condition, location..." value={data.description} onChange={e => setData({...data, description: e.target.value})} />
                    </div>
                </div>
            </div>

            <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-surface)] sticky bottom-0">
                <button onClick={submit} className="w-full btn-primary py-3">
                    Submit Proposal
                </button>
            </div>
        </div>
    );
};
