
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, MiniAppConfig, CarListing } from '../../types';
import { getPublicBots, getShowcaseInventory } from '../../services/publicApi';
import { createMiniAppRequest, getMiniAppConfig, getMiniAppFavorites, getMiniAppRequestStatus, toggleMiniAppFavorite, type MiniAppTrackingMeta } from '../../services/miniappApi';
import {
    Search, LayoutGrid, User, Plus, Filter, ArrowRight, DollarSign,
    MessageSquare, Zap, List as ListIcon, Star, Phone, Home, Heart, ClipboardList,
    ChevronRight, MapPin, Calendar, CheckCircle, SlidersHorizontal,
    X, ChevronLeft, ChevronRight as ChevronRightIcon, Image as ImageIcon, History, ShieldCheck, LogOut
} from 'lucide-react';
import { initTelegramViewport } from './miniapp/telegramViewport';
import { popViewHistory, pushViewHistory } from './miniapp/navigation';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("MiniApp ErrorBoundary caught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="h-[var(--tg-viewport-height)] min-h-[var(--tg-viewport-height)] flex items-center justify-center text-white bg-black px-6 text-center">
                    <div>
                        <div className="text-xl font-bold mb-2 text-red-500">Сталася помилка</div>
                        <div className="text-white/70 text-sm mb-4 break-words font-mono bg-white/5 p-4 rounded-lg text-left max-h-60 overflow-y-auto">
                            {this.state.error && this.state.error.toString()}
                            <br />
                            <br />
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 bg-white text-black font-bold rounded-lg hover:bg-gray-200 transition-colors"
                        >
                            Оновити
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

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

type TelegramBootstrapContext = {
    tg: any;
    initData?: string;
    startParam?: string;
    user: TgUser | null;
    isTelegramContext: boolean;
};

type MiniAppSurfaceMode = 'LEAD' | 'B2B';
type MiniAppView = 'HOME' | 'INVENTORY' | 'LISTING' | 'FAVORITES' | 'REQUEST' | 'STATUS' | 'PROFILE';

const readTelegramLaunchValue = (key: string): string => {
    const sources = [window.location.search, window.location.hash.startsWith('#') ? `?${window.location.hash.slice(1)}` : ''];
    for (const source of sources) {
        if (!source) continue;
        const match = source.match(new RegExp(`[?&]${key}=([^&]+)`));
        if (!match || !match[1]) continue;
        try {
            return decodeURIComponent(match[1]);
        } catch {
            return match[1];
        }
    }
    return '';
};

const parseTelegramUserFromInitData = (rawInitData?: string): TgUser | null => {
    if (!rawInitData) return null;
    try {
        const params = new URLSearchParams(rawInitData);
        const userRaw = params.get('user');
        if (!userRaw) return null;
        try {
            return JSON.parse(userRaw) as TgUser;
        } catch {
            return JSON.parse(decodeURIComponent(userRaw)) as TgUser;
        }
    } catch {
        return null;
    }
};

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const hasTelegramUserAgent = () => /telegram/i.test(window.navigator?.userAgent || '');
const hasTelegramReferrer = () => /t\.me|telegram/i.test(document.referrer || '');
const hasTelegramBridgeProxy = () => Boolean((window as any).TelegramWebviewProxy || (window as any).TelegramGameProxy);

const resolveTelegramBootstrapContext = async (): Promise<TelegramBootstrapContext> => {
    const launchInitData = readTelegramLaunchValue('tgWebAppData');
    const launchStartParam = readTelegramLaunchValue('tgWebAppStartParam') || readTelegramLaunchValue('startapp') || readTelegramLaunchValue('start_param');
    const launchPlatform = readTelegramLaunchValue('tgWebAppPlatform');
    const launchVersion = readTelegramLaunchValue('tgWebAppVersion');
    const launchTheme = readTelegramLaunchValue('tgWebAppThemeParams');

    for (let attempt = 0; attempt < 20; attempt++) {
        const tg = (window as any).Telegram?.WebApp;
        const bridgeInitData = typeof tg?.initData === 'string' ? tg.initData.trim() : '';
        const bridgeStartParam = typeof tg?.initDataUnsafe?.start_param === 'string' ? String(tg.initDataUnsafe.start_param) : '';
        const bridgeUser = (tg?.initDataUnsafe?.user as TgUser | undefined) || null;

        if (tg && attempt === 0) {
            tg.ready?.();
            tg.expand?.();
            tg.enableClosingConfirmation?.();
        }

        const resolvedInitData = bridgeInitData || launchInitData || '';
        const resolvedUser = bridgeUser || parseTelegramUserFromInitData(resolvedInitData);
        const hasBridgeContext = Boolean(bridgeInitData || bridgeStartParam || bridgeUser);
        const hasLaunchContext = Boolean(launchInitData || launchStartParam || launchPlatform || launchVersion || launchTheme);
        const isTelegramContext = hasBridgeContext || hasLaunchContext || Boolean(tg) || hasTelegramUserAgent() || hasTelegramReferrer() || hasTelegramBridgeProxy();

        if (hasBridgeContext || hasLaunchContext) {
            return {
                tg,
                initData: resolvedInitData || undefined,
                startParam: bridgeStartParam || launchStartParam || undefined,
                user: resolvedUser,
                isTelegramContext
            };
        }

        if (!isTelegramContext) {
            return {
                tg,
                initData: undefined,
                startParam: undefined,
                user: null,
                isTelegramContext: false
            };
        }

        await sleep(150);
    }

    const tg = (window as any).Telegram?.WebApp;
    const bridgeInitData = typeof tg?.initData === 'string' ? tg.initData.trim() : '';
    const resolvedInitData = bridgeInitData || launchInitData;
    return {
        tg,
        initData: resolvedInitData || undefined,
        startParam: launchStartParam || undefined,
        user: parseTelegramUserFromInitData(resolvedInitData),
        isTelegramContext: Boolean(resolvedInitData || tg || hasTelegramUserAgent() || launchStartParam || launchPlatform || launchVersion || launchTheme || hasTelegramReferrer() || hasTelegramBridgeProxy())
    };
};

const MiniAppContent = () => {
    const { slug } = useParams();
    const [activeBot, setActiveBot] = useState<Bot | null>(null);
    const [config, setConfig] = useState<MiniAppConfig | null>(null);
    const [view, setView] = useState<MiniAppView>('HOME');
    const [selectedCar, setSelectedCar] = useState<CarListing | null>(null);
    const [favorites, setFavorites] = useState<string[]>([]);
    const [favoriteItems, setFavoriteItems] = useState<CarListing[]>([]);
    const [tgUser, setTgUser] = useState<TgUser | null>(null);
    const [requiresTelegram, setRequiresTelegram] = useState(false);
    const [initData, setInitData] = useState<string | undefined>(undefined);
    const [initError, setInitError] = useState<string | null>(null);
    const [configWarning, setConfigWarning] = useState<string | null>(null);
    const [isConfigLoading, setIsConfigLoading] = useState(true);
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
    const [reqMileage, setReqMileage] = useState('');
    const [reqFuel, setReqFuel] = useState('');
    const [reqCompany, setReqCompany] = useState('');
    const [reqPhone, setReqPhone] = useState('');
    const [statusQuery, setStatusQuery] = useState({ publicId: '', phone: '' });
    const [statusResult, setStatusResult] = useState<any>(null);
    const [trackingMeta, setTrackingMeta] = useState<MiniAppTrackingMeta>({});
    const [reqComment, setReqComment] = useState('');
    const hasTelegramInit = Boolean(initData);
    const viewHistoryRef = useRef<MiniAppView[]>(['HOME']);
    const suppressHistoryPushRef = useRef(false);

    const goBack = useCallback(() => {
        if (lightboxCar) {
            setLightboxCar(null);
            return;
        }

        if (view === 'REQUEST' && reqStep > 1) {
            setReqStep(prev => Math.max(1, prev - 1));
            return;
        }

        const target = popViewHistory(viewHistoryRef.current, 'HOME');
        if (target !== view) {
            suppressHistoryPushRef.current = true;
            setView(target);
        }
    }, [lightboxCar, reqStep, view]);

    const normalizeSlug = (value?: string | null) => {
        if (!value) return '';
        let s = String(value).trim();
        s = s.replace(/^@/, '');
        s = s.replace(/^https?:\/\/t\.me\//, '');
        s = s.replace(/\/app\/?$/, '');
        s = s.replace(/\/+$/, '');
        s = s.replace(/[.,;:]+$/, '');
        return s.trim();
    };

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
        if (!hasTelegramInit) {
            setConfigWarning('Обране доступне лише всередині Telegram Mini App.');
            return;
        }
        const identity = {
            tgUserId: tgUser?.id ? String(tgUser.id) : undefined,
            visitorId
        };
        try {
            const res = await toggleMiniAppFavorite(id, { ...identity, slug: targetSlug || 'system', initData });
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
        setSelectedCar(car);
        setView('LISTING');
    };

    const prefillRequestFromCar = (car: CarListing) => {
        const specs = getCarSpecs(car);
        setReqData({
            brand: car.title || '',
            budget: String(car.price?.amount || ''),
            year: String(car.year || '')
        });
        setReqMileage(String(toNumberSafe(car.mileage) || ''));
        setReqFuel(specs.fuel || '');
        setReqComment('');
        setReqStep(1);
        setView('REQUEST');
    };

    const buildFallbackConfig = (target: string, mode: MiniAppSurfaceMode = 'LEAD'): MiniAppConfig => {
        if (mode === 'B2B') {
            return {
                surfaceMode: 'B2B',
                title: 'CarDealer Lviv B2B',
                welcomeText: 'Інвентар партнерів та статуси B2B-запитів.',
                layout: 'GRID',
                primaryColor: '#2AA876',
                accentColor: '#0B1F17',
                actions: [
                    { id: 'a_inv', label: 'Запити/інвентар', actionType: 'VIEW', value: 'INVENTORY', icon: 'LayoutGrid' },
                    { id: 'a_fav', label: 'Обране', actionType: 'VIEW', value: 'FAVORITES', icon: 'Heart' },
                    { id: 'a_status', label: 'Статуси', actionType: 'VIEW', value: 'STATUS', icon: 'ClipboardList' }
                ],
                navItems: [
                    { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
                    { id: 'nav_stock', label: 'Мережа', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
                    { id: 'nav_saved', label: 'Обране', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
                    { id: 'nav_status', label: 'Статуси', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
                ],
                homeBlocks: [],
                showcaseSlug: target
            };
        }
        return {
            surfaceMode: 'LEAD',
            title: 'CarTié Premium',
            welcomeText: 'Ваш персональний помічник з підбору авто.',
            layout: 'GRID',
            primaryColor: '#D4AF37',
            accentColor: '#111',
            actions: [
                { id: 'a_inv', label: 'Інвентар', actionType: 'VIEW', value: 'INVENTORY', icon: 'LayoutGrid' },
                { id: 'a_req', label: 'Запит', actionType: 'VIEW', value: 'REQUEST', icon: 'Search' },
                { id: 'a_fav', label: 'Обране', actionType: 'VIEW', value: 'FAVORITES', icon: 'Heart' }
            ],
            navItems: [
                { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
                { id: 'nav_stock', label: 'Склад', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
                { id: 'nav_saved', label: 'Обране', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' },
                { id: 'nav_request', label: 'Запит', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' }
            ],
            homeBlocks: [],
            showcaseSlug: target
        };
    };

    const meta = import.meta as { env?: { VITE_BUILD_ID?: string; MODE?: string } };
    const buildVersion = meta.env?.VITE_BUILD_ID || meta.env?.MODE || 'dev';

    useEffect(() => {
        let cleanupViewport: (() => void) | undefined;
        const load = async () => {
        viewHistoryRef.current = ['HOME'];
        suppressHistoryPushRef.current = true;
        setView('HOME');
        setReqStep(1);
        setIsConfigLoading(true);
        setInitError(null);
        setRequiresTelegram(false);
        const requestId = Math.random().toString(36).substring(7);
        console.log(`[MiniApp] Init started. RequestId: ${requestId}, Slug: ${slug}`);
        setConfigWarning(null);

        // 1. Initialize Telegram Web App & Extract start_param
        const telegramContext = await resolveTelegramBootstrapContext();
        cleanupViewport = initTelegramViewport(telegramContext.tg);
        let startParam = telegramContext.startParam || '';
        const resolvedUser = telegramContext.user;

        if (!telegramContext.isTelegramContext) {
            console.log(`[MiniApp] Telegram WebApp NOT detected. Telegram-only gate enabled.`);
            setRequiresTelegram(true);
            setInitData(undefined);
            setTgUser(null);
            setConfig(null);
            setIsConfigLoading(false);
            setInitError('Mini App потрібно відкривати з меню Telegram-бота.');
            return;
        }

        const platform = telegramContext.tg?.platform || (hasTelegramUserAgent() ? 'telegram-ua' : 'url-fallback');
        const version = telegramContext.tg?.version || 'n/a';
        console.log(`[MiniApp] Telegram context detected. Platform: ${platform}, Version: ${version}, hasInitData: ${Boolean(telegramContext.initData)}`);
        setTgUser(resolvedUser);
        setInitData(telegramContext.initData);
        if (!telegramContext.initData) {
            setConfigWarning('Telegram відкрито без initData. Для дій відкрийте Mini App повторно через кнопку меню бота.');
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
        const rawSlug = slug || startParam || 'system';
        const resolvedSlug = normalizeSlug(rawSlug) || 'system';
        console.log(`[MiniApp] Resolved slug: ${resolvedSlug} (Raw: ${rawSlug})`);

        // 3. Load Mini App Configuration
        try {
            console.log(`[MiniApp] Fetching config for slug: ${resolvedSlug}`);
            const conf = await getMiniAppConfig(resolvedSlug);
            console.log(`[MiniApp] Config loaded:`, conf);

            if (!conf || (!conf.publicSlug && !conf.companyId)) {
                throw new Error('Некоректна конфігурація з сервера');
            }

            // Update state
            setTargetSlug(conf.publicSlug || resolvedSlug);

            // If we got config for specific bot, use it
            const resolvedMode: MiniAppSurfaceMode = (conf?.miniapp?.surfaceMode === 'B2B' || String(conf.template || '').toUpperCase() === 'B2B')
                ? 'B2B'
                : 'LEAD';

            if (conf.miniapp) {
                setConfig({
                    ...conf.miniapp,
                    surfaceMode: conf.miniapp.surfaceMode || resolvedMode
                });
            } else {
                console.warn(`[MiniApp] Config missing 'miniapp' payload. Using fallback.`);
                setConfigWarning('Конфігурація Mini App порожня. Використано базовий вигляд.');
                // Fallback local config if empty
                setConfig(buildFallbackConfig(conf.publicSlug, resolvedMode));
            }

            // Also set active bot if needed (we don't have full bot object but we have props)
            if (conf.botId && conf.botUsername) {
                setActiveBot({
                    id: conf.botId,
                    username: conf.botUsername,
                    template: conf.template,
                    defaultShowcaseSlug: conf.publicSlug,
                    miniAppConfig: conf.miniapp
                } as Bot);
            }

            // Load favorites
            console.log(`[MiniApp] Loading favorites...`);
            await loadFavorites(conf.publicSlug, {
                tgUserId: resolvedUser?.id ? String(resolvedUser.id) : undefined,
                visitorId
            });

        } catch (e) {
            console.error('MiniApp init failed', e);
            const reason = e instanceof Error ? e.message : String(e);
            setInitError(`Не вдалося завантажити конфігурацію застосунку. ${reason}.`);
            setConfigWarning('Конфігурація недоступна. Використано базовий вигляд.');
            const fallbackSlug = slug || 'system';
            setTargetSlug(fallbackSlug);
            const fallbackMode: MiniAppSurfaceMode = /b2b|cardealer/i.test(String(fallbackSlug)) ? 'B2B' : 'LEAD';
            setConfig(buildFallbackConfig(fallbackSlug, fallbackMode));
            setCars([]); // clear cars
        } finally {
            setIsConfigLoading(false);
        }
        };
        load();
        return () => {
            cleanupViewport?.();
        };
    }, [slug]);

    useEffect(() => {
        if (suppressHistoryPushRef.current) {
            suppressHistoryPushRef.current = false;
            return;
        }
        pushViewHistory(viewHistoryRef.current, view);
    }, [view]);

    useEffect(() => {
        const tg = (window as any).Telegram?.WebApp;
        const backButton = tg?.BackButton;
        if (!backButton) return;

        const handleBack = () => goBack();
        const shouldShowBack = view !== 'HOME' || reqStep > 1;
        if (shouldShowBack) {
            backButton.show?.();
            backButton.onClick?.(handleBack);
        } else {
            backButton.hide?.();
            backButton.offClick?.(handleBack);
        }

        return () => {
            backButton.offClick?.(handleBack);
        };
    }, [goBack, reqStep, view]);

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
            setConfigWarning('Сценарні дії доступні лише всередині Telegram.');
        }
    }
};

const sendLeadPayload = (payload: Record<string, unknown>) => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.initData) {
        tg.sendData(JSON.stringify(payload));
        tg.close();
    } else {
        setConfigWarning('Дії із запитом доступні лише всередині Telegram.');
    }
};

const detectLang = () => {
    return 'UK';
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

if (isConfigLoading && !config) {
    return (
        <div className="h-[var(--tg-viewport-height)] min-h-[var(--tg-viewport-height)] flex items-center justify-center text-white bg-black">
            <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <div className="text-white/50 text-sm">Завантаження Mini App...</div>
            </div>
        </div>
    );
}

if (requiresTelegram) {
    return (
        <div className="h-[var(--tg-viewport-height)] min-h-[var(--tg-viewport-height)] flex items-center justify-center text-white bg-black px-6 text-center">
            <div className="max-w-sm">
                <div className="text-xl font-bold mb-2">Потрібен Telegram</div>
                <div className="text-white/70 text-sm">
                    Відкрийте Mini App з кнопки меню в Telegram-боті. Прямий запуск у браузері не підтримується для релізного режиму.
                </div>
            </div>
        </div>
    );
}

if (!config) {
    return (
        <div className="h-[var(--tg-viewport-height)] min-h-[var(--tg-viewport-height)] flex items-center justify-center text-white bg-black px-6 text-center">
            <div>
                <div className="text-xl font-bold mb-2">Mini App недоступний</div>
                <div className="text-white/70 text-sm">{initError || 'Конфігурацію застосунку не знайдено.'}</div>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20 transition-colors"
                >
                    Повторити
                </button>
            </div>
        </div>
    );
}

const primaryColor = config.primaryColor || '#D4AF37';
const surfaceMode: MiniAppSurfaceMode = config.surfaceMode === 'B2B' ? 'B2B' : 'LEAD';
const navItems = (config.navItems && config.navItems.length > 0)
    ? config.navItems
    : [
        { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
        { id: 'nav_stock', label: 'Склад', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
        { id: 'nav_saved', label: 'Обране', icon: 'Heart', actionType: 'VIEW', value: 'FAVORITES' }
    ];
const showBottomNav = view !== 'LISTING' && view !== 'REQUEST' && view !== 'STATUS';
const showBackArrow = ((view !== 'HOME' && view !== 'LISTING') || reqStep > 1) && !lightboxCar;

const applyFiltersAndSort = () => {
    let filtered = [...cars];

    filtered = filtered.filter(car => {
        const isTransit = isTransitCar(car);
        if (tab === 'IN_TRANSIT') return isTransit;
        return !isTransit;
    });

    const brandNeedle = filters.brand.trim().toLowerCase();
    if (brandNeedle) {
        filtered = filtered.filter(car => {
            const title = String(car.title || '').toLowerCase();
            const specs = getCarSpecs(car);
            const brand = pickText((car as any).brand, (car.specs as any)?.brand).toLowerCase();
            return title.includes(brandNeedle) || brand.includes(brandNeedle) || specs.engine.toLowerCase().includes(brandNeedle);
        });
    }

    // Client-side Sort
    if (sortBy === 'price_asc') {
        filtered.sort((a, b) => (a.price?.amount || 0) - (b.price?.amount || 0));
    } else if (sortBy === 'price_desc') {
        filtered.sort((a, b) => (b.price?.amount || 0) - (a.price?.amount || 0));
    } else if (sortBy === 'year_desc') {
        filtered.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    }

    return filtered;
};

const formatPrice = (price?: { amount?: number; currency?: string }) => {
    if (!price || !price.amount) return '—';
    const curr = price.currency || 'USD';
    return `${price.amount.toLocaleString()} ${curr}`;
};

const toNumberSafe = (value: unknown) => {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : 0;
};

const formatMileage = (value: unknown) => {
    const mileage = toNumberSafe(value);
    if (!mileage) return '—';
    return `${mileage.toLocaleString()} km`;
};

const pickText = (...values: unknown[]) => {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
};

const getCarSpecs = (car: CarListing | null | undefined) => {
    const specs = (car?.specs && typeof car.specs === 'object') ? car.specs : {};
    const root = (car && typeof car === 'object') ? (car as any) : {};
    return {
        brand: pickText(root.brand, root.make, (specs as any).brand),
        model: pickText(root.model, root.trim, (specs as any).model),
        engine: pickText(root.engine, (specs as any).engine),
        fuel: pickText(root.fuel, (specs as any).fuel),
        transmission: pickText(root.transmission, root.gearbox, (specs as any).transmission),
        drive: pickText(root.drive, root.drivetrain, (specs as any).drive),
        color: pickText(root.color, (specs as any).color),
        vin: pickText(root.vin, root.VIN, (specs as any).vin),
        condition: pickText(root.condition, root.state, (specs as any).condition)
    };
};

const formatBrandModel = (car: CarListing | null | undefined) => {
    const specs = getCarSpecs(car);
    const combined = [specs.brand, specs.model].filter(Boolean).join(' ').trim();
    if (combined) return combined;
    return pickText(specs.engine, specs.fuel) || '—';
};

const isTransitCar = (car: CarListing) => {
    const specs = getCarSpecs(car);
    const condition = (specs.condition || '').toLowerCase();
    const status = String((car as any).status || '').toUpperCase();
    return condition === 'in_transit' || condition.includes('дороз') || status === 'PENDING' || status === 'IN_TRANSIT';
};

const getStatusLabel = (car: CarListing) => isTransitCar(car) ? 'В дорозі' : 'В наявності';

const renderHome = () => (
    <div className="animate-fade-in pb-24 h-full overflow-y-auto">
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
                            <p className="text-white font-bold text-sm">Вітаємо, {tgUser.first_name}</p>
                            <p className="text-white/50">{surfaceMode === 'B2B' ? 'Учасник B2B мережі' : 'Клієнт CarTié'}</p>
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
                <h3 className="font-bold text-white text-lg">{surfaceMode === 'B2B' ? 'Актуальні варіанти мережі' : 'Нові авто'}</h3>
                <button onClick={() => setView('INVENTORY')} className="text-xs font-bold" style={{ color: primaryColor }}>Дивитись всі</button>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
                {cars.slice(0, 5).map(car => {
                    const images = getCarImages(car);
                    const cover = images[0];
                    const specs = getCarSpecs(car);

                    return (
                        <div key={getCarId(car) || `home_${car.title}_${car.year}`} className="min-w-[220px] bg-[#1c1c1e] rounded-xl overflow-hidden border border-white/5 shadow-lg">
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
                                <p className="text-xs text-white/50 mt-1 mb-2">
                                    {pickText(specs.engine, specs.fuel) || '—'} • {formatMileage(car.mileage)}
                                </p>
                                <div className="font-bold text-sm" style={{ color: primaryColor }}>
                                    {formatPrice(car.price)}
                                </div>
                                <button
                                    onClick={() => openListing(car)}
                                    className="mt-2 w-full text-xs py-2 rounded-lg bg-white/5 text-white/80"
                                >
                                    Деталі
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
                <h2 className="text-xl font-bold text-white">{surfaceMode === 'B2B' ? 'Інвентар мережі' : 'Інвентар'}</h2>

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
                            placeholder="Пошук авто..."
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
                            <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Марка</label>
                            <input
                                className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                placeholder="BMW, Mercedes..."
                                value={filters.brand}
                                onChange={e => setFilters({ ...filters, brand: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Рік від</label>
                                <input
                                    type="number"
                                    className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                    placeholder="2018"
                                    value={filters.minYear}
                                    onChange={e => setFilters({ ...filters, minYear: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Рік до</label>
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
                                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Ціна від ($)</label>
                                <input
                                    type="number"
                                    className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                    placeholder="10000"
                                    value={filters.minPrice}
                                    onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Ціна до ($)</label>
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
                            <label className="text-[10px] text-white/50 uppercase font-bold block mb-1">Сортування</label>
                            <select
                                className="w-full bg-black/30 text-white px-3 py-2 rounded-lg text-sm outline-none border border-white/10"
                                value={sortBy}
                                onChange={e => setSortBy(e.target.value as any)}
                            >
                                <option value="year_desc">Новіші спочатку</option>
                                <option value="price_asc">Ціна: від меншої</option>
                                <option value="price_desc">Ціна: від більшої</option>
                            </select>
                        </div>
                        <button
                            onClick={() => {
                                setFilters({ brand: '', minYear: '', maxYear: '', minPrice: '', maxPrice: '' });
                                setSearch('');
                            }}
                            className="w-full py-2 bg-red-500/20 text-red-500 rounded-lg text-xs font-bold"
                        >
                            Скинути фільтри
                        </button>
                    </div>
                )}

                <div className="text-[10px] text-white/50">
                    Знайдено: {filteredCars.length}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {filteredCars.map(car => {
                    const images = getCarImages(car);
                    const cover = images[0];
                    const specs = getCarSpecs(car);
                    const cardActionLabel = surfaceMode === 'B2B' ? 'Створити B2B запит' : 'Запит на підбір';

                    return (
                        <div key={getCarId(car) || `inventory_${car.title}_${car.year}`} className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-white/5 flex flex-col shadow-lg">
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
                                    <p className="text-[11px] text-white/70 mt-1">
                                        {formatBrandModel(car)}
                                    </p>
                                </div>
                                {images.length > 1 && (
                                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white">
                                        +{images.length - 1} фото
                                    </div>
                                )}
                                <div className="absolute top-2 right-12 bg-black/60 backdrop-blur px-2 py-1 rounded text-[10px] font-bold text-white">
                                    {getStatusLabel(car)}
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleFavorite(car); }}
                                    className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 flex items-center justify-center"
                                >
                                    <Heart size={16} className={isFavorite(getCarId(car)) ? 'text-red-400 fill-red-400' : 'text-white/70'} />
                                </button>
                            </div>
                            <div className="p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="text-xl font-bold" style={{ color: primaryColor }}>{formatPrice(car.price)}</div>
                                    <div className="text-xs text-white/50 bg-white/5 px-2 py-1 rounded">{toNumberSafe(car.year) || '—'}</div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs text-white/70 mb-4">
                                    <div className="bg-black/30 p-2 rounded text-center border border-white/5">{specs.engine || '—'}</div>
                                    <div className="bg-black/30 p-2 rounded text-center border border-white/5">{formatMileage(car.mileage)}</div>
                                    <div className="bg-black/30 p-2 rounded text-center border border-white/5">{specs.fuel || '—'}</div>
                                    <div className="bg-black/30 p-2 rounded text-center border border-white/5">{specs.condition || '—'}</div>
                                </div>
                                <button
                                    onClick={() => surfaceMode === 'B2B' ? prefillRequestFromCar(car) : handleCarInterest(car)}
                                    className="w-full py-3 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
                                    style={{ backgroundColor: primaryColor }}
                                >
                                    <MessageSquare size={18} /> {cardActionLabel}
                                </button>
                                <button
                                    onClick={() => openListing(car)}
                                    className="w-full mt-2 py-2 rounded-xl font-bold text-white/70 border border-white/10"
                                >
                                    Деталі
                                </button>
                            </div>
                        </div>
                    );
                })}
                {filteredCars.length === 0 && <div className="text-center text-white/50 mt-10">Авто не знайдено. Спробуйте змінити фільтри.</div>}
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
                <h2 className="text-xl font-bold text-white">Обране</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {favCars.map(car => {
                    const images = getCarImages(car);
                    const cover = images[0];
                    return (
                        <div key={getCarId(car) || `fav_${car.title}_${car.year}`} className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-white/5 flex flex-col shadow-lg">
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
                                <div className="text-sm text-white/60 mt-1">{toNumberSafe(car.year) || '—'} • {formatMileage(car.mileage)}</div>
                                <div className="mt-2 font-bold" style={{ color: primaryColor }}>
                                    {formatPrice(car.price)}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {favCars.length === 0 && (
                    <div className="text-center text-white/50 mt-12">
                        Поки немає обраних авто. Натисніть серце на картці.
                    </div>
                )}
            </div>
        </div>
    );
};

const renderListing = () => {
    if (!selectedCar) {
        return (
            <div className="p-6 text-white/60">Оберіть авто, щоб подивитися деталі.</div>
        );
    }
    const images = getCarImages(selectedCar);
    const cover = images[0];

    return (
        <div className="animate-fade-in pb-24 h-full overflow-y-auto bg-black">
            <div className="p-4 flex items-center gap-3 border-b border-white/10 bg-[#000000]/90 backdrop-blur-md">
                <button onClick={goBack} className="text-white/70 text-sm">← Назад</button>
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
                        <div className="text-xl font-bold text-white">{formatPrice(selectedCar.price)}</div>
                        <button
                            onClick={() => toggleFavorite(selectedCar)}
                            className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center"
                        >
                            <Heart size={18} className={isFavorite(getCarId(selectedCar)) ? 'text-red-400 fill-red-400' : 'text-white/70'} />
                        </button>
                    </div>
                    <div className="text-xs text-white/50 mb-1">{getStatusLabel(selectedCar)}</div>
                    <div className="text-sm text-white/60">{formatBrandModel(selectedCar)}</div>
                    <div className="text-sm text-white/60">{toNumberSafe(selectedCar.year) || '—'} • {formatMileage(selectedCar.mileage)}</div>
                    <div className="text-sm text-white/60 mt-1">{getCarSpecs(selectedCar).engine || '—'} • {getCarSpecs(selectedCar).fuel || '—'}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/70">
                        <div className="bg-black/30 p-2 rounded border border-white/5">⛽ {getCarSpecs(selectedCar).fuel || '—'}</div>
                        <div className="bg-black/30 p-2 rounded border border-white/5">⚙️ {getCarSpecs(selectedCar).transmission || '—'}</div>
                        <div className="bg-black/30 p-2 rounded border border-white/5">🛞 {getCarSpecs(selectedCar).drive || '—'}</div>
                        <div className="bg-black/30 p-2 rounded border border-white/5">📍 {pickText(selectedCar.location) || '—'}</div>
                        <div className="bg-black/30 p-2 rounded border border-white/5">🎨 {getCarSpecs(selectedCar).color || '—'}</div>
                    </div>
                    {(getCarSpecs(selectedCar).vin || getCarSpecs(selectedCar).condition || selectedCar.description) && (
                        <div className="mt-3 text-xs text-white/70 space-y-1">
                            {getCarSpecs(selectedCar).condition && <div>🛠 {getCarSpecs(selectedCar).condition}</div>}
                            {getCarSpecs(selectedCar).vin && <div>🔑 VIN: {getCarSpecs(selectedCar).vin}</div>}
                            {selectedCar.description && (
                                <div className="text-white/60 line-clamp-4">{selectedCar.description}</div>
                            )}
                        </div>
                    )}
                </div>

                <button
                    onClick={() => prefillRequestFromCar(selectedCar)}
                    className="w-full py-4 rounded-xl font-bold text-black flex items-center justify-center gap-2"
                    style={{ backgroundColor: primaryColor }}
                >
                    <MessageSquare size={18} /> {surfaceMode === 'B2B' ? 'Створити B2B запит' : 'Запит на це авто'}
                </button>
            </div>
        </div>
    );
};

const renderStatus = () => (
    <div className="animate-fade-in pb-24 p-6 h-full overflow-y-auto flex flex-col bg-black">
        <h2 className="text-2xl font-bold text-white mb-2">Статус запиту</h2>
        <p className="text-white/50 mb-6">Перевірте запит за ID, номером телефону або Telegram.</p>

        <div className="space-y-4">
            <div>
                <label className="text-xs font-bold text-white/70 uppercase mb-2 block">ID запиту</label>
                <input className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="напр. RQ-12345" value={statusQuery.publicId} onChange={e => setStatusQuery({ ...statusQuery, publicId: e.target.value })} />
            </div>
            <div>
                <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Телефон</label>
                <input className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="+380 67 123 45 67" value={statusQuery.phone} onChange={e => setStatusQuery({ ...statusQuery, phone: e.target.value })} />
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
                        setStatusResult({ error: 'Запит не знайдено' });
                    }
                }}
                className="w-full py-4 rounded-xl font-bold text-black"
                style={{ backgroundColor: primaryColor }}
            >
                Перевірити статус
            </button>
        </div>

        {statusResult && (
            <div className="mt-6 bg-[#1c1c1e] border border-white/10 rounded-xl p-4 text-white">
                {statusResult.error ? (
                    <div className="text-red-400">{statusResult.error}</div>
                ) : (
                    <>
                        <div className="text-sm text-white/60">ID запиту</div>
                        <div className="font-bold text-white mb-2">{statusResult.publicId || statusResult.id}</div>
                        <div className="text-sm text-white/60">Статус</div>
                        <div className="font-bold text-white">{statusResult.status}</div>
                    </>
                )}
            </div>
        )}
    </div>
);

const handleNextStep = async () => {
    const isB2BMode = surfaceMode === 'B2B';
    if (reqStep === 1) {
        if (isB2BMode) {
            if (!reqData.brand.trim()) {
                setConfigWarning('Для B2B запиту вкажіть марку та модель.');
                return;
            }
            if (!reqCompany.trim()) {
                setConfigWarning('Для B2B запиту вкажіть назву компанії.');
                return;
            }
            if (!reqPhone.trim()) {
                setConfigWarning('Для B2B запиту додайте контакт.');
                return;
            }
        }
        setReqStep(2);
    } else {
        const tg = (window as any).Telegram?.WebApp;

        if (!hasTelegramInit) {
            setConfigWarning('Надсилання запиту доступне лише в Telegram Mini App.');
            return;
        }

        try {
            const slug = targetSlug || 'system';
            const listingId = getCarId(selectedCar) || undefined;
            const descriptionParts = [
                reqData.brand ? `Марка/модель: ${reqData.brand}` : null,
                reqData.year ? `Рік: ${reqData.year}+` : null,
                reqData.budget ? `Бюджет: ${reqData.budget}` : null,
                reqMileage ? `Пробіг: ${reqMileage}` : null,
                reqFuel ? `Пальне: ${reqFuel}` : null,
                reqCompany ? `Компанія: ${reqCompany}` : null,
                reqComment ? `Коментар: ${reqComment}` : null,
                reqPhone ? `Контакт: ${reqPhone}` : null
            ].filter(Boolean);

            const requestPayload = {
                slug,
                initData,
                title: listingId && selectedCar?.title
                    ? `${isB2BMode ? 'B2B запит' : 'Запит'}: ${selectedCar.title}`
                    : `${isB2BMode ? 'B2B запит' : 'Запит'}: ${reqData.brand || 'Авто'} ${reqData.year || ''}`.trim(),
                description: descriptionParts.length ? descriptionParts.join('\n') : undefined,
                budgetMax: reqData.budget ? Number(reqData.budget) : undefined,
                yearMin: reqData.year ? Number(reqData.year) : undefined,
                phone: reqPhone || undefined,
                comment: reqComment || undefined,
                carListingId: listingId || undefined,
                payload: {
                    mode: isB2BMode ? 'B2B' : 'LEAD',
                    mileage: reqMileage || undefined,
                    fuel: reqFuel || undefined,
                    companyName: reqCompany || undefined
                },
                tracking: trackingMeta,
                telegram: {
                    userId: tgUser?.id ? String(tgUser.id) : undefined,
                    username: tgUser?.username,
                    name: [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ')
                }
            };

            await createMiniAppRequest(requestPayload);

            if (tg && tg.initData) {
                tg.close();
            } else {
                setReqStep(3);
            }
        } catch (e) {
            console.error(e);
            const message = e instanceof Error ? e.message : 'Не вдалося надіслати запит.';
            alert(message);
        }
    }
};

const renderRequest = () => (
    <div className="animate-fade-in pb-24 p-6 h-full overflow-y-auto flex flex-col justify-center bg-black">
        {reqStep === 3 ? (
            <div className="text-center animate-slide-up">
                <div className="w-24 h-24 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                    <CheckCircle size={48} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Запит відправлено!</h2>
                <p className="text-white/50 mb-8">Ми отримали ваш запит. Менеджер перевірить ринок і скоро зв’яжеться з вами.</p>
                <button onClick={() => { setReqStep(1); setView('HOME'); }} className="btn-primary w-full py-4 rounded-xl font-bold text-lg" style={{ backgroundColor: primaryColor, color: '#000' }}>
                    На головну
                </button>
            </div>
        ) : (
            <>
                <h2 className="text-3xl font-bold text-white mb-2">{surfaceMode === 'B2B' ? 'Створити B2B запит' : 'Пошук авто'}</h2>
                <p className="text-white/50 mb-8">
                    {surfaceMode === 'B2B'
                        ? 'Заповніть структурований запит для партнерської мережі.'
                        : 'Опишіть, яке авто вам потрібно.'}
                </p>

                <div className="space-y-6">
                    {reqStep === 1 && (
                        <div className="space-y-5 animate-slide-up">
                            <div>
                                <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Марка та модель</label>
                                <input className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10 focus:border-yellow-500 transition-colors" placeholder="Напр. BMW X5" value={reqData.brand} onChange={e => setReqData({ ...reqData, brand: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Рік від</label>
                                    <input type="number" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="2018" value={reqData.year} onChange={e => setReqData({ ...reqData, year: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Бюджет до</label>
                                    <input type="number" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="50000" value={reqData.budget} onChange={e => setReqData({ ...reqData, budget: e.target.value })} />
                                </div>
                            </div>
                            {surfaceMode === 'B2B' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Бажаний пробіг</label>
                                            <input type="text" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="до 120000 км" value={reqMileage} onChange={e => setReqMileage(e.target.value)} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Тип пального</label>
                                            <input type="text" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="дизель / бензин / гібрид" value={reqFuel} onChange={e => setReqFuel(e.target.value)} />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Компанія, яка шукає</label>
                                        <input type="text" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="Назва компанії" value={reqCompany} onChange={e => setReqCompany(e.target.value)} />
                                    </div>
                                </>
                            )}
                            <div>
                                <label className="text-xs font-bold text-white/70 uppercase mb-2 block">{surfaceMode === 'B2B' ? 'Контакт (обовʼязково)' : 'Телефон (для статусів)'}</label>
                                <input type="tel" className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10" placeholder="+380 67 123 45 67" value={reqPhone} onChange={e => setReqPhone(e.target.value)} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-white/70 uppercase mb-2 block">Коментар (опційно)</label>
                                <textarea className="w-full bg-[#1c1c1e] text-white p-4 rounded-xl outline-none border border-white/10 min-h-[96px]" placeholder="Деталі, побажання, важливі умови" value={reqComment} onChange={e => setReqComment(e.target.value)} />
                            </div>
                        </div>
                    )}

                    {reqStep === 2 && (
                        <div className="space-y-4 animate-slide-up">
                            <div className="bg-[#1c1c1e] p-6 rounded-xl border border-white/10 text-white/80 text-sm space-y-2">
                                <p className="font-bold text-white mb-4 text-lg border-b border-white/10 pb-2">Підсумок</p>
                                <div className="flex justify-between"><span>Авто:</span> <span className="font-bold text-white">{reqData.brand}</span></div>
                                <div className="flex justify-between"><span>Рік:</span> <span className="font-bold text-white">{reqData.year}+</span></div>
                                <div className="flex justify-between"><span>Бюджет:</span> <span className="font-bold text-white" style={{ color: primaryColor }}>${reqData.budget}</span></div>
                                {surfaceMode === 'B2B' && (
                                    <>
                                        <div className="flex justify-between"><span>Пробіг:</span> <span className="font-bold text-white">{reqMileage || '—'}</span></div>
                                        <div className="flex justify-between"><span>Пальне:</span> <span className="font-bold text-white">{reqFuel || '—'}</span></div>
                                        <div className="flex justify-between"><span>Компанія:</span> <span className="font-bold text-white">{reqCompany || '—'}</span></div>
                                    </>
                                )}
                                <div className="flex justify-between"><span>Контакт:</span> <span className="font-bold text-white">{reqPhone || '—'}</span></div>
                                <div className="flex justify-between"><span>Коментар:</span> <span className="font-bold text-white">{reqComment || '—'}</span></div>
                            </div>
                            <p className="text-xs text-white/50 text-center px-4">
                                {surfaceMode === 'B2B'
                                    ? 'Після надсилання запит буде опубліковано в приватному каналі без ваших відкритих контактів.'
                                    : 'Після надсилання менеджер зв’яжеться з вами у цьому чаті.'}
                            </p>
                            {!hasTelegramInit && (
                                <div className="text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                                    Відкрийте цю сторінку з Telegram, щоб надіслати запит.
                                </div>
                            )}
                        </div>
                    )}

                    <div className="pt-4">
                        <button
                            onClick={handleNextStep}
                            disabled={reqStep === 1 && (!reqData.brand || (surfaceMode === 'B2B' && (!reqPhone || !reqCompany)))}
                            className="w-full py-4 rounded-xl font-bold text-black flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-50 disabled:scale-100 shadow-lg"
                            style={{ backgroundColor: primaryColor }}
                        >
                            {reqStep === 1 ? 'Продовжити' : (hasTelegramInit ? 'Надіслати запит' : 'Відкрити в Telegram для надсилання')} <ArrowRight size={18} />
                        </button>
                    </div>
                </div>
            </>
        )}
    </div>
);

const renderProfile = () => (
    <div className="animate-fade-in pb-24 h-full overflow-y-auto bg-black">
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
                        <ShieldCheck size={12} className="text-green-500" /> Верифікований профіль
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
                    <History size={16} style={{ color: primaryColor }} /> Остання активність
                </h3>

                {/* Mock Activity Data */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                            <Search size={18} />
                        </div>
                        <div className="flex-1">
                            <div className="text-xs text-white/50 mb-0.5">Сьогодні, 10:23</div>
                            <div className="text-sm font-medium text-white">Пошук: "BMW X5 2020"</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                            <MessageSquare size={18} />
                        </div>
                        <div className="flex-1">
                            <div className="text-xs text-white/50 mb-0.5">Вчора, 14:45</div>
                            <div className="text-sm font-medium text-white">Розпочато чат з менеджером</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-[#1c1c1e] rounded-xl p-4 border border-white/5">
                <h3 className="font-bold text-white text-sm mb-4 flex items-center gap-2">
                    <Star size={16} style={{ color: primaryColor }} /> Збережені авто
                </h3>
                <div className="text-center py-6 text-white/30 text-xs">
                    Поки що немає збережених авто.
                </div>
            </div>

            <button onClick={() => (window as any).Telegram?.WebApp?.close()} className="w-full py-4 rounded-xl bg-red-500/10 text-red-500 font-bold flex items-center justify-center gap-2 border border-red-500/20 hover:bg-red-500/20 transition-colors">
                <LogOut size={18} /> Закрити застосунок
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
        case 'Phone':
        case 'Телефон':
            return <Phone {...props} />;
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
    <div className="telegram-miniapp-shell relative mx-auto flex h-[var(--tg-viewport-height)] min-h-[var(--tg-viewport-height)] w-full max-w-md flex-col overflow-hidden border-x border-[#1c1c1e] bg-black font-sans text-white shadow-2xl">
        {configWarning && (
            <div className="bg-yellow-500/15 text-yellow-300 text-[10px] uppercase font-bold text-center py-1 border-b border-yellow-500/30">
                {configWarning}
            </div>
        )}

        <div className="relative flex-1 min-h-0">
            {showBackArrow && (
                <button
                    onClick={goBack}
                    className="absolute left-4 top-4 z-40 flex items-center gap-1 rounded-full bg-black/60 px-3 py-2 text-xs font-bold text-white/90 backdrop-blur border border-white/10"
                >
                    <ChevronLeft size={16} />
                    Назад
                </button>
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
                <div className="absolute inset-0 bg-black z-[100] flex flex-col">
                    {(() => {
                        const lightboxImages = getCarImages(lightboxCar);
                        const hasMultiple = lightboxImages.length > 1;
                        return (
                            <>
                                <div className="p-4 flex justify-between items-center">
                                    <h3 className="text-white font-bold truncate">{lightboxCar.title}</h3>
                                    <button
                                        onClick={() => setLightboxCar(null)}
                                        className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center"
                                    >
                                        <X size={20} className="text-white" />
                                    </button>
                                </div>
                                <div className="flex-1 relative flex items-center justify-center">
                                    <img
                                        src={lightboxImages[lightboxImageIndex] || lightboxCar.thumbnail || PLACEHOLDER_IMAGE}
                                        className="max-w-full max-h-full object-contain"
                                    />
                                    {hasMultiple && (
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
        </div>

        {showBottomNav && (
            <div className="relative z-40 bg-[#000000]/90 backdrop-blur-md border-t border-white/10 pb-6 pt-2 px-6">
                <div className="flex justify-between items-center max-w-sm mx-auto">
                    {navItems.map(item => {
                        const isActive = view === item.value;
                        return (
                            <button
                                key={item.id}
                                onClick={() => handleAction(item)}
                                className={`flex flex-col items-center gap-1 transition-all duration-200 ${isActive ? 'text-white scale-105' : 'text-white/40 hover:text-white/60'}`}
                            >
                                <div className={`p-1.5 rounded-xl ${isActive ? 'bg-white/10' : ''}`}>
                                    {renderIcon(item.icon, 24)}
                                </div>
                                <span className={`text-[10px] font-medium ${isActive ? 'text-white' : 'text-white/40'}`}>
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        )}
    </div>
);
};

export const MiniApp = () => (
    <ErrorBoundary>
        <MiniAppContent />
    </ErrorBoundary>
);
