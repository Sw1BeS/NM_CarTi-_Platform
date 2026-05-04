
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, MiniAppConfig, CarListing } from '../../types';
import { getPublicBots, getShowcaseInventory } from '../../services/publicApi';
import { createMiniAppRequest, getMiniAppConfig, getMiniAppFavorites, getMiniAppRequestStatus, toggleMiniAppFavorite, type MiniAppTrackingMeta } from '../../services/miniappApi';
import {
    Search, LayoutGrid, User, Plus, Filter, DollarSign,
    MessageSquare, Zap, List as ListIcon, Star, Phone, Home, Heart, ClipboardList,
    ChevronRight, MapPin, Calendar, CheckCircle, SlidersHorizontal,
    X, ChevronLeft, ChevronRight as ChevronRightIcon, Image as ImageIcon
} from 'lucide-react';
import { initTelegramViewport } from './miniapp/telegramViewport';
import { popViewHistory, pushViewHistory } from './miniapp/navigation';
import { ToastStack, useToasts } from '../../components/ui/Toast';
import { MiniAppShell } from './miniapp/MiniAppShell';
import { CatalogView } from './miniapp/views/CatalogView';
import { FavoritesView } from './miniapp/views/FavoritesView';
import { ProfileView } from './miniapp/views/ProfileView';
import { RequestView } from './miniapp/views/RequestView';

const emitMiniAppEvent = (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    try {
        window.dispatchEvent(new CustomEvent('cartie:miniapp:event', {
            detail: {
                at: new Date().toISOString(),
                level,
                message,
                meta: meta || {}
            }
        }));
    } catch {
        // no-op
    }
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null }> {
    public state: { hasError: boolean; error: Error | null; errorInfo: React.ErrorInfo | null };
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        emitMiniAppEvent('error', 'MiniApp ErrorBoundary caught error', {
            error: String(error),
            componentStack: errorInfo.componentStack || ''
        });
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

const resolveMiniAppWriteError = (error: unknown, fallback = 'Не вдалося виконати дію.') => {
    const message = error instanceof Error ? String(error.message || '').trim() : '';
    if (!message) return fallback;
    const lower = message.toLowerCase();
    if (
        lower.includes('unauthorized')
        || lower.includes('invalid telegram init data')
        || lower.includes('initdata')
        || lower.includes('init data')
    ) {
        return 'Сесія Telegram застаріла. Відкрийте Mini App повторно через кнопку в боті.';
    }
    return message;
};

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
    const [selectedRequestCarIds, setSelectedRequestCarIds] = useState<string[]>([]);
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
    const [reqData, setReqData] = useState({ brand: '', budgetMin: '', budgetMax: '', yearMin: '', yearMax: '', city: '', brandSearch: '' });
    const [reqMileage, setReqMileage] = useState('');
    const [reqFuel, setReqFuel] = useState('');
    const [reqCompany, setReqCompany] = useState('');
    const [reqPhone, setReqPhone] = useState('');
    const [statusQuery, setStatusQuery] = useState({ publicId: '', phone: '' });
    const [statusResult, setStatusResult] = useState<any>(null);
    const [trackingMeta, setTrackingMeta] = useState<MiniAppTrackingMeta>({});
    const [reqComment, setReqComment] = useState('');
    const { toasts, pushToast, dismissToast } = useToasts();
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
    const isSelectedForRequest = (carId: string) => selectedRequestCarIds.includes(carId);

    const toggleRequestSelection = (car: CarListing) => {
        const carId = getCarId(car);
        if (!carId) return;
        setSelectedRequestCarIds(prev => prev.includes(carId) ? prev.filter(id => id !== carId) : [...prev, carId]);
    };

    const clearRequestSelection = () => setSelectedRequestCarIds([]);

    const selectedRequestCars = React.useMemo(() => {
        if (!selectedRequestCarIds.length) return [] as CarListing[];
        const source = [selectedCar, ...cars, ...favoriteItems]
            .filter((item): item is CarListing => Boolean(item));
        const map = new Map(source.map(item => [getCarId(item), item]));
        return selectedRequestCarIds.map(id => map.get(id)).filter((item): item is CarListing => Boolean(item));
    }, [cars, favoriteItems, selectedCar, selectedRequestCarIds]);

    const loadFavorites = async (slug: string, identity: { tgUserId?: string; visitorId?: string }) => {
        try {
            const res = await getMiniAppFavorites({ slug, ...identity });
            setFavorites(res.ids || []);
            setFavoriteItems(res.items || []);
        } catch (e) {
            emitMiniAppEvent('warn', 'Failed to load favorites', { error: e instanceof Error ? e.message : String(e) });
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
            emitMiniAppEvent('warn', 'Failed to toggle favorite', { error: e instanceof Error ? e.message : String(e), carId: id });
            pushToast('Не вдалося оновити обране. Спробуйте ще раз.', 'error');
        }
    };

    const openListing = (car: CarListing) => {
        setSelectedCar(car);
        setView('LISTING');
    };

    const prefillRequestFromCar = (car: CarListing) => {
        const carId = getCarId(car);
        const specs = getCarSpecs(car);
        setReqData(prev => ({
            ...prev,
            brand: car.title || '',
            budgetMin: '',
            budgetMax: String(car.price?.amount || ''),
            yearMin: String(car.year || ''),
            yearMax: '',
            city: car.location || '',
            brandSearch: ''
        }));
        setReqMileage(String(toNumberSafe(car.mileage) || ''));
        setReqFuel(specs.fuel || '');
        setReqComment('');
        if (carId) {
            setSelectedRequestCarIds([carId]);
        }
        setReqStep(1);
        setView('REQUEST');
    };

    const openRequestForSelectedCars = () => {
        if (!selectedRequestCarIds.length) return;
        if (!reqData.brand && selectedRequestCars[0]) {
            const first = selectedRequestCars[0];
            setReqData(prev => ({
                ...prev,
                brand: first.title || '',
                budgetMin: '',
                budgetMax: String(first.price?.amount || ''),
                yearMin: String(first.year || ''),
                yearMax: '',
                city: first.location || '',
                brandSearch: ''
            }));
        }
        setReqStep(1);
        setView('REQUEST');
    };

    const buildFallbackConfig = (target: string, mode: MiniAppSurfaceMode = 'LEAD'): MiniAppConfig => {
        if (mode === 'B2B') {
            return {
                surfaceMode: 'B2B',
                isEnabled: true,
                title: 'CarDealer Lviv B2B',
                welcomeText: 'Інвентар партнерів та статуси B2B-запитів.',
                layout: 'GRID',
                primaryColor: '#2AA876',
                accentColor: '#0B1F17',
                actions: [
                    { id: 'a_inv', label: 'Запити/інвентар', actionType: 'VIEW', value: 'INVENTORY', icon: 'LayoutGrid' },
                    { id: 'a_fav', label: 'Обране', actionType: 'VIEW', value: 'FAVORITES', icon: 'Star' },
                    { id: 'a_status', label: 'Статуси', actionType: 'VIEW', value: 'STATUS', icon: 'ClipboardList' }
                ],
                navItems: [
                    { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
                    { id: 'nav_stock', label: 'Мережа', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
                    { id: 'nav_saved', label: 'Обране', icon: 'Star', actionType: 'VIEW', value: 'FAVORITES' },
                    { id: 'nav_status', label: 'Статуси', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' }
                ],
                homeBlocks: [],
                showcaseSlug: target
            };
        }
        return {
            surfaceMode: 'LEAD',
            isEnabled: true,
            title: 'CarTié Premium',
            welcomeText: 'Ваш персональний помічник з підбору авто.',
            layout: 'GRID',
            primaryColor: '#D4AF37',
            accentColor: '#111',
            actions: [
                { id: 'a_inv', label: 'Інвентар', actionType: 'VIEW', value: 'INVENTORY', icon: 'LayoutGrid' },
                { id: 'a_req', label: 'Запит', actionType: 'VIEW', value: 'REQUEST', icon: 'Search' },
                { id: 'a_fav', label: 'Обране', actionType: 'VIEW', value: 'FAVORITES', icon: 'Star' }
            ],
            navItems: [
                { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
                { id: 'nav_stock', label: 'Склад', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
                { id: 'nav_saved', label: 'Обране', icon: 'Star', actionType: 'VIEW', value: 'FAVORITES' },
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
            setSelectedRequestCarIds([]);
            setIsConfigLoading(true);
            setInitError(null);
            setRequiresTelegram(false);
            const requestId = Math.random().toString(36).substring(7);
            emitMiniAppEvent('info', 'MiniApp init started', { requestId, slug });
            setConfigWarning(null);

            // 1. Initialize Telegram Web App & Extract start_param
            const telegramContext = await resolveTelegramBootstrapContext();
            cleanupViewport = initTelegramViewport(telegramContext.tg);
            let startParam = telegramContext.startParam || '';
            const resolvedUser = telegramContext.user;

            if (!telegramContext.isTelegramContext) {
                emitMiniAppEvent('warn', 'Telegram WebApp context not detected');
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
            emitMiniAppEvent('info', 'Telegram context detected', {
                platform,
                version,
                hasInitData: Boolean(telegramContext.initData)
            });
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
            emitMiniAppEvent('info', 'Resolved target slug', { resolvedSlug, rawSlug });

            // 3. Load Mini App Configuration
            try {
                const conf = await getMiniAppConfig(resolvedSlug);

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
                    emitMiniAppEvent('warn', 'Miniapp config missing nested payload, using fallback', { resolvedSlug });
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
                await loadFavorites(conf.publicSlug, {
                    tgUserId: resolvedUser?.id ? String(resolvedUser.id) : undefined,
                    visitorId
                });

            } catch (e) {
                emitMiniAppEvent('error', 'MiniApp init failed', { error: e instanceof Error ? e.message : String(e) });
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
                emitMiniAppEvent('warn', 'Fetch inventory failed', { error: e instanceof Error ? e.message : String(e) });
                pushToast('Не вдалося завантажити інвентар.', 'error');
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
            { id: 'nav_saved', label: 'Обране', icon: 'Star', actionType: 'VIEW', value: 'FAVORITES' }
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
                                        <Star size={14} className={isFavorite(getCarId(car)) ? 'text-yellow-400 fill-yellow-400' : 'text-white/70'} />
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
        return (
            <CatalogView
                surfaceMode={surfaceMode}
                primaryColor={primaryColor}
                tab={tab}
                search={search}
                showFilters={showFilters}
                filters={filters}
                sortBy={sortBy}
                filteredCars={applyFiltersAndSort()}
                onTabChange={setTab}
                onSearchChange={setSearch}
                onToggleFilters={() => setShowFilters(!showFilters)}
                onFiltersChange={setFilters}
                onSortChange={setSortBy}
                onResetFilters={() => {
                    setFilters({ brand: '', minYear: '', maxYear: '', minPrice: '', maxPrice: '' });
                    setSearch('');
                }}
                getCarId={getCarId}
                getCarImages={getCarImages}
                getCarSpecs={getCarSpecs}
                formatBrandModel={formatBrandModel}
                formatMileage={formatMileage}
                formatPrice={formatPrice}
                toNumberSafe={toNumberSafe}
                getStatusLabel={getStatusLabel}
                isFavorite={isFavorite}
                isSelectedForRequest={isSelectedForRequest}
                onOpenLightbox={(car) => { setLightboxCar(car); setLightboxImageIndex(0); }}
                onToggleFavorite={toggleFavorite}
                onPrimaryAction={(car) => surfaceMode === 'B2B' ? prefillRequestFromCar(car) : handleCarInterest(car)}
                onToggleRequestSelection={toggleRequestSelection}
                onOpenListing={openListing}
            />
        );
    };

    const renderFavorites = () => {
        return (
            <FavoritesView
                cars={cars}
                favorites={favorites}
                favoriteItems={favoriteItems}
                primaryColor={primaryColor}
                getCarId={getCarId}
                getCarImages={getCarImages}
                toNumberSafe={toNumberSafe}
                formatMileage={formatMileage}
                formatPrice={formatPrice}
                isSelectedForRequest={isSelectedForRequest}
                onToggleFavorite={toggleFavorite}
                onToggleRequestSelection={toggleRequestSelection}
                onOpenListing={openListing}
            />
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
                                <Star size={18} className={isFavorite(getCarId(selectedCar)) ? 'text-yellow-400 fill-yellow-400' : 'text-white/70'} />
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
                    <button
                        onClick={() => toggleRequestSelection(selectedCar)}
                        className="w-full py-2 rounded-xl font-bold text-xs border border-white/10 text-white/80"
                    >
                        {isSelectedForRequest(getCarId(selectedCar)) ? '✅ Авто у мультивиборі' : '➕ Додати авто до мультивибору'}
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
                const fallbackListingId = getCarId(selectedCar);
                const selectedListingIds = selectedRequestCarIds.length
                    ? selectedRequestCarIds
                    : (fallbackListingId ? [fallbackListingId] : []);
                const selectedTitles = selectedRequestCars.map(car => car.title).filter(Boolean);
                const listingId = selectedListingIds[0] || undefined;
                const descriptionParts = [
                    reqData.brand ? `Марка/модель: ${reqData.brand}` : null,
                    reqData.yearMin ? `Рік: ${reqData.yearMin}+` : null,
                    reqData.budgetMin ? `Бюджет: ${reqData.budgetMin}` : null,
                    reqMileage ? `Пробіг: ${reqMileage}` : null,
                    reqFuel ? `Пальне: ${reqFuel}` : null,
                    reqCompany ? `Компанія: ${reqCompany}` : null,
                    reqComment ? `Коментар: ${reqComment}` : null,
                    reqPhone ? `Контакт: ${reqPhone}` : null,
                    selectedTitles.length > 1 ? `Обрані авто: ${selectedTitles.join(', ')}` : null
                ].filter(Boolean);

                const requestPayload = {
                    slug,
                    initData,
                    title: selectedTitles.length > 1
                        ? `${isB2BMode ? 'B2B запит' : 'Запит'}: ${selectedTitles.length} авто`
                        : (listingId && selectedCar?.title
                            ? `${isB2BMode ? 'B2B запит' : 'Запит'}: ${selectedCar.title}`
                            : `${isB2BMode ? 'B2B запит' : 'Запит'}: ${reqData.brand || 'Авто'} ${reqData.yearMin || ''}`.trim()),
                    description: descriptionParts.length ? descriptionParts.join('\n') : undefined,
                    budgetMax: reqData.budgetMax ? Number(reqData.budgetMax) : undefined,
                    yearMin: reqData.yearMin ? Number(reqData.yearMin) : undefined,
                    phone: reqPhone || undefined,
                    comment: reqComment || undefined,
                    carListingId: listingId || undefined,
                    carListingIds: selectedListingIds.length ? selectedListingIds : undefined,
                    payload: {
                        mode: isB2BMode ? 'B2B' : 'LEAD',
                        mileage: reqMileage || undefined,
                        fuel: reqFuel || undefined,
                        companyName: reqCompany || undefined,
                        selectedCars: selectedTitles.length ? selectedTitles : undefined
                    },
                    tracking: trackingMeta,
                    telegram: {
                        userId: tgUser?.id ? String(tgUser.id) : undefined,
                        username: tgUser?.username,
                        name: [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ')
                    }
                };

                await createMiniAppRequest(requestPayload);
                clearRequestSelection();

                if (tg && tg.initData) {
                    tg.HapticFeedback?.notificationOccurred?.('success');
                }
                setReqStep(5);
                pushToast('Запит надіслано.', 'success');
            } catch (e) {
                emitMiniAppEvent('error', 'MiniApp request submit failed', { error: e instanceof Error ? e.message : String(e) });
                const message = resolveMiniAppWriteError(e, 'Не вдалося надіслати запит.');
                pushToast(message, 'error');
            }
        }
    };

    const renderRequest = () => (
        <RequestView
            reqStep={reqStep}
            reqData={reqData}
            setReqData={setReqData}
            reqMileage={reqMileage}
            setReqMileage={setReqMileage}
            reqFuel={reqFuel}
            setReqFuel={setReqFuel}
            reqCompany={reqCompany}
            setReqCompany={setReqCompany}
            reqPhone={reqPhone}
            setReqPhone={setReqPhone}
            reqComment={reqComment}
            setReqComment={setReqComment}
            selectedCarsCount={selectedRequestCarIds.length}
            selectedCarsPreview={selectedRequestCars.map(car => car.title).filter(Boolean).slice(0, 3)}
            onClearSelectedCars={clearRequestSelection}
            hasTelegramInit={hasTelegramInit}
            primaryColor={primaryColor}
            surfaceMode={surfaceMode}
            manualContactMode={!hasTelegramInit}
            showInlineAction={true}
            actionLabel={reqStep >= 4 ? 'Надіслати запит' : 'Далі'}
            actionDisabled={reqStep === 4 && !hasTelegramInit}
            onNextStep={handleNextStep}
            onHome={() => { setReqStep(1); setView('HOME'); }}
        />
    );

    const renderProfile = () => (
        <ProfileView
            tgUser={tgUser}
            primaryColor={primaryColor}
            favoriteCount={favoriteItems.length}
            createdRequestCount={reqStep >= 3 ? 1 : 0}
            onCloseApp={() => (window as any).Telegram?.WebApp?.close?.()}
        />
    );

    const renderSelectionBar = () => {
        if (!selectedRequestCarIds.length) return null;
        if (view === 'REQUEST' || view === 'STATUS') return null;
        return (
            <div className="absolute bottom-20 left-4 right-4 z-30">
                <div className="bg-[#111214] border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur">
                    <div className="text-xs text-white/60 mb-2">
                        Обрано авто: <span className="text-white font-bold">{selectedRequestCarIds.length}</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={openRequestForSelectedCars}
                            className="flex-1 py-2.5 rounded-xl font-bold text-black text-sm"
                            style={{ backgroundColor: primaryColor }}
                        >
                            Надіслати запит
                        </button>
                        <button
                            onClick={clearRequestSelection}
                            className="px-3 py-2.5 rounded-xl font-bold text-xs border border-white/10 text-white/80"
                        >
                            Очистити
                        </button>
                    </div>
                </div>
            </div>
        );
    };

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
            case 'Star': return <Star {...props} />;
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

    const shellNavItems = navItems.map(item => ({
        id: String(item.id),
        value: String(item.value || ''),
        label: String(item.label || ''),
        icon: renderIcon(item.icon, 24)
    }));

    return (
        <>
            <ToastStack items={toasts} onDismiss={dismissToast} />
            <MiniAppShell
                configWarning={configWarning}
                showBackArrow={showBackArrow}
                onBack={goBack}
                showBottomNav={showBottomNav}
                navItems={shellNavItems}
                activeView={view}
                onNavigate={(value) => {
                    const target = navItems.find(item => String(item.value || '') === value);
                    if (!target) return;
                    handleAction(target as any);
                }}
            >
                {view === 'HOME' && renderHome()}
                {view === 'INVENTORY' && renderInventory()}
                {view === 'FAVORITES' && renderFavorites()}
                {view === 'LISTING' && renderListing()}
                {view === 'REQUEST' && renderRequest()}
                {view === 'STATUS' && renderStatus()}
                {view === 'PROFILE' && renderProfile()}
                {renderSelectionBar()}

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
            </MiniAppShell>
        </>
    );
};

export const MiniApp = () => (
    <ErrorBoundary>
        <MiniAppContent />
    </ErrorBoundary>
);
