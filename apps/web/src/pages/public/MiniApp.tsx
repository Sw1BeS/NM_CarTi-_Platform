
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, MiniAppConfig, CarListing } from '../../types';
import { getPublicBots, getShowcaseInventory } from '../../services/publicApi';
import { createMiniAppRequest, getMiniAppFavorites, getMiniAppRequestStatus, toggleMiniAppFavorite, type MiniAppTrackingMeta } from '../../services/miniappApi';
import {
    Search, LayoutGrid, User, Plus, Filter, ArrowRight, DollarSign,
    MessageSquare, Zap, List as ListIcon, Star, Phone, Home, Heart, ClipboardList,
    ChevronRight, MapPin, Calendar, CheckCircle, AlertTriangle, SlidersHorizontal,
    X, ChevronLeft, ChevronRight as ChevronRightIcon, Image as ImageIcon, History, ShieldCheck, LogOut
} from 'lucide-react';

const PLACEHOLDER_IMAGE = 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=1000';

type InventoryTab = 'IN_STOCK' | 'IN_TRANSIT';
type TgUser = {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    language_code?: string;
};

export const MiniApp = () => {
    const { slug } = useParams();
    const [activeBot, setActiveBot] = useState<Bot | null>(null);
    const [config, setConfig] = useState<MiniAppConfig | null>(null);
    const [view, setView] = useState<'HOME' | 'INVENTORY' | 'LISTING' | 'FAVORITES' | 'REQUEST' | 'STATUS' | 'PROFILE'>('HOME');
    const [lastListingView, setLastListingView] = useState<'HOME' | 'INVENTORY' | 'FAVORITES'>('INVENTORY');
    const [selectedCar, setSelectedCar] = useState<CarListing | null>(null);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [favoriteItems, setFavoriteItems] = useState<CarListing[]>([]);
    const [tgUser, setTgUser] = useState<TgUser | null>(null);
    const [isPreview, setIsPreview] = useState(false);
    const [visitorId] = useState(() => {
        try {
            const existing = localStorage.getItem('miniapp_visitor_id');
            if (existing) return existing;
            const generated = window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `v_${Date.now()}_${Math.random().toString(16).slice(2)}`;
            localStorage.setItem('miniapp_visitor_id', generated);
            return generated;
        } catch {
            return `v_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        }
    });

    // Inventory State
    const [cars, setCars] = useState<CarListing[]>([]);
    const [targetSlug, setTargetSlug] = useState<string>('system');
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
    const [reqPhone, setReqPhone] = useState('');
    const [statusQuery, setStatusQuery] = useState({ publicId: '', phone: '' });
    const [statusResult, setStatusResult] = useState<any>(null);
    const [trackingMeta, setTrackingMeta] = useState<MiniAppTrackingMeta>({});
    const [reqComment, setReqComment] = useState('');

    const getCarImages = (car: CarListing) => {
        const itemUrls = (car.mediaItems || [])
            .map(item => item.url || item.previewUrl)
            .filter(Boolean) as string[];
        const baseUrls = itemUrls.length ? itemUrls : (car.mediaUrls || []);
        const combined = car.thumbnail ? [car.thumbnail, ...baseUrls] : baseUrls;
        return Array.from(new Set(combined.filter(Boolean)));
    };

    const getCarId = (car?: CarListing | null) => car?.canonicalId || car?.id || '';

    const isFavorite = (carId: string) => favorites.includes(carId);

    const loadFavorites = async (slug: string, identity: { tgUserId?: string; visitorId?: string }) => {
        try {
            const res = await getMiniAppFavorites({ slug, ...identity });
            setFavorites(res.ids || []);
            setFavoriteItems(res.items || []);
        } catch (e) {
            console.error('Failed to load favorites', e);
        }
    };

    const toggleFavorite = async (car: CarListing) => {
        const id = getCarId(car);
        if (!id) return;
        const identity = {
            tgUserId: tgUser?.id ? String(tgUser.id) : undefined,
            visitorId
        };
        try {
            const res = await toggleMiniAppFavorite(id, { ...identity, slug: targetSlug || 'system' });
            if (res.action === 'removed') {
                setFavorites(prev => prev.filter(x => x !== id));
                setFavoriteItems(prev => prev.filter(item => getCarId(item) !== id));
            } else {
                setFavorites(prev => (prev.includes(id) ? prev : [...prev, id]));
                setFavoriteItems(prev => {
                    const exists = prev.some(item => getCarId(item) === id);
                    return exists ? prev : [car, ...prev];
                });
            }
        } catch (e) {
            console.error('Failed to toggle favorite', e);
        }
    };

    const openListing = (car: CarListing) => {
        const origin = view === 'HOME' || view === 'FAVORITES' || view === 'INVENTORY' ? view : 'INVENTORY';
        setLastListingView(origin);
        setSelectedCar(car);
        setView('LISTING');
    };

    const prefillRequestFromCar = (car: CarListing) => {
        setReqData({
            brand: car.title || '',
            budget: String(car.price?.amount || ''),
            year: String(car.year || '')
        });
        setReqComment('');
        setReqStep(1);
        setView('REQUEST');
    };

    const buildFallbackConfig = (target: string): MiniAppConfig => ({
        title: 'CarTié',
        welcomeText: 'Browse our live inventory',
        layout: 'GRID',
        primaryColor: '#D4AF37',
        accentColor: '#111',
        actions: [
            { id: 'a_inv', label: 'Inventory', actionType: 'VIEW', value: 'INVENTORY', icon: 'LayoutGrid' },
            { id: 'a_fav', label: 'Favorites', actionType: 'VIEW', value: 'FAVORITES', icon: 'Heart' },
            { id: 'a_req', label: 'Request', actionType: 'VIEW', value: 'REQUEST', icon: 'MessageSquare' },
            { id: 'a_status', label: 'Status', actionType: 'VIEW', value: 'STATUS', icon: 'ClipboardList' }
        ],
        navItems: [
            { id: 'nav_home', label: 'Home', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
            { id: 'nav_stock', label: 'Stock', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
            { id: 'nav_saved', label: 'Saved', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
            { id: 'nav_request', label: 'Request', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
            { id: 'nav_status', label: 'Status', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
        ],
        homeBlocks: [],
        showcaseSlug: target
    });

    const meta = import.meta as { env?: { VITE_BUILD_ID?: string; MODE?: string } };
    const buildVersion = meta.env?.VITE_BUILD_ID || meta.env?.MODE || 'dev';

    useEffect(() => {
        const load = async () => {
            // 1. Initialize Telegram Web App & Extract start_param
            const tg = (window as any).Telegram?.WebApp;
            let startParam = '';

            let resolvedUser: TgUser | null = null;
            if (tg && tg.initData) {
                tg.ready();
                tg.expand();
                tg.enableClosingConfirmation();
                resolvedUser = tg.initDataUnsafe?.user;
                setTgUser(resolvedUser);
                setIsPreview(false);
                startParam = tg.initDataUnsafe?.start_param;
            } else {
                // Mock environment for browser preview
                setIsPreview(true);
                resolvedUser = { first_name: 'Guest', username: 'guest_user', id: 12345, photo_url: '' };
                setTgUser(resolvedUser);
                // Check URL params for start_param simulation
                const urlParams = new URLSearchParams(window.location.search);
                startParam = urlParams.get('tgWebAppStartParam') || urlParams.get('start_param') || '';
            }

            const urlParams = new URLSearchParams(window.location.search);
            const utm = {
                source: urlParams.get('utm_source') || undefined,
                medium: urlParams.get('utm_medium') || undefined,
                campaign: urlParams.get('utm_campaign') || undefined,
                content: urlParams.get('utm_content') || undefined,
                term: urlParams.get('utm_term') || undefined
            };
            const ref = urlParams.get('ref') || urlParams.get('source') || undefined;
            setTrackingMeta({
                startParam: startParam || undefined,
                utm,
                ref,
                entrypoint: window.location.pathname,
                referrer: document.referrer || undefined,
                miniappVersion: buildVersion,
                buildSha: buildVersion
            });

            // 2. Determine Target Slug (priority: URL slug > start_param > system)
            const resolvedSlug = slug || startParam || 'system';
            setTargetSlug(resolvedSlug);
            await loadFavorites(resolvedSlug, {
                tgUserId: resolvedUser?.id ? String(resolvedUser.id) : undefined,
                visitorId
            });

            // 3. Load Bot Configuration matched by showcase slug
            const bots = await getPublicBots();
            const matchedBot = bots.find(b => (b.defaultShowcaseSlug || '').toLowerCase() === resolvedSlug.toLowerCase());
            const fallbackBot = bots.find(b => b.active) || bots[0];
            const bot = matchedBot || fallbackBot || null;
            if (bot) {
                setActiveBot(bot);
                setConfig(bot.miniAppConfig || buildFallbackConfig(resolvedSlug));
            } else {
                // No bot configured; still render with fallback to avoid blank screen
                setConfig(buildFallbackConfig(resolvedSlug));
            }

            // 4. Load Data
            try {
                // Try Showcase API first
                try {
                    const res = await getShowcaseInventory(resolvedSlug);
                    setCars(res.items);
                } catch (e) {
                    // Fallback to legacy public inventory if showcase not found
                    console.warn(`Showcase '${resolvedSlug}' not found, falling back to legacy`, e);
                    const res = await import('../../services/publicApi').then(m => m.getPublicInventory(resolvedSlug));
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
    const navItems = (config.navItems && config.navItems.length > 0)
        ? config.navItems
        : [
            { id: 'nav_home', label: 'Home', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
            { id: 'nav_stock', label: 'Stock', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
            { id: 'nav_saved', label: 'Saved', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
            { id: 'nav_request', label: 'Request', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
            { id: 'nav_status', label: 'Status', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
        ];

    const handleAction = (act: MiniAppConfig['actions'][number]) => {
        const tg = (window as any).Telegram?.WebApp;
        if (act.actionType === 'VIEW') {
            if (act.value === 'HOME') setView('HOME');
            if (act.value === 'INVENTORY') setView('INVENTORY');
            if (act.value === 'REQUEST') setView('REQUEST');
            if (act.value === 'FAVORITES') setView('FAVORITES');
            if (act.value === 'STATUS') setView('STATUS');
            if (act.value === 'PROFILE') setView('PROFILE');
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

    const sendLeadPayload = (payload: Record<string, unknown>) => {
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
                startParam: trackingMeta.startParam,
                utm: trackingMeta.utm,
                ref: trackingMeta.ref,
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

                const target = targetSlug || 'system';
                try {
                    const res = await getShowcaseInventory(target, apiFilters);
                    setCars(res.items);
                } catch (e) {
                    const res = await import('../../services/publicApi').then(m => m.getPublicInventory(target, apiFilters));
                    setCars(res.items);
                }
            } catch (e) {
                console.error("Fetch inventory failed", e);
            }
        };
        const debounce = setTimeout(fetchCars, 500);
        return () => clearTimeout(debounce);
    }, [search, filters, tab, targetSlug]); // Re-fetch on filter change

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
                    <div className="flex items-center gap-3 mb-2">
                        {config.logoUrl && (
                            <img src={config.logoUrl} className="w-10 h-10 rounded-xl object-cover border border-white/20 bg-white/10" />
                        )}
                        <h1 className="text-2xl font-bold text-white">{config.title}</h1>
                    </div>
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
                        {(config.actions || []).map(act => (
                            <button
                                key={act.id}
                                onClick={() => handleAction(act)}
                                className="bg-[#2c2c2e] hover:bg-[#3a3a3c] transition-colors p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-center group active:scale-95 duration-100 border border-transparent hover:border-white/5"
                            >
                                <div className="w-12 h-12 rounded-full bg-black/30 flex items-center justify-center shadow-inner" style={{ color: primaryColor }}>
                                    {renderIcon(act.icon, 24)}
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
                    {cars.slice(0, 5).map(car => {
                        const images = getCarImages(car);
                        const cover = images[0];

                        return (
                            <div key={car.canonicalId} className="min-w-[220px] bg-[#1c1c1e] rounded-xl overflow-hidden border border-white/5 shadow-lg">
                                <div className="h-32 bg-gray-800 relative cursor-pointer" onClick={() => { setLightboxCar(car); setLightboxImageIndex(0); }}>
                                    {cover ? (
                                        <img src={cover} className="w-full h-full object-cover opacity-90" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-[#2c2c2e] text-white/20">
                                            <ImageIcon size={32} />
                                        </div>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(car); }}
                                        className="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center"
                                    >
                                        <Heart size={14} className={isFavorite(getCarId(car)) ? 'text-red-400 fill-red-400' : 'text-white/70'} />
                                    </button>
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
                                    <button
                                        onClick={() => openListing(car)}
                                        className="mt-2 w-full text-xs py-2 rounded-lg bg-white/5 text-white/80"
                                    >
                                        View Details
                                    </button>
                                </div>
                            </div>
                        );
                    })}
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
                    {filteredCars.map(car => {
                        const images = getCarImages(car);
                        const cover = images[0];

                        return (
                            <div key={car.canonicalId} className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-white/5 flex flex-col shadow-lg">
                                <div className="h-48 bg-gray-800 relative cursor-pointer" onClick={() => { setLightboxCar(car); setLightboxImageIndex(0); }}>
                                    {cover ? (
                                        <img src={cover} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-[#2c2c2e] text-white/20">
                                            <ImageIcon size={48} />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-12">
                                        <h3 className="text-lg font-bold text-white">{car.title}</h3>
                                    </div>
                                    {images.length > 1 && (
                                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white">
                                            +{images.length - 1} photos
                                        </div>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(car); }}
                                        className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center"
                                    >
                                        <Heart size={16} className={isFavorite(getCarId(car)) ? 'text-red-400 fill-red-400' : 'text-white/70'} />
                                    </button>
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
                                    <button
                                        onClick={() => openListing(car)}
                                        className="w-full mt-2 py-2 rounded-xl font-bold text-white/70 border border-white/10"
                                    >
                                        View Details
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {filteredCars.length === 0 && <div className="text-center text-white/50 mt-10">No cars found. Try adjusting filters.</div>}
                </div>
            </div>
        );
    };

    const renderFavorites = () => {
        const favCars = favoriteItems.length
            ? favoriteItems
            : cars.filter(car => favorites.includes(getCarId(car)));

        return (
            <div className="animate-fade-in pb-24 h-full flex flex-col bg-black">
                <div className="p-4 sticky top-0 bg-[#000000]/90 backdrop-blur-md z-20 border-b border-white/10">
                    <h2 className="text-xl font-bold text-white">Favorites</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {favCars.map(car => {
                        const images = getCarImages(car);
                        const cover = images[0];
                        return (
                            <div key={car.canonicalId} className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-white/5 flex flex-col shadow-lg">
                                <div className="h-40 bg-gray-800 relative cursor-pointer" onClick={() => openListing(car)}>
                                    {cover ? (
                                        <img src={cover} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-[#2c2c2e] text-white/20">
                                            <ImageIcon size={32} />
                                        </div>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(car); }}
                                        className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center"
                                    >
                                        <Heart size={16} className="text-red-400 fill-red-400" />
                                    </button>
                                </div>
                                <div className="p-4">
                                    <h3 className="text-base font-bold text-white truncate">{car.title}</h3>
                                    <div className="text-sm text-white/60 mt-1">{car.year} • {car.mileage.toLocaleString()} km</div>
                                    <div className="mt-2 font-bold" style={{ color: primaryColor }}>
                                        {car.price.amount.toLocaleString()} $
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {favCars.length === 0 && (
                        <div className="text-center text-white/50 mt-12">
                            No favorites yet. Tap the heart on a car to save it.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderListing = () => {
        if (!selectedCar) {
            return (
                <div className="p-6 text-white/60">Select a car to view details.</div>
            );
        }
        const images = getCarImages(selectedCar);
        const cover = images[0];

        return (
            <div className="animate-fade-in pb-24 h-full bg-black">
                <div className="p-4 flex items-center gap-3 border-b border-white/10 bg-[#000000]/90 backdrop-blur-md">
                    <button onClick={() => setView(lastListingView)} className="text-white/70 text-sm">← Back</button>
                    <h2 className="text-white font-bold truncate">{selectedCar.title}</h2>
                </div>
                <div className="p-4 space-y-4">
                    <div className="h-60 bg-gray-800 rounded-2xl overflow-hidden relative cursor-pointer" onClick={() => { setLightboxCar(selectedCar); setLightboxImageIndex(0); }}>
                        {cover ? (
                            <img src={cover} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#2c2c2e] text-white/20">
                                <ImageIcon size={48} />
                            </div>
                        )}
                    </div>
                    {images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto">
                            {images.map((url, idx) => (
                                <img
                                    key={`listing-thumb-${idx}`}
                                    src={url}
                                    className="w-20 h-16 object-cover rounded-lg border border-white/10"
                                    onClick={() => { setLightboxCar(selectedCar); setLightboxImageIndex(idx); }}
                                />
                            ))}
                        </div>
                    )}

                    <div className="bg-[#1c1c1e] rounded-2xl p-4 border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-xl font-bold text-white">{selectedCar.price.amount.toLocaleString()} $</div>
                            <button
                                onClick={() => toggleFavorite(selectedCar)}
                                className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
                            >
                                <Heart size={18} className={isFavorite(getCarId(selectedCar)) ? 'text-red-400 fill-red-400' : 'text-white/70'} />
                            </button>
                        </div>
                        <div className="text-sm text-white/60">{selectedCar.year} • {selectedCar.mileage.toLocaleString()} km</div>
                        <div className="text-sm text-white/60 mt-1">{selectedCar.specs?.engine || 'N/A'} • {selectedCar.specs?.fuel || 'N/A'}</div>
                    </div>

                    <button
                        onClick={() => prefillRequestFromCar(selectedCar)}
                        className="w-full py-4 rounded-xl font-bold text-black flex items-center justify-center gap-2"
                        style={{ backgroundColor: primaryColor }}
                    >
                        <MessageSquare size={18} /> Request This Car
                    </button>
                </div>
            </div>
        );
    };

    const renderStatus = () => (
        <div className="animate-fade-in pb-24 p-6 min-h-screen flex flex-col bg-black">
            <h2 className="text-2xl font-bold text-white mb-2">Request Status</h2>
            <p className="text-white/50 mb-6">Check your request by ID, phone, or Telegram account.</p>

            <div className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Request ID</label>
                    <input className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="e.g. RQ-12345" value={statusQuery.publicId} onChange={e => setStatusQuery({ ...statusQuery, publicId: e.target.value })} />
                </div>
                <div>
                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Phone</label>
                    <input className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="+1 555 123 4567" value={statusQuery.phone} onChange={e => setStatusQuery({ ...statusQuery, phone: e.target.value })} />
                </div>
                <button
                    onClick={async () => {
                        try {
                            const slug = targetSlug || 'system';
                            const res = await getMiniAppRequestStatus({
                                slug,
                                requestId: statusQuery.publicId || undefined,
                                phone: statusQuery.phone || undefined,
                                telegramUserId: tgUser?.id ? String(tgUser.id) : undefined
                            });
                            setStatusResult(res.request || res);
                        } catch (e) {
                            setStatusResult({ error: 'Request not found' });
                        }
                    }}
                    className="w-full py-4 rounded-xl font-bold text-black"
                    style={{ backgroundColor: primaryColor }}
                >
                    Check Status
                </button>
            </div>

            {statusResult && (
                <div className="mt-6 bg-[#1c1c1e] border border-white/10 rounded-xl p-4 text-white">
                    {statusResult.error ? (
                        <div className="text-red-400">{statusResult.error}</div>
                    ) : (
                        <>
                            <div className="text-sm text-white/60">Request ID</div>
                            <div className="font-bold text-white mb-2">{statusResult.publicId || statusResult.id}</div>
                            <div className="text-sm text-white/60">Status</div>
                            <div className="font-bold text-white">{statusResult.status}</div>
                        </>
                    )}
                </div>
            )}
        </div>
    );

    const handleNextStep = async () => {
        if (reqStep === 1) {
            setReqStep(2);
        } else {
            const tg = (window as any).Telegram?.WebApp;

            // Use Direct API call for reliability
            try {
                const slug = targetSlug || 'system';
                const listingId = getCarId(selectedCar) || undefined;
                const descriptionParts = [
                    reqData.brand ? `Vehicle: ${reqData.brand}` : null,
                    reqData.year ? `Year: ${reqData.year}+` : null,
                    reqData.budget ? `Budget: ${reqData.budget}` : null,
                    reqComment ? `Comment: ${reqComment}` : null,
                    reqPhone ? `Phone: ${reqPhone}` : null
                ].filter(Boolean);

                const requestPayload = {
                    slug,
                    title: listingId && selectedCar?.title ? `Request: ${selectedCar.title}` : `Request: ${reqData.brand || 'Car'} ${reqData.year || ''}`.trim(),
                    description: descriptionParts.length ? descriptionParts.join('\n') : undefined,
                    budgetMax: reqData.budget ? Number(reqData.budget) : undefined,
                    yearMin: reqData.year ? Number(reqData.year) : undefined,
                    phone: reqPhone || undefined,
                    comment: reqComment || undefined,
                    carListingId: listingId || undefined,
                    tracking: trackingMeta,
                    telegram: {
                        userId: tgUser?.id ? String(tgUser.id) : undefined,
                        username: tgUser?.username,
                        name: [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ')
                    }
                };

                await createMiniAppRequest(requestPayload);

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
                                <div>
                                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Phone (for status updates)</label>
                                    <input type="tel" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="+1 555 123 4567" value={reqPhone} onChange={e => setReqPhone(e.target.value)} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Comment (optional)</label>
                                    <textarea className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10 min-h-[96px]" placeholder="Tell us details or preferences" value={reqComment} onChange={e => setReqComment(e.target.value)} />
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
                                    <div className="flex justify-between"><span>Phone:</span> <span className="font-bold text-white">{reqPhone || '—'}</span></div>
                                    <div className="flex justify-between"><span>Comment:</span> <span className="font-bold text-white">{reqComment || '—'}</span></div>
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
                            <ShieldCheck size={12} className="text-green-500" /> Verified Client
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
                        <History size={16} style={{ color: primaryColor }} /> Recent Activity
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
                        <Star size={16} style={{ color: primaryColor }} /> Saved Vehicles
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

    const AppIcon = ({ name, size = 24 }: { name: string; size?: number }) => {
        const props = { size };
        switch (name) {
            case 'Home': return <Home {...props} />;
            case 'Search': return <Search {...props} />;
            case 'Zap': return <Zap {...props} />;
            case 'DollarSign': return <DollarSign {...props} />;
            case 'MessageCircle': return <MessageSquare {...props} />;
            case 'Grid':
            case 'LayoutGrid': return <LayoutGrid {...props} />;
            case 'List': return <ListIcon {...props} />;
            case 'Phone': return <Phone {...props} />;
            case 'Heart': return <Heart {...props} />;
            case 'ClipboardList': return <ClipboardList {...props} />;
            case 'User': return <User {...props} />;
            default: return <Star {...props} />;
        }
    };

    const renderIcon = (icon?: string, size = 22) => {
        if (!icon) return <AppIcon name="Star" size={size} />;
        if (icon.startsWith('http://') || icon.startsWith('https://')) {
            return <img src={icon} className="w-6 h-6 object-cover rounded-full" />;
        }
        const hasNonAlpha = /[^a-z0-9_]/i.test(icon);
        if (hasNonAlpha) {
            return <span className="text-lg leading-none">{icon}</span>;
        }
        return <AppIcon name={icon} size={size} />;
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
            {view === 'FAVORITES' && renderFavorites()}
            {view === 'LISTING' && renderListing()}
            {view === 'REQUEST' && renderRequest()}
            {view === 'STATUS' && renderStatus()}
            {view === 'PROFILE' && renderProfile()}

            {/* Gallery Lightbox */}
            {lightboxCar && (
                <div className="fixed inset-0 bg-black z-[100] flex flex-col">
                    {(() => {
                        const lightboxImages = getCarImages(lightboxCar);
                        return (
                            <>
                                <div className="p-4 flex justify-between items-center">
                                    <h3 className="text-white font-bold truncate">{lightboxCar.title}</h3>
                                    <button onClick={() => setLightboxCar(null)} className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                                        <X size={20} className="text-white" />
                                    </button>
                                </div>
                                <div className="flex-1 relative flex items-center justify-center">
                                    <img
                                        src={lightboxImages[lightboxImageIndex] || lightboxCar.thumbnail || PLACEHOLDER_IMAGE}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                    {lightboxImages.length > 1 && (
                                        <>
                                            {lightboxImageIndex > 0 && (
                                                <button
                                                    onClick={() => setLightboxImageIndex(lightboxImageIndex - 1)}
                                                    className="absolute left-4 w-12 h-12 bg-black/50 backdrop-blur rounded-full flex items-center justify-center"
                                                >
                                                    <ChevronLeft size={24} className="text-white" />
                                                </button>
                                            )}
                                            {lightboxImageIndex < lightboxImages.length - 1 && (
                                                <button
                                                    onClick={() => setLightboxImageIndex(lightboxImageIndex + 1)}
                                                    className="absolute right-4 w-12 h-12 bg-black/50 backdrop-blur rounded-full flex items-center justify-center"
                                                >
                                                    <ChevronRightIcon size={24} className="text-white" />
                                                </button>
                                            )}
                                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur px-3 py-1 rounded-full text-xs text-white">
                                                {lightboxImageIndex + 1} / {lightboxImages.length}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                </div>
            )}

            {/* Bottom Navigation */}
            <div className="h-20 bg-[#1c1c1e]/90 backdrop-blur-md border-t border-white/5 fixed bottom-0 w-full max-w-md flex items-center justify-around z-50 pb-4 shadow-lg">
                {navItems.map(item => {
                    const isView = item.actionType === 'VIEW';
                    const isActive = isView && view === item.value;
                    return (
                        <button
                            key={item.id}
                            onClick={() => handleAction(item as any)}
                            className={`flex flex-col items-center gap-1 transition-colors ${isActive ? 'text-white' : 'text-white/40'}`}
                        >
                            <span style={isActive ? { color: primaryColor } : {}}>
                                {renderIcon(item.icon || 'Star', 22)}
                            </span>
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
