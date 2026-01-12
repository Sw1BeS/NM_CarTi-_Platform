
import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, Download, Loader, CheckCircle, Plus, Globe, Link as LinkIcon, ArrowRight, Eye, Edit3, Terminal, Filter, AlertTriangle, Bug, Megaphone } from 'lucide-react';
import { RequestsService } from '../services/requestsService';
import { InventoryService } from '../services/inventoryService';
import { B2BRequest, Variant, VariantStatus, TelegramContent, ContentStatus } from '../types';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Data } from '../services/data';
import { ContentGenerator } from '../services/contentGenerator';
import { useToast } from '../contexts/ToastContext';

// ... (imports)

// Local Mock Helpers since MockDb is gone
const mockSearchGlobal = async (query: string) => {
    // Simulate API delay
    await new Promise(r => setTimeout(r, 800));
    // Return dummy data
    return Array.from({ length: 5 }).map((_, i) => ({
        title: `${query} Result ${i + 1}`,
        price: { amount: 20000 + i * 5000, currency: 'USD' },
        year: 2020 + i,
        source: i % 2 === 0 ? 'EXTERNAL' : 'OLX',
        sourceUrl: 'https://example.com',
        thumbnail: 'https://via.placeholder.com/150',
        location: 'Kyiv'
    }));
};

const mockParseUrl = async (url: string) => {
    await new Promise(r => setTimeout(r, 800));
    return {
        title: "Parsed Listing Title",
        price: { amount: 15000, currency: 'USD' },
        year: 2018,
        source: 'EXTERNAL',
        sourceUrl: url,
        thumbnail: 'https://via.placeholder.com/150',
        location: 'Parsed City',
        specs: {}
    };
};


export const SearchPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [mode, setMode] = useState<'GLOBAL' | 'DIRECT'>('GLOBAL');
    const [query, setQuery] = useState('');
    const [directUrl, setDirectUrl] = useState('');

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [debugMode, setDebugMode] = useState(false);

    const [results, setResults] = useState<any[]>([]);
    const [sourceFilter, setSourceFilter] = useState<'ALL' | 'INTERNAL' | 'EXTERNAL'>('ALL');

    const [requests, setRequests] = useState<B2BRequest[]>([]);
    const [selectedReqId, setSelectedReqId] = useState<string>('');
    const [importedIds, setImportedIds] = useState<Set<number>>(new Set());
    const [previewItem, setPreviewItem] = useState<{ item: Partial<Variant> & { description?: string }, idx: number } | null>(null);

    useEffect(() => {
        RequestsService.getRequests({ status: 'ALL' }).then(data => {
            const activeReqs = data.items.filter(r => r.status !== 'CLOSED' && r.status !== 'PUBLISHED');
            setRequests(activeReqs);

            const paramId = searchParams.get('requestId');
            if (paramId && activeReqs.some(r => r.id === paramId)) {
                setSelectedReqId(paramId);
            } else if (activeReqs.length > 0) {
                setSelectedReqId(activeReqs[0].id);
            }
        });

        const q = searchParams.get('q');
        if (q) {
            setQuery(q);
            handleSearch(null, q);
        }
    }, [searchParams]);

    const handleSearch = async (e: React.FormEvent | null, overrideQuery?: string) => {
        if (e) e.preventDefault();
        const q = overrideQuery || query;
        if (!q) return;

        setLoading(true);
        setErrorMsg('');
        setResults([]);
        try {
            const data = await mockSearchGlobal(q);
            setResults(data);
        } catch (e: any) {
            setErrorMsg(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDirectParse = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!directUrl) return;
        setLoading(true);
        setResults([]);
        setErrorMsg('');

        try {
            const data = await mockParseUrl(directUrl);
            setResults([{ ...data, url: directUrl, source: data.source }]);
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err.message || "Failed to parse URL. Ensure it's a valid public listing.");
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async (result: any, index: number) => {
        if (!selectedReqId) return alert("Select a request first");

        let finalPrice = 0;
        if (result.price) {
            finalPrice = typeof result.price === 'object' ? result.price.amount : result.price;
        }

        await RequestsService.addVariant(selectedReqId, {
            title: result.title,
            price: { amount: finalPrice, currency: 'USD' },
            url: result.sourceUrl || result.url,
            source: mode === 'DIRECT' ? 'MANUAL' : (result.source || 'EXTERNAL'),
            status: VariantStatus.PENDING,
            year: result.year,
            mileage: 0,
            location: result.location
        } as any);

        const newSet = new Set(importedIds);
        newSet.add(index);
        setImportedIds(newSet);
        setPreviewItem(null);
        showToast("Added to request!");
    };

    const handleDraftPost = async (result: any) => {
        const tempVariant: any = {
            ...result,
            specs: result.specs || { engine: 'N/A', transmission: 'N/A', fuel: 'N/A' }
        };

        const body = ContentGenerator.fromVariant(tempVariant);
        const contentData: Partial<TelegramContent> = {
            title: `Post: ${result.title}`,
            body: body,
            type: 'POST',
            status: ContentStatus.DRAFT,
            mediaUrls: result.thumbnail ? [result.thumbnail] : [],
            actions: []
        };

        await Data.saveContent({ ...contentData, id: `cnt_${Date.now()}`, createdAt: new Date().toISOString() } as any);
        showToast("Draft created! Redirecting...");
        navigate('/telegram');
    };

    const filteredResults = results.filter(r => {
        if (sourceFilter === 'INTERNAL') return r.source === 'INTERNAL';
        if (sourceFilter === 'EXTERNAL') return r.source !== 'INTERNAL';
        return true;
    });

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex justify-between items-center shrink-0">
                <h1 className="text-2xl font-medium text-[var(--text-primary)]">Search & Parsing</h1>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-secondary)]">Import to:</span>
                    <select
                        className="input max-w-xs"
                        value={selectedReqId}
                        onChange={(e) => setSelectedReqId(e.target.value)}
                    >
                        {requests.map(r => (
                            <option key={r.id} value={r.id}>{r.publicId} - {r.title}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Mode Switcher */}
            <div className="flex justify-between items-end border-b border-[var(--border-color)] shrink-0">
                <div className="flex gap-4">
                    <button
                        onClick={() => { setMode('GLOBAL'); setResults([]); setQuery(''); setErrorMsg(''); }}
                        className={`pb-3 px-2 text-sm font-medium transition-colors flex items-center gap-2 ${mode === 'GLOBAL' ? 'border-b-2 border-gold-500 text-gold-500' : 'text-[var(--text-secondary)]'}`}
                    >
                        <Globe size={16} /> Global Search
                    </button>
                    <button
                        onClick={() => { setMode('DIRECT'); setResults([]); setDirectUrl(''); setErrorMsg(''); }}
                        className={`pb-3 px-2 text-sm font-medium transition-colors flex items-center gap-2 ${mode === 'DIRECT' ? 'border-b-2 border-gold-500 text-gold-500' : 'text-[var(--text-secondary)]'}`}
                    >
                        <LinkIcon size={16} /> Direct URL Parser
                    </button>
                </div>
                <button
                    onClick={() => setDebugMode(!debugMode)}
                    className={`flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-1 rounded mb-2 ${debugMode ? 'bg-red-500/10 text-red-500' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                    <Bug size={12} /> Debug Mode
                </button>
            </div>

            {/* Input Area */}
            <div className="panel p-6 shrink-0">
                {mode === 'GLOBAL' ? (
                    <form onSubmit={handleSearch} className="flex gap-4">
                        <div className="flex-1 relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={20} />
                            <input
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Enter keywords (e.g. 'BMW X5 2021 white')..."
                                className="input pl-10 py-3"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary"
                        >
                            {loading ? <Loader className="animate-spin" size={20} /> : <SearchIcon size={20} />}
                            Find
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleDirectParse} className="flex gap-4">
                        <div className="flex-1 relative">
                            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={20} />
                            <input
                                type="text"
                                value={directUrl}
                                onChange={e => setDirectUrl(e.target.value)}
                                placeholder="Paste listing URL (AutoRia, OLX)..."
                                className="input pl-10 py-3"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary"
                        >
                            {loading ? <Loader className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                            Parse URL
                        </button>
                    </form>
                )}

                {/* Filters */}
                {mode === 'GLOBAL' && (
                    <div className="mt-4 flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2 bg-[var(--bg-input)] p-1 rounded-lg border border-[var(--border-color)]">
                            <button onClick={() => setSourceFilter('ALL')} className={`px-3 py-1 rounded text-xs font-bold ${sourceFilter === 'ALL' ? 'bg-[var(--bg-panel)] shadow text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>All</button>
                            <button onClick={() => setSourceFilter('INTERNAL')} className={`px-3 py-1 rounded text-xs font-bold ${sourceFilter === 'INTERNAL' ? 'bg-green-500/20 text-green-500 shadow' : 'text-[var(--text-secondary)]'}`}>Internal Stock</button>
                            <button onClick={() => setSourceFilter('EXTERNAL')} className={`px-3 py-1 rounded text-xs font-bold ${sourceFilter === 'EXTERNAL' ? 'bg-[var(--bg-panel)] shadow text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>External</button>
                        </div>
                    </div>
                )}

                {/* Error Display */}
                {errorMsg && (
                    <div className="mt-4 bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg flex items-center gap-3">
                        <AlertTriangle size={20} />
                        <span className="text-sm font-medium">{errorMsg}</span>
                    </div>
                )}
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto">
                {filteredResults.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredResults.map((res: any, idx) => (
                            <div key={idx} className={`panel p-4 flex flex-col gap-4 group hover:border-gold-500/50 transition-all ${res.source === 'INTERNAL' ? 'border-green-500/20 bg-green-500/5' : ''}`}>
                                <div className="flex gap-4 items-center">
                                    <div className="relative">
                                        <img src={res.thumbnail || 'https://via.placeholder.com/150'} alt="" className="w-24 h-24 object-cover rounded-lg bg-[var(--bg-input)]" />
                                        {res.source === 'INTERNAL' && (
                                            <div className="absolute -top-2 -left-2 bg-green-500 text-white text-[10px] px-2 py-0.5 rounded shadow-sm font-bold">STOCK</div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="font-bold text-lg text-[var(--text-primary)]">{res.title}</h3>
                                        <div className="flex gap-4 text-sm text-[var(--text-secondary)] mt-1">
                                            <span className="font-bold">
                                                {typeof res.price === 'object' ? res.price.amount : res.price}
                                                {' '}
                                                {typeof res.price === 'object' ? res.price.currency : 'USD'}
                                            </span>
                                            <span>•</span>
                                            <span>{res.year}</span>
                                            <span>•</span>
                                            <span>{res.city || res.location}</span>
                                        </div>
                                        <div className="flex gap-2 items-center mt-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${res.source === 'INTERNAL' ? 'bg-green-500/10 text-green-500' : 'bg-[var(--bg-input)] text-[var(--text-muted)]'}`}>{res.source}</span>
                                            {res.sourceUrl && (
                                                <a href={res.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline block">
                                                    View Original
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setPreviewItem({ item: res, idx })} className="btn-secondary px-3 py-2" title="Preview Data"><Eye size={18} /></button>

                                        <button onClick={() => handleDraftPost(res)} className="btn-secondary px-3 py-2 text-purple-500" title="Draft Post">
                                            <Megaphone size={18} />
                                        </button>

                                        {importedIds.has(idx) ? (
                                            <button disabled className="bg-green-500/10 text-green-500 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 cursor-default">
                                                <CheckCircle size={18} /> Imported
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleImport(res, idx)}
                                                className="btn-primary text-sm flex items-center gap-2"
                                            >
                                                <Download size={18} /> Import
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {debugMode && (
                                    <div className="mt-2 bg-[#0B0D10] rounded p-4 text-[10px] font-mono text-green-400 overflow-x-auto border border-gray-800">
                                        <pre>{JSON.stringify(res, null, 2)}</pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    results.length === 0 && !loading && !errorMsg && (
                        <div className="text-center py-20 text-[var(--text-muted)]">
                            <SearchIcon size={48} className="mx-auto mb-4 opacity-20" />
                            <p>{mode === 'GLOBAL' ? "Enter parameters to start global search" : "Paste a URL to extract data"}</p>
                        </div>
                    )
                )}
            </div>

            {/* Parsing Preview Modal */}
            {previewItem && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel max-w-lg w-full p-6 animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-[var(--text-primary)]">Extracted Data Preview</h3>
                            <button onClick={() => setPreviewItem(null)}><ArrowRight size={20} className="rotate-180 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Title</label>
                                <input className="input" value={previewItem.item.title || ''} onChange={e => setPreviewItem({ ...previewItem, item: { ...previewItem.item, title: e.target.value } })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Price</label>
                                    <input
                                        className="input"
                                        type="number"
                                        value={
                                            previewItem.item.price
                                                ? (typeof previewItem.item.price === 'object'
                                                    ? (previewItem.item.price as any).amount
                                                    : previewItem.item.price)
                                                : 0
                                        }
                                        onChange={e => {
                                            const amount = +e.target.value;
                                            const currentPrice = previewItem.item.price;
                                            const currency = (currentPrice && typeof currentPrice === 'object') ? currentPrice.currency : 'USD';
                                            setPreviewItem({
                                                ...previewItem,
                                                item: {
                                                    ...previewItem.item,
                                                    price: { amount, currency: currency as any }
                                                }
                                            });
                                        }}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Year</label>
                                    <input className="input" type="number" value={previewItem.item.year || 0} onChange={e => setPreviewItem({ ...previewItem, item: { ...previewItem.item, year: +e.target.value } })} />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1 block">Description</label>
                                <textarea className="textarea h-24" value={previewItem.item.description || ''} onChange={e => setPreviewItem({ ...previewItem, item: { ...previewItem.item, description: e.target.value } })} />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-2">
                            <button onClick={() => setPreviewItem(null)} className="btn-ghost">Cancel</button>
                            <button onClick={() => handleImport(previewItem.item, previewItem.idx)} className="btn-primary text-sm">Confirm Import</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
