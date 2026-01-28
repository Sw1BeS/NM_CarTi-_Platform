
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { InventoryService } from '../../services/inventoryService';
import { Bot, MiniAppConfig, CarListing } from '../../types';
import { getPublicBots, getShowcaseInventory } from '../../services/publicApi';
import {
    Search, LayoutGrid, User, Plus, Filter, ArrowRight, DollarSign,
    MessageSquare, Zap, List as ListIcon, Star, Phone, Home,
    ChevronRight, MapPin, Calendar, CheckCircle, AlertTriangle, SlidersHorizontal,
    X, ChevronLeft, ChevronRight as ChevronRightIcon, Image as ImageIcon, History, ShieldCheck, LogOut
} from 'lucide-react';

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=1000';

type InventoryTab = 'IN_STOCK' | 'IN_TRANSIT';

export const MiniApp = () => {
    const { slug } = useParams();
    const [activeBot, setActiveBot] = useState<Bot | null>(null);
    const [config, setConfig] = useState<MiniAppConfig | null>(null);
    const [view, setView] = useState<'HOME' | 'INVENTORY' | 'REQUEST' | 'PROFILE'>('HOME');
    const [tgUser, setTgUser] = useState<any>(null);
    const [isPreview, setIsPreview] = useState(false);

    // Inventory State
    const [cars, setCars] = useState<CarListing[]>([]);
    const [tab, setTab] = useState<InventoryTab>('IN_STOCK');
    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState({
        brand: '',
        minYear: '',
        maxYear: '',
        minPrice: '',
        maxPrice: ''
    });
    const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'year_desc'>('year_desc');

    // Gallery State
    const [lightboxCar, setLightboxCar] = useState<CarListing | null>(null);
    const [lightboxImageIndex, setLightboxImageIndex] = useState(0);

    // Request Form State
    const [reqStep, setReqStep] = useState(1);
    const [reqData, setReqData] = useState({ brand: '', budget: '', year: '' });

    useEffect(() => {
        const load = async () => {
            // 1. Initialize Telegram Web App
            const tg = (window as any).Telegram?.WebApp;

            if (tg && tg.initData) {
                tg.ready();
                tg.expand();
                tg.enableClosingConfirmation();
                setTgUser(tg.initDataUnsafe?.user);
                setIsPreview(false);
            } else {
                // Mock environment for browser preview
                setIsPreview(true);
                setTgUser({ first_name: 'Guest', username: 'guest_user', id: 12345, photo_url: '' });
            }

            // 2. Load Bot Configuration
            const bots = await getPublicBots();
            const bot = bots.find(b => b.active) || bots[0];
            if (bot) {
                setActiveBot(bot);
                setConfig(bot.miniAppConfig || null);
            }

            // 3. Load Data
            try {
                // Use URL slug or fallback to 'system'
                const targetSlug = slug || 'system';
                // Try Showcase API first
                try {
                    const res = await getShowcaseInventory(targetSlug);
                    setCars(res.items);
                } catch (e) {
                    // Fallback to legacy public inventory if showcase not found
                    console.warn("Showcase not found, falling back to legacy", e);
                    const res = await import('../../services/publicApi').then(m => m.getPublicInventory(targetSlug));
                    setCars(res.items);
                }
            } catch (e) {
                console.error("Failed to load inventory for Mini App", e);
            }
        };
        load();
    }, [slug]);

    if (!config) return <div className="h-screen flex items-center justify-center text-white bg-black">Loading App...</div>;

    const primaryColor = config.primaryColor || '#D4AF37';

    const handleAction = (act: any) => {
        const tg = (window as any).Telegram?.WebApp;
        if (act.actionType === 'VIEW') {
            if (act.value === 'INVENTORY') setView('INVENTORY');
            if (act.value === 'REQUEST') setView('REQUEST');
        } else if (act.actionType === 'LINK') {
            if (tg && tg.openLink) {
                tg.openLink(act.value);
            } else {
                window.open(act.value, '_blank');
            }
        } else if (act.actionType === 'SCENARIO') {
            if (tg?.initData) {
                tg.sendData(JSON.stringify({ type: 'RUN_SCENARIO', scenarioId: act.value }));
                tg.close();
            } else {
                alert(`[PREVIEW] Trigger Scenario: ${act.value}\n(In real app, this closes Mini App and sends data to bot)`);
            }
        }
    };

    const sendLeadPayload = (payload: any) => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg && tg.initData) {
            tg.sendData(JSON.stringify(payload));
            tg.close();
        } else {
            alert('[PREVIEW] Lead sent:\n' + JSON.stringify(payload, null, 2));
        }
    };

    const detectLang = () => {
        const tg = (window as any).Telegram?.WebApp;
        const raw = tg?.initDataUnsafe?.user?.language_code?.toUpperCase() || 'EN';
        if (raw.startsWith('UK') || raw.startsWith('UA')) return 'UK';
        if (raw.startsWith('RU')) return 'RU';
        return 'EN';
    };

    const handleCarInterest = (car: CarListing) => {
        const tg = (window as any).Telegram?.WebApp;

        const titleParts = (car.title || '').split(' ');
        const payload = {
            v: 1,
            type: 'interest_click',
            carId: car.canonicalId,
            meta: {
                userId: tgUser?.id,
                name: tgUser?.first_name,
                username: tgUser?.username,
                lang: detectLang()
            }
        };

        sendLeadPayload(payload);
    };

    // Refetch when filters change
    useEffect(() => {
        const fetchCars = async () => {
            try {
                // Determine source filter based on tab if supported by backend,
                // otherwise client-side filtering is fine for small datasets.
                // For this release, we'll fetch all and filter locally for tab, but send search/range to API.
                // Note: The public API we built only returns 'AVAILABLE' cars.
                // If we need 'IN_TRANSIT' or specific sources, we might need to adjust API or client filter.
                // Assuming Public API returns all 'AVAILABLE' for the company.

                const apiFilters = {
                    search,
                    minYear: filters.minYear,
                    maxYear: filters.maxYear,
                    minPrice: filters.minPrice,
                    maxPrice: filters.maxPrice
                };

                const targetSlug = slug || 'system';
                try {
                    const res = await getShowcaseInventory(targetSlug, apiFilters);
                    setCars(res.items);
                } catch (e) {
                     const res = await import('../../services/publicApi').then(m => m.getPublicInventory(targetSlug, apiFilters));
                     setCars(res.items);
                }
            } catch (e) {
                console.error("Fetch inventory failed", e);
            }
        };
        const debounce = setTimeout(fetchCars, 500);
        return () => clearTimeout(debounce);
    }, [search, filters, tab]); // Re-fetch on filter change

    const applyFiltersAndSort = () => {
        let filtered = cars;

        // Client-side Sort
        if (sortBy === 'price_asc') {
            filtered.sort((a, b) => a.price.amount - b.price.amount);
        } else if (sortBy === 'price_desc') {
            filtered.sort((a, b) => b.price.amount - a.price.amount);
        } else if (sortBy === 'year_desc') {
            filtered.sort((a, b) => b.year - a.year);
        }

        return filtered;
    };

    const renderHome = () => (
        <div className="animate-fade-in pb-24">
            {/* Header */}
            <div className="pt-8 pb-8 px-6 rounded-b-[40px] shadow-lg relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primaryColor}30 0%, #000000 100%)` }}>
                <div className="relative z-10">
                    <h1 className="text-2xl font-bold text-white mb-1">{config.title}</h1>
                    <p className="text-white/70 text-sm">{config.welcomeText}</p>

                    {tgUser && (
                        <div className="mt-6 flex items-center gap-3 bg-white/10 p-2.5 rounded-xl backdrop-blur-md border border-white/5 shadow-inner">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 to-yellow-600 flex items-center justify-center text-black font-bold text-sm shadow-md overflow-hidden">
                                {tgUser.photo_url ? <img src={tgUser.photo_url} className="w-full h-full object-cover" /> : tgUser.first_name?.[0]}
                            </div>
                            <div className="text-xs">
                                <p className="text-white font-bold text-sm">Hello, {tgUser.first_name}</p>
                                <p className="text-white/50">CarTié Member</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="px-4 -mt-6 relative z-20">
                <div className="bg-[#1c1c1e] rounded-2xl p-4 shadow-2xl border border-white/5">
                    <div className={`grid gap-3 ${config.layout === 'GRID' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {config.actions.map(act => (
                            <button
                                key={act.id}
                                onClick={() => handleAction(act)}
                                className="bg-[#2c2c2e] hover:bg-[#3a3a3c] transition-colors p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-center group active:scale-95 duration-100 border border-transparent hover:border-white/5"
                            >
                                <div className="w-12 h-12 rounded-full bg-black/30 flex items-center justify-center shadow-inner" style={{ color: primaryColor }}>
                                    <AppIcon name={act.icon} />
                                </div>
                                <span className="text-sm font-medium text-white">{act.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Recent Inventory */}
            <div className="px-4 mt-8">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-white text-lg">New Arrivals</h3>
                    <button onClick={() => setView('INVENTORY')} className="text-xs font-bold" style={{ color: primaryColor }}>View All</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
                    {cars.slice(0, 5).map(car => (
                        <div key={car.canonicalId} className="min-w-[220px] bg-[#1c1c1e] rounded-xl overflow-hidden border border-white/5 shadow-lg">
                            <div className="h-32 bg-gray-800 relative cursor-pointer" onClick={() => { setLightboxCar(car); setLightboxImageIndex(0); }}>
                                {car.thumbnail ? (
                                    <img src={car.thumbnail} className="w-full h-full object-cover opacity-90" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-[#2c2c2e] text-white/20">
                                        <ImageIcon size={32} />
                                    </div>
                                )}
                                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white">
                                    {car.year}
                                </div>
                            </div>
                            <div className="p-3">
                                <h4 className="text-sm font-bold text-white truncate">{car.title}</h4>
                                <p className="text-xs text-white/50 mt-1 mb-2">{car.specs?.engine} • {car.mileage / 1000}k km</p>
                                <div className="font-bold text-sm" style={{ color: primaryColor }}>
                                    {car.price.amount.toLocaleString()} $
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderInventory = () => {
        const filteredCars = applyFiltersAndSort();

        return (
            <div className="animate-fade-in pb-24 h-full flex flex-col bg-black">
                <div className="p-4 sticky top-0 bg-[#000000]/90 backdrop-blur-md z-20 border-b border-white/10 space-y-3">
                    <h2 className="text-xl font-bold text-white">Inventory</h2>

                    {/* Tabs */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setTab('IN_STOCK')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${tab === 'IN_STOCK'
                                ? 'text-black shadow-lg'
                                : 'bg-[#1c1c1e] text-white/50'
                                }`}
                            style={tab === 'IN_STOCK' ? { backgroundColor: primaryColor } : {}}
                        >
                            ✅ В наявності
                        </button>
                        <button
                            onClick={() => setTab('IN_TRANSIT')}
                            className={`flex-1 py-2.5 px-4 rounded-lg font-bold text-sm transition-all ${tab === 'IN_TRANSIT'
                                ? 'text-black shadow-lg'
                                : 'bg-[#1c1c1e] text-white/50'
                                }`}
                            style={tab === 'IN_TRANSIT' ? { backgroundColor: primaryColor } : {}}
                        >
                            📦 В дорозі
                        </button>
                    </div>

                    {/* Search + Filter Button */}
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                            <input
                                className="w-full bg-[#1c1c1e] text-white pl-10 pr-4 py-3 rounded-xl outline-none placeholder-gray-600 border border-white/5 focus:border-yellow-500/50 transition-colors"
                                placeholder="Search cars..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${showFilters ? 'text-black' : 'bg-[#1c1c1e] text-white'
                                }`}
                            style={showFilters ? { backgroundColor: primaryColor } : {}}
                        >
                            <SlidersHorizontal size={20} />
                        </button>
                    </div>

                    {/* Advanced Filters */}
                    {showFilters && (
                        <div className="bg-[#1c1c1e] rounded-xl p-4 space-y-3 border border-white/5 animate-slide-down">
                            <div>
                                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Brand</label>
                                <input
                                    className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                    placeholder="BMW, Mercedes..."
                                    value={filters.brand}
                                    onChange={e => setFilters({ ...filters, brand: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Min Year</label>
                                    <input
                                        type="number"
                                        className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                        placeholder="2018"
                                        value={filters.minYear}
                                        onChange={e => setFilters({ ...filters, minYear: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Max Year</label>
                                    <input
                                        type="number"
                                        className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                        placeholder="2024"
                                        value={filters.maxYear}
                                        onChange={e => setFilters({ ...filters, maxYear: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Min Price ($)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                        placeholder="10000"
                                        value={filters.minPrice}
                                        onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Max Price ($)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                        placeholder="100000"
                                        value={filters.maxPrice}
                                        onChange={e => setFilters({ ...filters, maxPrice: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Sort By</label>
                                <select
                                    className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value as any)}
                                >
                                    <option value="year_desc">Newest First</option>
                                    <option value="price_asc">Price: Low to High</option>
                                    <option value="price_desc">Price: High to Low</option>
                                </select>
                            </div>
                            <button
                                onClick={() => {
                                    setFilters({ brand: '', minYear: '', maxYear: '', minPrice: '', maxPrice: '' });
                                    setSearch('');
                                }}
                                className="w-full py-2 bg-red-500/20 text-red-500 rounded-lg text-xs font-bold"
                            >
                                Reset Filters
                            </button>
                        </div>
                    )}

                    <div className="text-[10px] text-white/50">
                        {filteredCars.length} cars found
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {filteredCars.map(car => (
                        <div key={car.canonicalId} className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-white/5 flex flex-col shadow-lg">
                            <div className="h-48 bg-gray-800 relative cursor-pointer" onClick={() => { setLightboxCar(car); setLightboxImageIndex(0); }}>
                                {car.thumbnail ? (
                                    <img src={car.thumbnail} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-[#2c2c2e] text-white/20">
                                        <ImageIcon size={48} />
                                    </div>
                                )}
                                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
                                    <h3 className="text-lg font-bold text-white">{car.title}</h3>
                                </div>
                                {car.mediaUrls && car.mediaUrls.length > 1 && (
                                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white">
                                        +{car.mediaUrls.length - 1} photos
                                    </div>
                                )}
                            </div>
                            <div className="p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="text-xl font-bold" style={{ color: primaryColor }}>{car.price.amount.toLocaleString()} $</div>
                                    <div className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded">{car.year}</div>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs text-white/70 mb-4">
                                    <div className="bg-black/30 p-2 rounded text-center border border-white/5">{car.specs?.engine || 'N/A'}</div>
                                    <div className="bg-black/30 p-2 rounded text-center border border-white/5">{car.mileage.toLocaleString()} km</div>
                                    <div className="bg-black/30 p-2 rounded text-center border border-white/5">{car.specs?.fuel || 'N/A'}</div>
                                </div>
                                <button
                                    onClick={() => handleCarInterest(car)}
                                    className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    <MessageSquare size={18} /> Запросить просчет
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredCars.length === 0 && <div className="text-center text-white/50 mt-10">No cars found. Try adjusting filters.</div>}
                </div>
            </div>
        );
    };

    const handleNextStep = async () => {
        if (reqStep === 1) {
            setReqStep(2);
        } else {
            const tg = (window as any).Telegram?.WebApp;

            const reqParts = (reqData.brand || '').split(' ');
            const payload = {
                v: 1,
                type: 'lead_submit',
                fields: {
                    name: tgUser?.first_name || 'User',
                    brand: reqParts[0] || reqData.brand,
                    model: reqParts.slice(1).join(' ').trim(),
                    budget: Number(reqData.budget),
                    year: Number(reqData.year),
                    lang: detectLang()
                },
                meta: {
                    userId: tgUser?.id,
                    username: tgUser?.username
                }
            };
            // Use Direct API call for reliability
            try {
                const slug = 'system'; // TODO: Dynamic slug
                const requestPayload = {
                    title: `Request: ${reqData.brand} ${reqData.year}+`,
                    description: `Budget: ${reqData.budget}\nUser: ${tgUser?.first_name} @${tgUser?.username}`,
                    budgetMax: Number(reqData.budget),
                    yearMin: Number(reqData.year),
                    status: 'NEW',
                    type: 'BUY',
                    initData: tg?.initData
                };

                await import('../../services/publicApi').then(m => m.createPublicRequestWithSlug(slug, requestPayload as any));

                if (tg && tg.initData) {
                    // Also close/notify telegram
                    tg.close();
                } else {
                    setReqStep(3);
                }
            } catch (e) {
                console.error(e);
                alert("Failed to submit request.");
            }
        }
    };

    const renderRequest = () => (
        <div className="animate-fade-in pb-24 p-6 min-h-screen flex flex-col justify-center bg-black">
            {reqStep === 3 ? (
                <div className="text-center animate-slide-up">
                    <div className="w-24 h-24 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                        <CheckCircle size={48} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Request Sent!</h2>
                    <p className="text-white/50 mb-8">We have received your request. A manager will check the market and contact you shortly.</p>
                    <button onClick={() => { setReqStep(1); setView('HOME'); }} className="btn-primary w-full py-4 rounded-xl font-bold text-lg" style={{ backgroundColor: primaryColor, color: '#000' }}>
                        Back to Home
                    </button>
                </div>
            ) : (
                <>
                    <h2 className="text-3xl font-bold text-white mb-2">Find Your Car</h2>
                    <p className="text-white/50 mb-8">Tell us what you are looking for.</p>

                    <div className="space-y-6">
                        {reqStep === 1 && (
                            <div className="space-y-5 animate-slide-up">
                                <div>
                                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Brand & Model</label>
                                    <input className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10 focus:border-yellow-500 transition-colors" placeholder="e.g. BMW X5" value={reqData.brand} onChange={e => setReqData({ ...reqData, brand: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Min Year</label>
                                        <input type="number" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="2018" value={reqData.year} onChange={e => setReqData({ ...reqData, year: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Max Budget</label>
                                        <input type="number" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="50000" value={reqData.budget} onChange={e => setReqData({ ...reqData, budget: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {reqStep === 2 && (
                            <div className="space-y-4 animate-slide-up">
                                <div className="bg-[#1c1c1e] p-6 rounded-xl border border-white/10 text-white/80 text-sm space-y-2">
                                    <p className="font-bold text-white mb-4 text-lg border-b border-white/10 pb-2">Summary</p>
                                    <div className="flex justify-between"><span>Vehicle:</span> <span className="font-bold text-white">{reqData.brand}</span></div>
                                    <div className="flex justify-between"><span>Year:</span> <span className="font-bold text-white">{reqData.year}+</span></div>
                                    <div className="flex justify-between"><span>Budget:</span> <span className="font-bold text-white" style={{ color: primaryColor }}>${reqData.budget}</span></div>
                                </div>
                                <p className="text-xs text-white/50 text-center px-4">
                                    By submitting, you agree to be contacted by our concierge team via this chat.
                                </p>
                            </div>
                        )}

                        <div className="pt-4">
                            <button
                                onClick={handleNextStep}
                                disabled={reqStep === 1 && !reqData.brand}
                                className="w-full py-4 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg"
                                style={{ backgroundColor: primaryColor }}
                            >
                                {reqStep === 1 ? 'Continue' : 'Submit Request'} <ArrowRight size={18} />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );

    const renderProfile = () => (
        <div className="animate-fade-in pb-24 h-full bg-black">
            <div className="p-6 pt-10 rounded-b-[40px] shadow-lg relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${primaryColor}20 0%, #000000 100%)` }}>
                <div className="flex flex-col items-center">
                    <div className="w-24 h-24 rounded-full border-4 border-white/10 shadow-2xl bg-[#1c1c1e] flex items-center justify-center overflow-hidden mb-4 relative">
                        {tgUser?.photo_url ? (
                            <img src={tgUser.photo_url} className="w-full h-full object-cover" />
                        ) : (
                            <User size={40} className="text-white/50" />
                        )}
                        <div className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 rounded-full border-2 border-black"></div>
                    </div>
                    <h2 className="text-2xl font-bold text-white">{tgUser?.first_name} {tgUser?.last_name}</h2>
                    <p className="text-white/50 text-sm mb-4">@{tgUser?.username || 'user'}</p>

                    <div className="flex gap-2">
                        <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 text-[10px] text-white font-bold flex items-center gap-1">
                            <ShieldCheck size={12} className="text-green-500"/> Verified Client
                        </span>
                        <span className="px-3 py-1 rounded-full bg-white/10 border border-white/5 text-[10px] text-white font-bold">
                            ID: {tgUser?.id}
                        </span>
                    </div>
                </div>
            </div>

            <div className="px-4 mt-6 space-y-4">
                <div className="bg-[#1c1c1e] rounded-xl p-4 border border-white/5">
                    <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                        <History size={16} style={{ color: primaryColor }}/> Recent Activity
                    </h3>

                    {/* Mock Activity Data */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                <Search size={18} />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs text-white/50 mb-0.5">Today, 10:23</div>
                                <div className="text-sm font-medium text-white">Search: "BMW X5 2020"</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                                <MessageSquare size={18} />
                            </div>
                            <div className="flex-1">
                                <div className="text-xs text-white/50 mb-0.5">Yesterday, 14:45</div>
                                <div className="text-sm font-medium text-white">Chat started with Manager</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-[#1c1c1e] rounded-xl p-4 border border-white/5">
                    <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                        <Star size={16} style={{ color: primaryColor }}/> Saved Vehicles
                    </h3>
                    <div className="text-center py-6 text-white/30 text-xs">
                        No saved vehicles yet.
                    </div>
                </div>

                <button onClick={() => (window as any).Telegram?.WebApp?.close()} className="w-full py-4 rounded-xl bg-red-500/10 text-red-500 font-bold flex items-center justify-center gap-2 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                    <LogOut size={18} /> Close App
                </button>
            </div>
        </div>
    );

    const AppIcon = ({ name }: { name: string }) => {
        const props = { size: 24 };
        switch (name) {
            case 'Search': return <Search {...props} />;
            case 'Zap': return <Zap {...props} />;
            case 'DollarSign': return <DollarSign {...props} />;
            case 'MessageCircle': return <MessageSquare {...props} />;
            case 'Grid': return <LayoutGrid {...props} />;
            case 'List': return <ListIcon {...props} />;
            case 'Phone': return <Phone {...props} />;
            default: return <Star {...props} />;
        }
    };

    return (
        <div className="min-h-screen bg-black font-sans text-white max-w-md mx-auto relative shadow-2xl overflow-hidden border-x border-[#1c1c1e]">
            {/* Preview Banner */}
            {isPreview && (
                <div className="bg-orange-500/20 text-orange-400 text-[10px] uppercase font-bold text-center py-1 border-b border-orange-500/30 flex items-center justify-center gap-2">
                    <AlertTriangle size={10} /> Preview Mode (No Telegram Bridge)
                </div>
            )}

            {view === 'HOME' && renderHome()}
            {view === 'INVENTORY' && renderInventory()}
            {view === 'REQUEST' && renderRequest()}
            {view === 'PROFILE' && renderProfile()}

            {/* Gallery Lightbox */}
            {lightboxCar && (
                <div className="fixed inset-0 bg-black z-[100] flex flex-col">
                    <div className="p-4 flex justify-between items-center">
                        <h3 className="text-white font-bold truncate">{lightboxCar.title}</h3>
                        <button onClick={() => setLightboxCar(null)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                            <X size={20} className="text-white" />
                        </button>
                    </div>
                    <div className="flex-1 relative flex items-center justify-center">
                        <img
                            src={(lightboxCar.mediaUrls && lightboxCar.mediaUrls[lightboxImageIndex]) || lightboxCar.thumbnail || PLACEHOLDER_IMAGE}
                            className="max-w-full max-h-full object-contain"
                        />
                        {lightboxCar.mediaUrls && lightboxCar.mediaUrls.length > 1 && (
                            <>
                                {lightboxImageIndex > 0 && (
                                    <button
                                        onClick={() => setLightboxImageIndex(lightboxImageIndex - 1)}
                                        className="absolute left-4 w-12 h-12 bg-black/50 backdrop-blur rounded-full flex items-center justify-center"
                                    >
                                        <ChevronLeft size={24} className="text-white" />
                                    </button>
                                )}
                                {lightboxImageIndex < lightboxCar.mediaUrls.length - 1 && (
                                    <button
                                        onClick={() => setLightboxImageIndex(lightboxImageIndex + 1)}
                                        className="absolute right-4 w-12 h-12 bg-black/50 backdrop-blur rounded-full flex items-center justify-center"
                                    >
                                        <ChevronRightIcon size={24} className="text-white" />
                                    </button>
                                )}
                                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs text-white">
                                    {lightboxImageIndex + 1} / {lightboxCar.mediaUrls.length}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom Navigation */}
            <div className="h-20 bg-[#1c1c1e]/90 backdrop-blur-md border-t border-white/5 fixed bottom-0 w-full max-w-md flex items-center justify-around z-50 pb-4 shadow-lg">
                <button onClick={() => setView('HOME')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'HOME' ? 'text-white' : 'text-white/40'}`}>
                    <Home size={22} className={view === 'HOME' ? 'fill-current' : ''} style={view === 'HOME' ? { color: primaryColor } : {}} />
                    <span className="text-[10px] font-medium">Home</span>
                </button>
                <button onClick={() => setView('INVENTORY')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'INVENTORY' ? 'text-white' : 'text-white/40'}`}>
                    <LayoutGrid size={22} className={view === 'INVENTORY' ? 'fill-current' : ''} style={view === 'INVENTORY' ? { color: primaryColor } : {}} />
                    <span className="text-[10px] font-medium">Stock</span>
                </button>
                <button onClick={() => setView('REQUEST')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'REQUEST' ? 'text-white' : 'text-white/40'}`}>
                    <Search size={22} className="stroke-[3px]" style={view === 'REQUEST' ? { color: primaryColor } : {}} />
                    <span className="text-[10px] font-medium">Find</span>
                </button>
                <button onClick={() => setView('PROFILE')} className={`flex flex-col items-center gap-1 transition-colors ${view === 'PROFILE' ? 'text-white' : 'text-white/40'}`}>
                    <User size={22} className={view === 'PROFILE' ? 'fill-current' : ''} style={view === 'PROFILE' ? { color: primaryColor } : {}} />
                    <span className="text-[10px] font-medium">Profile</span>
                </button>
            </div>
        </div>
    );
};
