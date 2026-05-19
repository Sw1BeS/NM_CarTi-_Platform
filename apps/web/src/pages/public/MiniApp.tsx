
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Bot, MiniAppConfig, CarListing } from '../../types';
import { getPublicInventory } from '../../services/publicApi';
import { createMiniAppLeadIntent, createMiniAppRequest, getMiniAppB2BPartnerPortal, getMiniAppB2bActiveRequests, getMiniAppB2bMyRequests, getMiniAppB2bReceivedVariants, getMiniAppCar, getMiniAppConfig, getMiniAppFavorites, getMiniAppRequestStatus, getMiniAppShowcaseInventory, getMiniAppVehicleTaxonomy, requestMiniAppB2BAccess, setMiniAppB2bVariantDecision, startMiniAppBotFlow, submitMiniAppB2bOffer, toggleMiniAppFavorite, trackMiniAppEvent, type MiniAppB2BPartnerPortalResponse, type MiniAppB2bActiveRequestItem, type MiniAppB2bMyRequestItem, type MiniAppB2bReceivedVariantItem, type MiniAppRequestSubtype, type MiniAppTrackingMeta, type VehicleTaxonomyResponse } from '../../services/miniappApi';
import {
    Search, LayoutGrid, User, Plus, Filter, DollarSign, Car, Truck,
    MessageSquare, Zap, List as ListIcon, Star, Phone, Home, Heart, ClipboardList,
    ChevronRight, MapPin, Calendar, CheckCircle, SlidersHorizontal,
    X, ChevronLeft, ChevronRight as ChevronRightIcon, Image as ImageIcon, Loader2, Share2, Globe, Instagram,
    Send, MapPinned, Youtube, Video, ShieldCheck
} from 'lucide-react';
import { initTelegramViewport } from './miniapp/telegramViewport';
import {
    parseTelegramUserFromInitData,
    readRuntimeTelegramInitData,
    resolveTelegramLaunchContext,
    type TgUser
} from './miniapp/telegramLaunch';
import { popViewHistory, pushViewHistory } from './miniapp/navigation';
import { ToastStack, useToasts } from '../../components/ui/Toast';
import { MiniAppShell } from './miniapp/MiniAppShell';
import { CatalogView } from './miniapp/views/CatalogView';
import { FavoritesView } from './miniapp/views/FavoritesView';
import { ProfileView } from './miniapp/views/ProfileView';
import { RequestView, type RequestFormData } from './miniapp/views/RequestView';
import { MiniAppImage } from './miniapp/components/MiniAppImage';
import { isMiniAppReadOnlyLaunch, parseMiniAppEntryIntent, resolveMiniAppInternalLinkIntent, type MiniAppEntryIntent } from './miniapp/entryIntent';
import { resolveLeadIntentOutcome } from './miniapp/leadIntentOutcome';
import { resolveMiniAppMetaTracking, resolveMiniAppSubmitEventType, resolveMiniAppViewEventType, type MiniAppMetaCookieWrite } from './miniapp/trackingEvents';

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

const readCookie = (name: string) => {
    if (typeof document === 'undefined') return undefined;
    const match = document.cookie
        .split(';')
        .map(part => part.trim())
        .find(part => part.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
};

const persistMetaTrackingCookies = (cookies: MiniAppMetaCookieWrite[]) => {
    if (typeof document === 'undefined' || !cookies.length) return;
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
    for (const cookie of cookies) {
        document.cookie = `${cookie.name}=${encodeURIComponent(cookie.value)}; Max-Age=7776000; Path=/; SameSite=Lax${secure}`;
    }
};

const hasTelegramUserAgent = () => {
    if (typeof navigator === 'undefined') return false;
    return /telegram/i.test(navigator.userAgent || '');
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
type TelegramWriteState = 'unknown' | 'ready' | 'outside_telegram' | 'missing_initdata' | 'read_only_preview' | 'invalid_initdata';
type MiniAppSurfaceMode = 'LEAD' | 'B2B';
type MiniAppView = 'HOME' | 'INVENTORY' | 'LISTING' | 'FAVORITES' | 'REQUEST' | 'STATUS' | 'B2B_REQUESTS' | 'OFFER' | 'PROFILE' | 'SUPPORT' | 'CONTACTS';
type RequestType = 'BUY' | 'SELL';
type RequestSubtype = MiniAppRequestSubtype;
type B2BOfferForm = {
    requestRef: string;
    title: string;
    price: string;
    year: string;
    mileage: string;
    location: string;
    condition: string;
    comment: string;
    contact: string;
    mediaUrl: string;
};

const buildEmptyB2BOfferForm = (requestRef = ''): B2BOfferForm => ({
    requestRef,
    title: '',
    price: '',
    year: '',
    mileage: '',
    location: '',
    condition: '',
    comment: '',
    contact: '',
    mediaUrl: ''
});

const deriveRequestSubtype = (ids: string[]): RequestSubtype => {
    const count = Array.from(new Set(ids.filter(Boolean))).length;
    if (count > 1) return 'MULTI_SELECT';
    if (count === 1) return 'SPECIFIC';
    return 'GENERAL';
};

const taxonomyId = (value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, '-').replace(/^-+|-+$/g, '') || 'other';

const isBrowserImageUrl = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const src = value.trim();
    return /^(https?:\/\/|\/|data:image\/)/i.test(src);
};

const resolveMiniAppWriteError = (error: unknown, fallback = 'Не вдалося виконати дію.') => {
    const message = error instanceof Error ? String(error.message || '').trim() : '';
    const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code || '') : '';
    const status = typeof error === 'object' && error && 'status' in error ? Number((error as any).status) : undefined;
    if (code === 'TELEGRAM_INITDATA_REQUIRED' || code === 'TELEGRAM_INITDATA_INVALID' || code === 'TELEGRAM_INITDATA_EXPIRED') {
        return 'Сесія Telegram застаріла. Відкрийте Mini App повторно через кнопку меню бота.';
    }
    if (code === 'VALIDATION_ERROR') {
        return message || 'Перевірте заповнення форми.';
    }
    if (code === 'CONTACT_REQUEST_SEND_FAILED') {
        return 'Запит збережено, але бот не зміг попросити контакт. Відкрийте чат з ботом і натисніть /start.';
    }
    if (code === 'RATE_LIMITED') {
        return 'Забагато запитів за короткий час. Спробуйте трохи пізніше або напишіть менеджеру в боті.';
    }
    if (status === 0) {
        return 'Не вдалося підключитися до сервера. Перевірте інтернет і повторіть спробу.';
    }
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
    if (lower.includes('network') || lower.includes('failed to fetch') || lower.includes('aborted')) {
        return 'Не вдалося підключитися до сервера. Перевірте інтернет і повторіть спробу.';
    }
    return message;
};

const PREMIUM_SILVER = '#C9CDD3';
const premiumCtaStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #f7f8fa 0%, #d7dbe1 34%, #a4abb4 68%, #f1f3f6 100%)',
    color: '#101216',
    boxShadow: '0 12px 26px rgba(210,216,224,0.18), inset 0 1px 0 rgba(255,255,255,0.86)'
};
const graphitePanelStyle: React.CSSProperties = {
    background: 'linear-gradient(145deg, rgba(37,41,46,0.94) 0%, rgba(17,19,22,0.98) 58%, rgba(8,9,11,1) 100%)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 18px 45px rgba(0,0,0,0.34)'
};

const normalizeMiniAppAccent = (value?: string) => {
    const raw = String(value || '').trim();
    if (!raw) return PREMIUM_SILVER;
    if (/teal|cyan|turquoise|#2aa876|#14b8a6|#06b6d4|#00/i.test(raw)) return PREMIUM_SILVER;
    return PREMIUM_SILVER;
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
    const [telegramWriteState, setTelegramWriteState] = useState<TelegramWriteState>('unknown');
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
    const [lightboxImageLoaded, setLightboxImageLoaded] = useState(false);
    const [lightboxImageError, setLightboxImageError] = useState(false);
    const lightboxTouchStartRef = useRef<{ x: number; y: number } | null>(null);

    // Request Form State
    const [reqStep, setReqStep] = useState(1);
    const [reqData, setReqData] = useState<RequestFormData>({
        brand: '',
        model: '',
        brands: [],
        models: [],
        bodyTypes: [],
        budgetMin: '',
        budgetMax: '',
        yearMin: '',
        yearMax: '',
        city: '',
        brandSearch: '',
        modelSearch: '',
        bodyType: '',
        brandCustom: '',
        modelCustom: ''
    });
    const [vehicleTaxonomy, setVehicleTaxonomy] = useState<VehicleTaxonomyResponse | null>(null);
    const [reqMileage, setReqMileage] = useState('');
    const [reqFuel, setReqFuel] = useState('');
    const [reqCompany, setReqCompany] = useState('');
    const [requestType, setRequestType] = useState<RequestType>('BUY');
    const [isRequestSubmitting, setIsRequestSubmitting] = useState(false);
    const [requestSubmitError, setRequestSubmitError] = useState<{ message: string; openBotUrl?: string } | null>(null);
    const [statusQuery, setStatusQuery] = useState({ publicId: '' });
    const [statusResult, setStatusResult] = useState<any>(null);
    const [b2bPortal, setB2bPortal] = useState<MiniAppB2BPartnerPortalResponse | null>(null);
    const [b2bPortalLoading, setB2bPortalLoading] = useState(false);
    const [b2bAccessRequesting, setB2bAccessRequesting] = useState(false);
    const [b2bAccessRequestStatus, setB2bAccessRequestStatus] = useState<string | null>(null);
    const [b2bActiveRequests, setB2bActiveRequests] = useState<MiniAppB2bActiveRequestItem[]>([]);
    const [b2bActiveRequestsLoading, setB2bActiveRequestsLoading] = useState(false);
    const [b2bActiveRequestsError, setB2bActiveRequestsError] = useState<string | null>(null);
    const [b2bMyRequests, setB2bMyRequests] = useState<MiniAppB2bMyRequestItem[]>([]);
    const [b2bReceivedVariants, setB2bReceivedVariants] = useState<MiniAppB2bReceivedVariantItem[]>([]);
    const [b2bActivityLoading, setB2bActivityLoading] = useState(false);
    const [b2bActivityError, setB2bActivityError] = useState<string | null>(null);
    const [b2bDecisionLoadingId, setB2bDecisionLoadingId] = useState<string | null>(null);
    const [b2bOfferForm, setB2bOfferForm] = useState<B2BOfferForm>(() => buildEmptyB2BOfferForm());
    const [b2bOfferSubmitting, setB2bOfferSubmitting] = useState(false);
    const [b2bOfferError, setB2bOfferError] = useState<string | null>(null);
    const [b2bOfferSuccess, setB2bOfferSuccess] = useState<{ requestRef: string; variantTitle?: string } | null>(null);
    const [trackingMeta, setTrackingMeta] = useState<MiniAppTrackingMeta>({});
    const [reqComment, setReqComment] = useState('');
    const { toasts, pushToast, dismissToast } = useToasts();
    const currentInitData = initData || readRuntimeTelegramInitData();
    const hasTelegramInit = Boolean(currentInitData);
    const readOnlyPreview = !hasTelegramInit && isMiniAppReadOnlyLaunch(new URLSearchParams(window.location.search), trackingMeta.startParam);
    const viewHistoryRef = useRef<MiniAppView[]>(['HOME']);
    const suppressHistoryPushRef = useRef(false);
    const requestSubmitIdRef = useRef<string | null>(null);

    const buildSafeRuntimeDiagnostics = (extra: Record<string, unknown> = {}) => {
        const params = new URLSearchParams(window.location.search);
        const tg = (window as any).Telegram?.WebApp;
        return {
            slug: targetSlug || slug || undefined,
            view,
            entry: params.get('entry') || undefined,
            status: params.get('status') || undefined,
            availabilityState: params.get('availabilityState') || undefined,
            type: params.get('type') || params.get('requestType') || undefined,
            startParam: trackingMeta.startParam,
            hasInitData: Boolean(initData || readRuntimeTelegramInitData()),
            platform: tg?.platform || (hasTelegramUserAgent() ? 'telegram-ua' : 'browser'),
            version: tg?.version || undefined,
            ...extra
        };
    };

    const resolveOpenBotUrl = (override?: string) => {
        if (override) return override;
        const username = String(
            (activeBot as any)?.botUsername
            || activeBot?.username
            || (config as any)?.botUsername
            || (config as any)?.username
            || ''
        ).replace(/^@+/, '').trim();
        return username ? `https://t.me/${username}` : undefined;
    };

    const openBotUrl = (override?: string) => {
        const link = resolveOpenBotUrl(override);
        if (!link) return;
        const tg = (window as any).Telegram?.WebApp;
        if (/^https:\/\/t\.me\//i.test(link) && tg?.openTelegramLink) {
            tg.openTelegramLink(link);
            return;
        }
        if (/^https?:\/\//i.test(link) && tg?.openLink) {
            tg.openLink(link);
            return;
        }
        window.open(link, '_blank');
    };

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

    useEffect(() => {
        setLightboxImageLoaded(false);
        setLightboxImageError(false);
    }, [lightboxCar, lightboxImageIndex]);

    useEffect(() => {
        if (initData) return;

        const syncRuntimeInitData = () => {
            const nextInitData = readRuntimeTelegramInitData();
            if (!nextInitData) return false;
            setInitData(nextInitData);
            setTelegramWriteState('ready');
            const nextUser = parseTelegramUserFromInitData(nextInitData);
            if (nextUser) setTgUser(nextUser);
            setConfigWarning(prev => prev === 'Telegram відкрив Mini App без захищеної сесії. Закрийте це вікно і відкрийте Mini App кнопкою в чаті бота.' ? null : prev);
            return true;
        };

        if (syncRuntimeInitData()) return;

        const intervalId = window.setInterval(syncRuntimeInitData, 500);
        const timeoutId = window.setTimeout(() => window.clearInterval(intervalId), 10000);
        return () => {
            window.clearInterval(intervalId);
            window.clearTimeout(timeoutId);
        };
    }, [initData]);

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
        const presentationUrls = (car.presentation?.mediaUrls || []).filter(isBrowserImageUrl);
        const itemUrls = (car.mediaItems || [])
            .flatMap(item => [item.url, item.previewUrl])
            .filter(isBrowserImageUrl);
        const urlList = (car.mediaUrls || []).filter(isBrowserImageUrl);
        const combined = car.thumbnail ? [car.thumbnail, ...presentationUrls, ...itemUrls, ...urlList] : [...presentationUrls, ...itemUrls, ...urlList];
        return Array.from(new Set(combined.filter(isBrowserImageUrl)));
    };

    const moveLightbox = useCallback((direction: -1 | 1) => {
        if (!lightboxCar) return;
        const images = getCarImages(lightboxCar);
        if (images.length < 2) return;
        setLightboxImageIndex(prev => Math.min(images.length - 1, Math.max(0, prev + direction)));
    }, [lightboxCar]);

    useEffect(() => {
        if (!lightboxCar) return;
        const images = getCarImages(lightboxCar);
        const next = images[lightboxImageIndex + 1];
        const prev = images[lightboxImageIndex - 1];
        [next, prev].filter(Boolean).forEach((src) => {
            const image = new Image();
            image.src = src as string;
        });
    }, [lightboxCar, lightboxImageIndex]);

    const shareLightboxCar = async () => {
        if (!lightboxCar) return;
        const carId = getCarId(lightboxCar);
        const shareUrl = `${window.location.origin}${window.location.pathname}?entry=inventory${carId ? `&carId=${encodeURIComponent(carId)}` : ''}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: lightboxCar.title,
                    text: lightboxCar.title,
                    url: shareUrl
                });
            } else {
                await navigator.clipboard?.writeText(shareUrl);
                pushToast('Посилання скопійовано.', 'success');
            }
            trackEvent('car_shared', { carListingId: carId });
        } catch (error) {
            emitMiniAppEvent('warn', 'Share failed or cancelled', {
                error: error instanceof Error ? error.message : String(error),
                carId
            });
        }
    };

    const getCarId = (car?: CarListing | null) => car?.canonicalId || car?.id || '';

    const isFavorite = (carId: string) => favorites.includes(carId);
    const isSelectedForRequest = (carId: string) => selectedRequestCarIds.includes(carId);

    const toggleRequestSelection = (car: CarListing) => {
        const carId = getCarId(car);
        if (!carId) return;
        setSelectedRequestCarIds(prev => {
            return prev.includes(carId) ? prev.filter(id => id !== carId) : [...prev, carId];
        });
    };

    const clearRequestSelection = () => {
        setSelectedRequestCarIds([]);
    };

    const openRequest = (type: RequestType = 'BUY', options: { selectedIds?: string[]; startStep?: number } = {}) => {
        setRequestType(type);
        setReqStep(options.startStep || 1);
        setRequestSubmitError(null);
        setView('REQUEST');
    };

    const openB2BOffer = (requestRef = '') => {
        setB2bOfferForm(buildEmptyB2BOfferForm(requestRef));
        setB2bOfferError(null);
        setB2bOfferSuccess(null);
        setView('OFFER');
    };

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

    const trackEvent = useCallback((eventType: string, payload: Record<string, unknown> = {}) => {
        const slugValue = targetSlug || slug || 'system';
        const eventInitData = initData || readRuntimeTelegramInitData();
        trackMiniAppEvent({
            slug: slugValue,
            eventType,
            initData: eventInitData || undefined,
            visitorId,
            tgUserId: tgUser?.id ? String(tgUser.id) : undefined,
            carListingId: typeof payload.carListingId === 'string' ? payload.carListingId : undefined,
            view,
            payload,
            tracking: trackingMeta
        }).catch((error) => {
            emitMiniAppEvent('warn', 'Failed to track MiniApp event', {
                eventType,
                error: error instanceof Error ? error.message : String(error)
            });
        });
    }, [initData, slug, targetSlug, tgUser?.id, trackingMeta, view, visitorId]);

    const resolveWriteFailureMessage = (error: unknown, fallback: string, payload: Record<string, unknown> = {}) => {
        const code = typeof error === 'object' && error && 'code' in error ? String((error as any).code || '') : '';
        const message = resolveMiniAppWriteError(error, fallback);
        if (['TELEGRAM_INITDATA_INVALID', 'TELEGRAM_INITDATA_EXPIRED'].includes(code)) {
            setTelegramWriteState('invalid_initdata');
            setConfigWarning(message);
            trackEvent('write_rejected_invalid_initdata', { ...payload, code });
        }
        return message;
    };

    const toggleFavorite = async (car: CarListing) => {
        const id = getCarId(car);
        if (!id) return;
        const favoriteInitData = initData || readRuntimeTelegramInitData();
        if (!initData && favoriteInitData) setInitData(favoriteInitData);
        const identity = {
            tgUserId: tgUser?.id ? String(tgUser.id) : undefined,
            visitorId
        };
        try {
            const res = await toggleMiniAppFavorite(id, { ...identity, slug: targetSlug || 'system', initData: favoriteInitData || undefined });
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
            trackEvent(res.action === 'removed' ? 'favorite_removed' : 'favorite_added', { carListingId: id });
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
        setSelectedCar(car);
        setReqData({
            brand: car.title || '',
            model: '',
            brands: car.title ? [car.title] : [],
            models: [],
            bodyTypes: [],
            budgetMin: '',
            budgetMax: String(car.price?.amount || ''),
            yearMin: String(car.year || ''),
            yearMax: '',
            city: '',
            brandSearch: '',
            modelSearch: '',
            bodyType: '',
            brandCustom: '',
            modelCustom: ''
        });
        setReqMileage(String(toNumberSafe(car.mileage) || ''));
        setReqFuel(specs.fuel || '');
        setReqComment('');
        if (carId) {
            setSelectedRequestCarIds([carId]);
        }
        openRequest('BUY', { selectedIds: carId ? [carId] : [], startStep: carId ? 4 : 1 });
    };

    const openRequestForSelectedCars = () => {
        if (!selectedRequestCarIds.length) return;
        if (!reqData.brand && selectedRequestCars[0]) {
            const first = selectedRequestCars[0];
            setReqData({
                brand: first.title || '',
                model: '',
                brands: first.title ? [first.title] : [],
                models: [],
                bodyTypes: [],
                budgetMin: '',
                budgetMax: String(first.price?.amount || ''),
                yearMin: String(first.year || ''),
                yearMax: '',
                city: '',
                brandSearch: '',
                modelSearch: '',
                bodyType: '',
                brandCustom: '',
                modelCustom: ''
            });
        }
        openRequest('BUY', { selectedIds: selectedRequestCarIds, startStep: selectedRequestCarIds.length ? 4 : 1 });
    };

    const buildFallbackConfig = (target: string, mode: MiniAppSurfaceMode = 'LEAD'): MiniAppConfig => {
        if (mode === 'B2B') {
            return {
                surfaceMode: 'B2B',
                isEnabled: true,
                title: 'CarDealer Lviv B2B',
                welcomeText: 'Інвентар партнерів та статуси B2B-запитів.',
                layout: 'GRID',
                primaryColor: PREMIUM_SILVER,
                accentColor: '#15181C',
                actions: [
                    { id: 'a_deals', label: 'Мої угоди (B2B)', actionType: 'VIEW', value: 'STATUS', icon: 'ClipboardList' },
                    { id: 'a_inv', label: 'Склад (B2B)', actionType: 'VIEW', value: 'INVENTORY', icon: 'LayoutGrid' },
                    { id: 'a_support', label: 'Підтримка', actionType: 'VIEW', value: 'SUPPORT', icon: 'MessageCircle' }
                ],
                navItems: [
                    { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
                    { id: 'nav_deals', label: 'Угоди', icon: 'ClipboardList', actionType: 'VIEW', value: 'STATUS' },
                    { id: 'nav_stock', label: 'Склад', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
                    { id: 'nav_support', label: 'Підтримка', icon: 'MessageCircle', actionType: 'VIEW', value: 'SUPPORT' },
                    { id: 'nav_profile', label: 'Профіль', icon: 'User', actionType: 'VIEW', value: 'PROFILE' }
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
            primaryColor: PREMIUM_SILVER,
            accentColor: '#111',
            actions: [
                { id: 'a_stock', label: 'Авто в наявності', actionType: 'VIEW', value: 'INVENTORY_STOCK', icon: 'Car' },
                { id: 'a_transit', label: 'Авто в дорозі', actionType: 'VIEW', value: 'INVENTORY_TRANSIT', icon: 'Truck' },
                { id: 'a_req', label: 'Підбір за параметрами', actionType: 'VIEW', value: 'REQUEST', icon: 'Search' },
                { id: 'a_contacts', label: 'Звʼязатися', actionType: 'VIEW', value: 'CONTACTS', icon: 'MessageCircle' }
            ],
            navItems: [
                { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
                { id: 'nav_stock', label: 'Каталог', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
                { id: 'nav_request', label: 'Заявки', icon: 'Search', actionType: 'VIEW', value: 'REQUEST' },
                { id: 'nav_contacts', label: 'Контакти', icon: 'MessageCircle', actionType: 'VIEW', value: 'CONTACTS' },
                { id: 'nav_profile', label: 'Профіль', icon: 'User', actionType: 'VIEW', value: 'PROFILE' }
            ],
            homeBlocks: [],
            showcaseSlug: target
        };
    };

    const applyEntryIntent = (intent: MiniAppEntryIntent) => {
        if (intent.tab) setTab(intent.tab);
        if (intent.requestType) setRequestType(intent.requestType);
        if (intent.view) {
            if (intent.view === 'REQUEST') setReqStep(1);
            suppressHistoryPushRef.current = true;
            setView(intent.view);
        }
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
            setTelegramWriteState('unknown');
            setB2bPortal(null);
            setB2bPortalLoading(false);
            setB2bAccessRequestStatus(null);
            const requestId = Math.random().toString(36).substring(7);
            emitMiniAppEvent('info', 'MiniApp init started', { requestId, slug });
            setConfigWarning(null);

            // 1. Initialize Telegram Web App & Extract start_param
            const telegramContext = await resolveTelegramLaunchContext();
            cleanupViewport = initTelegramViewport(telegramContext.tg);
            let startParam = telegramContext.startParam || '';
            const resolvedUser = telegramContext.user;
            const urlParams = new URLSearchParams(window.location.search);
            const isReadOnlyLaunch = isMiniAppReadOnlyLaunch(urlParams, startParam);

            if (!telegramContext.isTelegramContext && !isReadOnlyLaunch) {
                emitMiniAppEvent('warn', 'Telegram WebApp context not detected');
                setRequiresTelegram(true);
                setTelegramWriteState('outside_telegram');
                setInitData(undefined);
                setTgUser(null);
                setConfig(null);
                setIsConfigLoading(false);
                setInitError('Mini App потрібно відкривати з меню Telegram-бота.');
                return;
            }

            const platform = telegramContext.platform;
            const version = telegramContext.version;
            const launchCarId = String(urlParams.get('carId') || urlParams.get('carListingId') || '').trim();
            const safeLaunchMeta = {
                slug: slug || undefined,
                pathname: window.location.pathname,
                entry: urlParams.get('entry') || undefined,
                status: urlParams.get('status') || undefined,
                type: urlParams.get('type') || urlParams.get('requestType') || undefined,
                startParam: startParam || undefined,
                routeSource: telegramContext.startParamSource || (startParam ? 'start_param' : 'path'),
                platform,
                version,
                hasBridge: telegramContext.hasBridge,
                isTelegramContext: telegramContext.isTelegramContext,
                isReadOnlyLaunch,
                hasInitData: Boolean(telegramContext.initData)
            };
            emitMiniAppEvent('info', 'Telegram context detected', {
                ...safeLaunchMeta,
                platform,
                version,
                hasInitData: Boolean(telegramContext.initData)
            });
            setTgUser(resolvedUser);
            setInitData(telegramContext.initData);
            if (!telegramContext.initData && !isReadOnlyLaunch) {
                setTelegramWriteState('missing_initdata');
                setConfigWarning('Telegram відкрив Mini App без захищеної сесії. Закрийте це вікно і відкрийте Mini App кнопкою в чаті бота.');
            } else if (telegramContext.initData) {
                setTelegramWriteState('ready');
            } else {
                setTelegramWriteState('read_only_preview');
            }

            const rawEntryIntent = parseMiniAppEntryIntent(urlParams, startParam);
            const utm = {
                source: urlParams.get('utm_source') || undefined,
                medium: urlParams.get('utm_medium') || undefined,
                campaign: urlParams.get('utm_campaign') || undefined,
                content: urlParams.get('utm_content') || undefined,
                term: urlParams.get('utm_term') || undefined
            };
            const ref = urlParams.get('ref') || urlParams.get('source') || undefined;
            const openEventId = window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `miniapp_open_${Date.now()}_${Math.random().toString(16).slice(2)}`;
            const fbclid = urlParams.get('fbclid') || undefined;
            const metaTracking = resolveMiniAppMetaTracking({
                fbclid,
                existingFbp: readCookie('_fbp'),
                existingFbc: readCookie('_fbc')
            });
            persistMetaTrackingCookies(metaTracking.cookiesToPersist);
            const baseTrackingMeta: MiniAppTrackingMeta = {
                startParam: startParam || undefined,
                utm,
                ref,
                entrypoint: window.location.pathname,
                referrer: document.referrer || undefined,
                miniappVersion: buildVersion,
                buildSha: buildVersion,
                fbclid: metaTracking.fbclid,
                fbp: metaTracking.fbp,
                fbc: metaTracking.fbc,
                eventSourceUrl: window.location.href,
                actionSource: 'website'
            };
            setTrackingMeta(baseTrackingMeta);

            // 2. Determine Target Slug (priority: URL slug > non-entry start_param > system)
            const rawSlug = slug || (rawEntryIntent.consumedStartParam ? '' : startParam) || 'system';
            const resolvedSlug = normalizeSlug(rawSlug) || 'system';
            emitMiniAppEvent('info', 'Resolved target slug', { ...safeLaunchMeta, resolvedSlug, rawSlug });
            trackMiniAppEvent({
                slug: resolvedSlug,
                eventType: 'MiniAppOpen',
                initData: telegramContext.initData || undefined,
                visitorId,
                tgUserId: resolvedUser?.id ? String(resolvedUser.id) : undefined,
                view: 'HOME',
                payload: { ...safeLaunchMeta, resolvedSlug, requestId },
                tracking: {
                    ...baseTrackingMeta,
                    eventId: openEventId
                }
            }).catch((error) => {
                emitMiniAppEvent('warn', 'Failed to track MiniApp open', {
                    error: error instanceof Error ? error.message : String(error)
                });
            });
            trackMiniAppEvent({
                slug: resolvedSlug,
                eventType: 'miniapp_launch_diagnostics',
                initData: telegramContext.initData || undefined,
                visitorId,
                tgUserId: resolvedUser?.id ? String(resolvedUser.id) : undefined,
                view: 'HOME',
                payload: { ...safeLaunchMeta, resolvedSlug, requestId },
                tracking: {
                    ...baseTrackingMeta
                }
            }).catch((error) => {
                emitMiniAppEvent('warn', 'Failed to track MiniApp launch diagnostics', {
                    error: error instanceof Error ? error.message : String(error)
                });
            });

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

                if (resolvedMode === 'B2B') {
                    if (telegramContext.initData) {
                        setB2bPortalLoading(true);
                        try {
                            const portal = await getMiniAppB2BPartnerPortal({
                                slug: conf.publicSlug || resolvedSlug,
                                initData: telegramContext.initData
                            });
                            setB2bPortal(portal);
                        } catch (error) {
                            emitMiniAppEvent('warn', 'Failed to load B2B partner portal state', {
                                resolvedSlug,
                                error: error instanceof Error ? error.message : String(error)
                            });
                            setB2bPortal({
                                ok: true,
                                approved: false,
                                reason: 'PARTNER_NOT_APPROVED',
                                user: {
                                    telegramUserId: resolvedUser?.id ? String(resolvedUser.id) : undefined,
                                    username: resolvedUser?.username,
                                    name: [resolvedUser?.first_name, resolvedUser?.last_name].filter(Boolean).join(' ') || undefined
                                }
                            });
                        } finally {
                            setB2bPortalLoading(false);
                        }
                    } else {
                        setB2bPortal({
                            ok: true,
                            approved: false,
                            reason: 'TELEGRAM_INITDATA_REQUIRED',
                            user: {
                                telegramUserId: resolvedUser?.id ? String(resolvedUser.id) : undefined,
                                username: resolvedUser?.username,
                                name: [resolvedUser?.first_name, resolvedUser?.last_name].filter(Boolean).join(' ') || undefined
                            }
                        });
                    }
                }

                // Load favorites
                await loadFavorites(conf.publicSlug, {
                    tgUserId: resolvedUser?.id ? String(resolvedUser.id) : undefined,
                    visitorId
                });
                const entryIntent = parseMiniAppEntryIntent(urlParams, startParam, resolvedMode);
                emitMiniAppEvent('info', 'Resolved MiniApp entry intent', {
                    ...safeLaunchMeta,
                    resolvedSlug,
                    surfaceMode: resolvedMode,
                    view: entryIntent.view,
                    tab: entryIntent.tab,
                    requestType: entryIntent.requestType,
                    botFlow: entryIntent.botFlow
                });

                if (resolvedMode === 'LEAD' && entryIntent.botFlow === 'SELL') {
                    if (telegramContext.initData) {
                        await startMiniAppBotFlow({
                            slug: conf.publicSlug || resolvedSlug,
                            initData: telegramContext.initData,
                            flow: 'SELL'
                        });
                        closeMiniAppOrShowSuccess('Бот відкрив сценарій продажу авто у чаті.');
                    } else {
                        emitMiniAppEvent('warn', 'Lead sell handoff blocked without initData', {
                            ...safeLaunchMeta,
                            resolvedSlug
                        });
                        setConfigWarning('Продаж авто відкривається у чаті бота. Відкрийте Mini App через кнопку меню бота.');
                    }
                } else if (launchCarId) {
                    try {
                        const car = await getMiniAppCar(launchCarId);
                        setSelectedCar(car);
                        setView('LISTING');
                    } catch (e) {
                        emitMiniAppEvent('warn', 'MiniApp launch car not found', {
                            ...safeLaunchMeta,
                            resolvedSlug,
                            carId: launchCarId,
                            error: e instanceof Error ? e.message : String(e)
                        });
                        applyEntryIntent(entryIntent);
                    }
                } else {
                    applyEntryIntent(entryIntent);
                }

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
        if (isConfigLoading) return;
        if (view === 'HOME') return;
        const eventType = resolveMiniAppViewEventType(view);
        const carListingId = eventType === 'ViewInventoryItem' && selectedCar ? getCarId(selectedCar) : undefined;
        trackEvent(eventType, {
            view,
            legacyEventType: 'view_opened',
            ...(carListingId ? { carListingId } : {})
        });
    }, [isConfigLoading, selectedCar, trackEvent, view]);

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

    const handleAction = async (act: MiniAppConfig['actions'][number]) => {
        const tg = (window as any).Telegram?.WebApp;
        if (act.actionType === 'VIEW') {
            const value = String(act.value || '').trim().toUpperCase();
            if (value === 'HOME') setView('HOME');
            if (value === 'INVENTORY') setView('INVENTORY');
            if (value === 'INVENTORY_STOCK') { setTab('IN_STOCK'); setView('INVENTORY'); }
            if (value === 'INVENTORY_TRANSIT') { setTab('IN_TRANSIT'); setView('INVENTORY'); }
            if (value === 'REQUEST') openRequest('BUY');
            if (value === 'SELL') {
                if (surfaceMode === 'LEAD') startBotFlow('SELL');
                else openRequest('SELL');
            }
            if (value === 'OFFER') openB2BOffer();
            if (value === 'FAVORITES') setView('FAVORITES');
            if (value === 'SUPPORT') setView('SUPPORT');
            if (value === 'CONTACTS') setView('CONTACTS');
            if (value === 'STATUS') setView('STATUS');
            if (value === 'PROFILE') setView('PROFILE');
        } else if (act.actionType === 'LINK') {
            if (!act.value) {
                emitMiniAppEvent('warn', 'Ignored empty MiniApp link action', { actionId: act.id });
                setConfigWarning('Посилання для цієї дії не налаштовано.');
                return;
            }
            const internalLink = resolveMiniAppInternalLinkIntent(act.value, surfaceMode, window.location.origin);
            if (internalLink && (!internalLink.slug || internalLink.slug === targetSlug || internalLink.slug === slug)) {
                applyEntryIntent(internalLink.intent);
                if (internalLink.carId) {
                    try {
                        const car = await getMiniAppCar(internalLink.carId);
                        setSelectedCar(car);
                        setView('LISTING');
                    } catch (e) {
                        emitMiniAppEvent('warn', 'MiniApp internal link car not found', {
                            actionId: act.id,
                            carId: internalLink.carId,
                            error: e instanceof Error ? e.message : String(e)
                        });
                    }
                }
                return;
            }
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

    const detectLang = () => {
        return 'UK';
    };

    const closeMiniAppOrShowSuccess = (message = 'Запит відправлено. Відкрийте чат з ботом для передачі контакту.') => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg?.close) {
            tg.close();
            return;
        }
        pushToast(message, 'success');
        setReqStep(5);
    };

    const handleLeadIntentOutcome = (response: Awaited<ReturnType<typeof createMiniAppLeadIntent>>) => {
        const outcome = resolveLeadIntentOutcome(response);
        if (outcome.shouldCloseMiniApp) return true;

        const message = outcome.message || 'Запит збережено. Відкрийте чат з ботом для продовження.';
        setConfigWarning(message);
        pushToast(message, 'success');
        if (outcome.openBotUrl) {
            const tg = (window as any).Telegram?.WebApp;
            if (tg?.openTelegramLink) {
                tg.openTelegramLink(outcome.openBotUrl);
            }
        }
        return false;
    };

    const submitLeadIntent = async (params: {
        kind: 'PICK' | 'PRICE_TERMS';
        carListingIds?: string[];
        criteria?: Record<string, unknown>;
        comment?: string;
    }) => {
        const submitInitData = initData || readRuntimeTelegramInitData();
        if (!submitInitData) {
            const message = 'Надсилання запиту доступне лише всередині Telegram Mini App.';
            setTelegramWriteState(telegramWriteState === 'outside_telegram' ? 'outside_telegram' : 'missing_initdata');
            setConfigWarning(message);
            setRequestSubmitError({ message, openBotUrl: resolveOpenBotUrl() });
            trackEvent('write_blocked_missing_initdata', { flow: params.kind, requestType: 'BUY' });
            return false;
        }
        setTelegramWriteState('ready');
        setRequestSubmitError(null);
        if (!initData) setInitData(submitInitData);
        const submitId = requestSubmitIdRef.current
            || (window.crypto?.randomUUID
                ? window.crypto.randomUUID()
                : `submit_${Date.now()}_${Math.random().toString(16).slice(2)}`);
        requestSubmitIdRef.current = submitId;
        const response = await createMiniAppLeadIntent({
            slug: targetSlug || 'system',
            initData: submitInitData,
            kind: params.kind,
            carListingId: params.carListingIds?.[0],
            carListingIds: params.carListingIds,
            criteria: params.criteria,
            comment: params.comment,
            tracking: { ...trackingMeta, submitId, requestType: 'BUY' }
        });
        requestSubmitIdRef.current = null;
        return handleLeadIntentOutcome(response);
    };

    const handleCarInterest = async (car: CarListing) => {
        if (isRequestSubmitting) return;
        const carId = getCarId(car);
        if (!carId) return;
        try {
            setIsRequestSubmitting(true);
            const ok = await submitLeadIntent({
                kind: 'PRICE_TERMS',
                carListingIds: [carId],
                criteria: {
                    title: car.presentation?.title || car.title,
                    price: car.presentation?.priceLabel || formatPrice(car.price),
                    lang: detectLang()
                }
            });
            if (!ok) return;
            trackEvent('LeadSubmit', {
                carListingId: carId,
                legacyEventType: 'lead_intent_price_terms_submitted'
            });
            closeMiniAppOrShowSuccess();
        } catch (e) {
            emitMiniAppEvent('error', 'MiniApp price intent submit failed', buildSafeRuntimeDiagnostics({
                error: e instanceof Error ? e.message : String(e),
                code: typeof e === 'object' && e && 'code' in e ? String((e as any).code || '') : undefined,
                carId
            }));
            pushToast(resolveWriteFailureMessage(e, 'Не вдалося надіслати запит по авто.', {
                flow: 'PRICE_TERMS',
                carListingId: carId
            }), 'error');
        } finally {
            setIsRequestSubmitting(false);
        }
    };

    const startBotFlow = async (flow: 'SELL' | 'SUPPORT') => {
        const submitInitData = initData || readRuntimeTelegramInitData();
        if (!submitInitData) {
            const message = 'Цей сценарій доступний лише через Telegram Mini App.';
            setTelegramWriteState(telegramWriteState === 'outside_telegram' ? 'outside_telegram' : 'missing_initdata');
            setConfigWarning(message);
            setRequestSubmitError({ message, openBotUrl: resolveOpenBotUrl() });
            return;
        }
        setTelegramWriteState('ready');
        setRequestSubmitError(null);
        if (!initData) setInitData(submitInitData);
        try {
            setIsRequestSubmitting(true);
            await startMiniAppBotFlow({
                slug: targetSlug || 'system',
                initData: submitInitData,
                flow
            });
            trackEvent(`bot_flow_${flow.toLowerCase()}_started`, {});
            closeMiniAppOrShowSuccess(flow === 'SELL'
                ? 'Бот відкрив сценарій продажу авто у чаті.'
                : 'Бот відкрив сценарій підтримки у чаті.');
        } catch (e) {
            emitMiniAppEvent('error', 'MiniApp bot flow failed', buildSafeRuntimeDiagnostics({
                flow,
                error: e instanceof Error ? e.message : String(e),
                code: typeof e === 'object' && e && 'code' in e ? String((e as any).code || '') : undefined
            }));
            pushToast(resolveWriteFailureMessage(e, 'Не вдалося відкрити сценарій у боті.', { flow }), 'error');
        } finally {
            setIsRequestSubmitting(false);
        }
    };

    const submitSelectedCarsInterest = async () => {
        if (!selectedRequestCarIds.length || isRequestSubmitting) return;
        try {
            setIsRequestSubmitting(true);
            const ok = await submitLeadIntent({
                kind: 'PRICE_TERMS',
                carListingIds: selectedRequestCarIds,
                criteria: {
                    selectedCars: selectedRequestCars.map(car => car.presentation?.title || car.title),
                    count: selectedRequestCarIds.length,
                    lang: detectLang()
                }
            });
            if (!ok) return;
            trackEvent('LeadSubmit', {
                selectedCarsCount: selectedRequestCarIds.length,
                legacyEventType: 'lead_intent_selected_cars_submitted'
            });
            clearRequestSelection();
            closeMiniAppOrShowSuccess();
        } catch (e) {
            emitMiniAppEvent('error', 'MiniApp selected cars intent failed', buildSafeRuntimeDiagnostics({
                error: e instanceof Error ? e.message : String(e),
                code: typeof e === 'object' && e && 'code' in e ? String((e as any).code || '') : undefined,
                selectedCarsCount: selectedRequestCarIds.length
            }));
            pushToast(resolveWriteFailureMessage(e, 'Не вдалося надіслати запит по обраних авто.', {
                flow: 'PRICE_TERMS',
                selectedCarsCount: selectedRequestCarIds.length
            }), 'error');
        } finally {
            setIsRequestSubmitting(false);
        }
    };

    useEffect(() => {
        const slugValue = targetSlug || slug || 'system';
        let cancelled = false;
        getMiniAppVehicleTaxonomy({ slug: slugValue })
            .then((taxonomy) => {
                if (!cancelled) setVehicleTaxonomy(taxonomy);
            })
            .catch((e) => {
                emitMiniAppEvent('warn', 'Fetch vehicle taxonomy failed', { error: e instanceof Error ? e.message : String(e) });
                if (!cancelled) setVehicleTaxonomy(null);
            });
        return () => {
            cancelled = true;
        };
    }, [slug, targetSlug]);

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
                    minYear: Number(filters.minYear) || undefined,
                    maxYear: Number(filters.maxYear) || undefined,
                    minPrice: Number(filters.minPrice) || undefined,
                    maxPrice: Number(filters.maxPrice) || undefined,
                    status: tab === 'IN_TRANSIT' ? 'PENDING' as const : 'AVAILABLE' as const
                };

                const target = targetSlug || 'system';
                try {
                    const res = await getMiniAppShowcaseInventory({ slug: target, ...apiFilters });
                    setCars(res.items);
                } catch (e) {
                    const res = await getPublicInventory(target, apiFilters);
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

    const requestB2BAccess = useCallback(async () => {
        const accessInitData = initData || readRuntimeTelegramInitData();
        if (!accessInitData) {
            const message = 'Запит на B2B доступ можна надіслати лише із захищеної Telegram Mini App сесії.';
            setTelegramWriteState(telegramWriteState === 'outside_telegram' ? 'outside_telegram' : 'missing_initdata');
            setConfigWarning(message);
            pushToast(message, 'error');
            return;
        }

        if (!initData) setInitData(accessInitData);
        setB2bAccessRequesting(true);
        setB2bAccessRequestStatus(null);

        try {
            const accessSlug = targetSlug || slug || 'system';
            const res = await requestMiniAppB2BAccess({
                slug: accessSlug,
                initData: accessInitData
            });
            if (res.approved) {
                setB2bPortal(prev => prev ? { ...prev, approved: true } : { ok: true, approved: true });
                setB2bAccessRequestStatus('Доступ уже активний. Оновіть портал, щоб побачити робочий кабінет.');
                pushToast('B2B доступ уже активний.', 'success');
                return;
            }

            const status = res.accessRequest?.status || 'NEW';
            const id = res.accessRequest?.id ? `ID ${res.accessRequest.id}` : 'Запит створено';
            setB2bAccessRequestStatus(`${id} · ${status}`);
            pushToast('Запит на B2B доступ надіслано адміністратору.', 'success');
            trackEvent('B2BAccessRequest', { status, hasAccessRequestId: Boolean(res.accessRequest?.id) });
        } catch (e) {
            const message = resolveMiniAppWriteError(e, 'Не вдалося надіслати запит на B2B доступ.');
            setB2bAccessRequestStatus(message);
            pushToast(message, 'error');
        } finally {
            setB2bAccessRequesting(false);
        }
    }, [initData, pushToast, slug, targetSlug, telegramWriteState, trackEvent]);

    const loadB2bActiveRequests = useCallback(async () => {
        if (config?.surfaceMode !== 'B2B' || !b2bPortal?.approved) return;
        const activeInitData = initData || readRuntimeTelegramInitData();
        if (!activeInitData) {
            setB2bActiveRequestsError('Запити мережі доступні лише із захищеної Telegram Mini App сесії.');
            return;
        }

        if (!initData) setInitData(activeInitData);
        setB2bActiveRequestsLoading(true);
        setB2bActiveRequestsError(null);

        try {
            const activitySlug = targetSlug || slug || 'system';
            const res = await getMiniAppB2bActiveRequests({ slug: activitySlug, initData: activeInitData, limit: 30 });
            setB2bActiveRequests(Array.isArray(res.items) ? res.items : []);
        } catch (e) {
            setB2bActiveRequestsError(resolveMiniAppWriteError(e, 'Не вдалося завантажити запити мережі.'));
        } finally {
            setB2bActiveRequestsLoading(false);
        }
    }, [b2bPortal?.approved, config?.surfaceMode, initData, slug, targetSlug]);

    const loadB2bActivity = useCallback(async () => {
        if (config?.surfaceMode !== 'B2B' || !b2bPortal?.approved) return;
        const activityInitData = initData || readRuntimeTelegramInitData();
        if (!activityInitData) {
            setB2bActivityError('Активність B2B доступна лише із захищеної Telegram Mini App сесії.');
            return;
        }

        if (!initData) setInitData(activityInitData);
        setB2bActivityLoading(true);
        setB2bActivityError(null);

        try {
            const activitySlug = targetSlug || slug || 'system';
            const [requestsRes, variantsRes] = await Promise.all([
                getMiniAppB2bMyRequests({ slug: activitySlug, initData: activityInitData }),
                getMiniAppB2bReceivedVariants({ slug: activitySlug, initData: activityInitData })
            ]);

            setB2bMyRequests(Array.isArray(requestsRes.items) ? requestsRes.items : []);
            setB2bReceivedVariants(Array.isArray(variantsRes.items) ? variantsRes.items : []);
        } catch (e) {
            setB2bActivityError(resolveMiniAppWriteError(e, 'Не вдалося завантажити B2B активність.'));
        } finally {
            setB2bActivityLoading(false);
        }
    }, [b2bPortal?.approved, config?.surfaceMode, initData, slug, targetSlug]);

    useEffect(() => {
        if (view === 'STATUS') {
            void loadB2bActivity();
        }
        if (view === 'B2B_REQUESTS') {
            void loadB2bActiveRequests();
        }
    }, [loadB2bActivity, loadB2bActiveRequests, view]);

    const handleB2bVariantDecision = useCallback(async (variantId: string, decision: 'FIT' | 'NOT_FIT') => {
        const decisionInitData = initData || readRuntimeTelegramInitData();
        if (!decisionInitData) {
            pushToast('Рішення по варіанту доступне лише із захищеної Telegram Mini App сесії.', 'error');
            return;
        }

        if (!initData) setInitData(decisionInitData);
        const loadingId = `${variantId}:${decision}`;
        setB2bDecisionLoadingId(loadingId);

        try {
            const activitySlug = targetSlug || slug || 'system';
            const res = await setMiniAppB2bVariantDecision(variantId, {
                slug: activitySlug,
                initData: decisionInitData,
                decision
            });
            setB2bReceivedVariants(prev => prev.map(item => item.id === variantId
                ? {
                    ...item,
                    requesterDecision: res.variant?.requesterDecision || decision,
                    fitQueueStatus: res.variant?.fitQueueStatus ?? item.fitQueueStatus,
                    status: decision === 'FIT' ? 'APPROVED' : 'REJECTED'
                }
                : item));
            pushToast(decision === 'FIT' ? 'Варіант передано в FIT-чергу.' : 'Варіант позначено як не підходить.', 'success');
        } catch (e) {
            pushToast(resolveMiniAppWriteError(e, 'Не вдалося зберегти рішення по варіанту.'), 'error');
        } finally {
            setB2bDecisionLoadingId(null);
        }
    }, [initData, pushToast, slug, targetSlug]);

    const parseOfferNumber = (value: string) => {
        const normalized = value.replace(/[^\d.]/g, '');
        if (!normalized) return undefined;
        const n = Number(normalized);
        return Number.isFinite(n) ? n : undefined;
    };

    const submitB2BOffer = async () => {
        const offerInitData = initData || readRuntimeTelegramInitData();
        const requestRef = b2bOfferForm.requestRef.trim();
        const title = b2bOfferForm.title.trim();

        if (!offerInitData) {
            setB2bOfferError('Подати варіант можна лише із захищеної Telegram Mini App сесії.');
            return;
        }
        if (!requestRef) {
            setB2bOfferError('Вкажіть ID запиту, наприклад CD-2026-000123.');
            return;
        }
        if (!title) {
            setB2bOfferError('Вкажіть назву авто.');
            return;
        }

        if (!initData) setInitData(offerInitData);
        setB2bOfferSubmitting(true);
        setB2bOfferError(null);

        const submitId = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `offer_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        try {
            const activitySlug = targetSlug || slug || 'system';
            await submitMiniAppB2bOffer(requestRef, {
                slug: activitySlug,
                initData: offerInitData,
                title,
                price: parseOfferNumber(b2bOfferForm.price),
                currency: 'USD',
                year: parseOfferNumber(b2bOfferForm.year),
                mileage: parseOfferNumber(b2bOfferForm.mileage),
                location: b2bOfferForm.location.trim() || undefined,
                condition: b2bOfferForm.condition.trim() || undefined,
                comment: b2bOfferForm.comment.trim() || undefined,
                contact: b2bOfferForm.contact.trim() || undefined,
                mediaUrls: b2bOfferForm.mediaUrl.trim() ? [b2bOfferForm.mediaUrl.trim()] : [],
                submitId,
                tracking: {
                    ...trackingMeta,
                    submitId,
                    eventId: submitId
                }
            });

            setB2bOfferSuccess({ requestRef, variantTitle: title });
            pushToast('Варіант надіслано на review.', 'success');
            trackMiniAppEvent({
                slug: activitySlug,
                eventType: 'B2BOfferSubmit',
                initData: offerInitData,
                view: 'OFFER',
                payload: { requestRef, title },
                tracking: {
                    ...trackingMeta,
                    submitId,
                    eventId: submitId
                }
            }).catch(() => undefined);
        } catch (e) {
            setB2bOfferError(resolveMiniAppWriteError(e, 'Не вдалося подати варіант.'));
        } finally {
            setB2bOfferSubmitting(false);
        }
    };

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

    const primaryColor = normalizeMiniAppAccent(config.primaryColor);
    const surfaceMode: MiniAppSurfaceMode = config.surfaceMode === 'B2B' ? 'B2B' : 'LEAD';
    const navItems = (config.navItems && config.navItems.length > 0)
        ? config.navItems
        : [
            { id: 'nav_home', label: 'Головна', icon: 'Home', actionType: 'VIEW', value: 'HOME' },
            { id: 'nav_stock', label: surfaceMode === 'B2B' ? 'Склад' : 'Каталог', icon: 'LayoutGrid', actionType: 'VIEW', value: 'INVENTORY' },
            { id: 'nav_request', label: surfaceMode === 'B2B' ? 'Угоди' : 'Заявки', icon: 'Search', actionType: 'VIEW', value: surfaceMode === 'B2B' ? 'STATUS' : 'REQUEST' },
            { id: 'nav_contacts', label: surfaceMode === 'B2B' ? 'Підтримка' : 'Контакти', icon: 'MessageCircle', actionType: 'VIEW', value: surfaceMode === 'B2B' ? 'SUPPORT' : 'CONTACTS' },
            { id: 'nav_profile', label: 'Профіль', icon: 'User', actionType: 'VIEW', value: 'PROFILE' }
        ];
    const showBottomNav = view !== 'LISTING' && view !== 'REQUEST';
    const showBackArrow = (view === 'REQUEST' || view === 'OFFER') && !lightboxCar;

    const applyFiltersAndSort = () => {
        let filtered = [...cars];

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
        if (curr === 'USD') return `$${price.amount.toLocaleString()}`;
        if (curr === 'EUR') return `€${price.amount.toLocaleString()}`;
        return `${price.amount.toLocaleString()} ${curr}`;
    };

    const toNumberSafe = (value: unknown) => {
        const num = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(num) ? num : 0;
    };

    const formatMileage = (value: unknown) => {
        const mileage = toNumberSafe(value);
        if (!mileage) return '—';
        return `${mileage.toLocaleString()} км`;
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
        if (car?.presentation?.title) return car.presentation.title;
        const specs = getCarSpecs(car);
        const combined = [specs.brand, specs.model].filter(Boolean).join(' ').trim();
        if (combined) return combined;
        return pickText(specs.engine, specs.fuel) || '—';
    };

    const isTransitCar = (car: CarListing) => {
        const availabilityState = String((car as any).availabilityState || '').toUpperCase();
        if (availabilityState) {
            return availabilityState === 'IN_TRANSIT' || availabilityState === 'IMPORT_TO_ORDER';
        }
        const specs = getCarSpecs(car);
        const condition = (specs.condition || '').toLowerCase();
        const status = String((car as any).status || '').toUpperCase();
        return condition === 'in_transit' || condition.includes('дороз') || car.presentation?.statusLabel === 'В дорозі' || status === 'PENDING' || status === 'IN_TRANSIT';
    };

    const getStatusLabel = (car: CarListing) => {
        if (car.presentation?.statusLabel) return car.presentation.statusLabel;
        const availabilityState = String((car as any).availabilityState || '').toUpperCase();
        if (availabilityState === 'IMPORT_TO_ORDER') return 'Під замовлення';
        if (availabilityState === 'IN_TRANSIT') return 'В дорозі';
        if (availabilityState === 'RESERVED') return 'Заброньовано';
        if (availabilityState === 'SOLD') return 'Продано';
        if (availabilityState === 'UNKNOWN') return 'Статус уточнюється';
        return isTransitCar(car) ? 'В дорозі' : 'В наявності';
    };

    const openInventoryTab = (nextTab: InventoryTab) => {
        setTab(nextTab);
        setView('INVENTORY');
    };

    const renderCompactCarCard = (
        car: CarListing,
        options: { variant: 'LEAD' | 'B2B'; compact?: boolean }
    ) => {
        const images = getCarImages(car);
        const cover = images[0];
        const specs = getCarSpecs(car);
        const presentation = car.presentation;
        const carId = getCarId(car);
        const statusLabel = getStatusLabel(car);
        const chips = (presentation?.specChips || [])
            .filter(Boolean)
            .slice(0, options.compact ? 2 : 3);

        return (
            <button
                key={carId || `home_${car.title}_${car.year}`}
                onClick={() => openListing(car)}
                className="group flex w-full gap-3 rounded-[18px] border border-white/10 bg-white/[0.055] p-2 text-left shadow-[0_16px_40px_rgba(0,0,0,0.24)] transition-transform active:scale-[0.99]"
            >
                <div className="relative size-[104px] shrink-0 overflow-hidden rounded-[14px] bg-[#202226]">
                    <MiniAppImage
                        src={cover}
                        sources={images}
                        alt={presentation?.title || car.title || 'Авто'}
                        className="size-full object-cover transition-transform duration-500 group-active:scale-105"
                    />
                    <div className="absolute left-2 top-2 rounded-full border border-white/12 bg-black/58 px-2 py-1 text-[9px] font-bold text-white/82 backdrop-blur">
                        {statusLabel}
                    </div>
                </div>
                <div className="min-w-0 flex-1 py-1">
                    <div className="flex items-start justify-between gap-2">
                        <h4 className="line-clamp-2 text-sm font-black leading-snug text-white">
                            {presentation?.title || car.title || formatBrandModel(car)}
                        </h4>
                        {options.variant === 'LEAD' ? (
                            <Star size={15} className={isFavorite(carId) ? 'shrink-0 fill-[#F0D27A] text-[#F0D27A]' : 'shrink-0 text-white/28'} />
                        ) : (
                            <ClipboardList size={15} className="shrink-0 text-white/40" />
                        )}
                    </div>
                    <p className="mt-1 truncate text-[11px] text-white/48">
                        {chips.length ? chips.join(' • ') : (pickText(specs.engine, specs.fuel, specs.drive) || 'Inventory')}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-2">
                        <div>
                            <div className="text-base font-black text-[#F4F5F7]">{presentation?.priceLabel || formatPrice(car.price)}</div>
                            <div className="mt-0.5 text-[10px] text-white/38">{presentation?.mileageLabel || formatMileage(car.mileage)}</div>
                        </div>
                        <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-white/46">
                            {toNumberSafe(car.year) || '—'}
                        </span>
                    </div>
                </div>
            </button>
        );
    };

    const renderHome = () => {
        const featuredCar = cars[0];
        const featuredImages = featuredCar ? getCarImages(featuredCar) : [];
        const featuredTitle = featuredCar?.presentation?.title || featuredCar?.title || (surfaceMode === 'B2B' ? 'CarTié B2B Network' : 'CarTié Import');
        const featuredSubtitle = featuredCar
            ? [
                featuredCar.presentation?.subtitle,
                featuredCar.presentation?.mileageLabel || formatMileage(featuredCar.mileage),
                getStatusLabel(featuredCar)
            ].filter(Boolean).slice(0, 3).join(' • ')
            : (surfaceMode === 'B2B' ? 'Угоди, склад і комунікація з партнерами' : 'Підбір, імпорт і супровід авто під ключ');
        const greetingName = tgUser?.first_name || (surfaceMode === 'B2B' ? 'партнере' : 'друже');
        const stockCount = cars.filter(car => !isTransitCar(car)).length;
        const transitCount = cars.filter(isTransitCar).length;
        const leadQuickActions = [
            { id: 'stock', label: 'Авто в наявності', hint: 'Готові до перегляду', icon: 'Car', onClick: () => openInventoryTab('IN_STOCK') },
            { id: 'transit', label: 'Авто в дорозі', hint: 'ETA, стан і ціна', icon: 'Truck', onClick: () => openInventoryTab('IN_TRANSIT') },
            { id: 'pick', label: 'Підібрати авто', hint: 'Запит під бюджет', icon: 'Search', onClick: () => openRequest('BUY') },
            { id: 'requests', label: 'Мої запити', hint: 'Статуси і історія', icon: 'ClipboardList', onClick: () => setView('STATUS') },
            { id: 'contacts', label: 'Менеджер', hint: 'Написати напряму', icon: 'MessageCircle', onClick: () => setView('CONTACTS') }
        ];
        const b2bQuickActions = [
            { id: 'requests', label: 'Запити мережі', hint: 'Активні запити без контактів', icon: 'ClipboardList', onClick: () => setView('B2B_REQUESTS') },
            { id: 'create', label: 'Створити запит', hint: 'Пошук для партнера', icon: 'Search', onClick: () => openRequest('BUY') },
            { id: 'offer', label: 'Запропонувати авто', hint: 'Варіант по запиту', icon: 'Plus', onClick: () => openB2BOffer() },
            { id: 'stock', label: 'Склад B2B', hint: 'Inventory партнерів', icon: 'LayoutGrid', onClick: () => setView('INVENTORY') }
        ];
        const quickActions = surfaceMode === 'B2B' ? b2bQuickActions : leadQuickActions;
        const stats = surfaceMode === 'B2B'
            ? [
                ['Мої запити', String(b2bPortal?.stats?.ownRequests ?? 0)],
                ['Варіанти', String(b2bPortal?.stats?.receivedVariants ?? 0)],
                ['Склад', String(stockCount)],
                ['В дорозі', String(transitCount)]
            ]
            : [
                ['В наявності', String(stockCount)],
                ['В дорозі', String(transitCount)],
                ['Обрані', String(favoriteItems.length)],
                ['Запити', selectedRequestCarIds.length ? String(selectedRequestCarIds.length) : '0']
            ];

        if (surfaceMode === 'B2B') {
            const partnerName = b2bPortal?.partner?.name || 'Partner portal';
            const partnerRole = b2bPortal?.partner?.role || 'pending';
            const partnerCode = b2bPortal?.partner?.code;
            if (b2bPortalLoading) {
                return (
                    <div className="flex h-full items-center justify-center bg-[#050608] px-6 text-center text-white">
                        <div className="flex max-w-xs flex-col items-center gap-3">
                            <div className="size-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                            <div className="text-sm font-bold text-white/78">Перевіряємо партнерський доступ</div>
                            <div className="text-xs leading-relaxed text-white/42">Mini App звіряє Telegram сесію з approved partner account.</div>
                        </div>
                    </div>
                );
            }

            if (b2bPortal && !b2bPortal.approved) {
                return (
                    <div className="animate-fade-in h-full overflow-y-auto bg-[#050608] px-5 pb-24 pt-7 text-white">
                        <section className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[#111417] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(115deg,rgba(255,255,255,0.14),transparent_62%)]" />
                            <div className="relative z-10">
                                <div className="mb-4 flex size-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-white/80">
                                    <ShieldCheck size={24} />
                                </div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Partner access</p>
                                <h1 className="mt-2 text-[28px] font-black leading-tight text-white">Доступ до B2B порталу очікує підтвердження</h1>
                                <p className="mt-3 text-sm leading-relaxed text-white/58">
                                    Цей Telegram профіль ще не привʼязаний до approved partner account. Після підтвердження відкриються запити, варіанти, вітрина і команда.
                                </p>
                            </div>
                            <div className="relative z-10 mt-5 rounded-[18px] border border-white/10 bg-black/24 p-4">
                                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/34">Telegram user</div>
                                <div className="mt-1 text-base font-black text-white">{b2bPortal.user?.name || b2bPortal.user?.username || 'Невідомий профіль'}</div>
                                <div className="mt-1 text-xs text-white/42">
                                    {b2bPortal.user?.username ? `@${b2bPortal.user.username}` : 'username недоступний'}
                                </div>
                            </div>
                            <div className="relative z-10 mt-5 grid grid-cols-1 gap-3">
                                <button
                                    type="button"
                                    onClick={requestB2BAccess}
                                    disabled={b2bAccessRequesting}
                                    className="rounded-[16px] py-4 text-sm font-black"
                                    style={premiumCtaStyle}
                                >
                                    <span className="inline-flex items-center justify-center gap-2">
                                        {b2bAccessRequesting ? <Loader2 size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
                                        {b2bAccessRequesting ? 'Надсилаємо запит' : 'Надіслати запит на доступ'}
                                    </span>
                                </button>
                                {b2bAccessRequestStatus && (
                                    <div className="rounded-[14px] border border-white/10 bg-white/[0.045] px-4 py-3 text-xs font-bold leading-relaxed text-white/62">
                                        {b2bAccessRequestStatus}
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setView('SUPPORT')}
                                    className="rounded-[16px] border border-white/10 py-3 text-sm font-bold text-white/72"
                                >
                                    Звʼязатися з адміністратором
                                </button>
                                <button
                                    type="button"
                                    onClick={() => window.location.reload()}
                                    className="rounded-[16px] border border-white/10 py-3 text-sm font-bold text-white/72"
                                >
                                    Оновити статус
                                </button>
                            </div>
                        </section>

                        <section className="mt-4 grid grid-cols-3 gap-2 text-center">
                            {['Request access', 'Admin approval', 'Partner portal'].map((step, index) => (
                                <div key={step} className="rounded-[14px] border border-white/10 bg-white/[0.045] px-2 py-3">
                                    <div className="mx-auto mb-2 flex size-7 items-center justify-center rounded-full border border-white/10 text-xs font-black text-white/70">
                                        {index + 1}
                                    </div>
                                    <div className="text-[10px] font-bold leading-tight text-white/54">{step}</div>
                                </div>
                            ))}
                        </section>
                    </div>
                );
            }

            return (
                <div className="animate-fade-in h-full overflow-y-auto bg-[#050608] pb-24">
                    <div className="flex flex-col gap-5 px-5 pb-5 pt-7">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="text-[22px] font-black tracking-[0.16em] text-white">CARTIÉ</div>
                                <div className="mt-0.5 text-xs text-white/45">{partnerName}</div>
                            </div>
                            <div className="rounded-full border border-white/12 bg-white/[0.055] px-3 py-2 text-[11px] font-bold text-white/70">
                                {partnerCode ? `${partnerCode} · ${partnerRole}` : partnerRole}
                            </div>
                        </div>

                        <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#111417] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.34)]">
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[linear-gradient(115deg,rgba(255,255,255,0.16),transparent_62%)]" />
                            <div className="relative z-10">
                                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/42">B2B operations</p>
                                <h1 className="mt-3 text-[26px] font-black leading-tight text-white">
                                    Привіт, {greetingName}. Керуй запитами, варіантами і складом.
                                </h1>
                                <p className="mt-3 text-sm leading-relaxed text-white/58">
                                    Контакти партнерів захищені до погодженого FIT, а авто рендеряться з єдиного Inventory.
                                </p>
                            </div>
                            <div className="relative z-10 mt-5 grid grid-cols-2 gap-2">
                                {stats.map(([label, value]) => (
                                    <div key={label} className="rounded-[16px] border border-white/10 bg-black/22 p-3">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">{label}</div>
                                        <div className="mt-1 text-2xl font-black text-white">{value}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="grid grid-cols-2 gap-3">
                            {quickActions.map(action => (
                                <button
                                    key={action.id}
                                    onClick={action.onClick}
                                    className="min-h-[112px] rounded-[18px] border border-white/10 bg-[#171a1d] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-transform active:scale-[0.98]"
                                >
                                    <div className="mb-3 flex size-11 items-center justify-center rounded-[14px] border border-white/10 bg-black/28 text-white/78">
                                        {renderIcon(action.icon, 22)}
                                    </div>
                                    <div className="text-sm font-black leading-tight text-white">{action.label}</div>
                                    <div className="mt-1 text-[11px] leading-snug text-white/42">{action.hint}</div>
                                </button>
                            ))}
                        </section>

                        <section className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-black text-white">Черга партнера</h2>
                                    <p className="mt-1 text-xs leading-relaxed text-white/48">Створюй запит, отримуй варіанти без витоку контактів, передавай FIT адміну.</p>
                                </div>
                                <button
                                    onClick={() => openRequest('BUY')}
                                    className="shrink-0 rounded-[14px] px-4 py-3 text-xs font-black"
                                    style={premiumCtaStyle}
                                >
                                    Новий запит
                                </button>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                                {['Запит', 'Варіант', 'FIT'].map((step, index) => (
                                    <div key={step} className="rounded-[14px] border border-white/10 bg-black/22 px-2 py-3">
                                        <div className="mx-auto mb-2 flex size-7 items-center justify-center rounded-full border border-white/10 text-xs font-black text-white/70">
                                            {index + 1}
                                        </div>
                                        <div className="text-[11px] font-bold text-white/68">{step}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-black text-white">Склад мережі</h2>
                                <button onClick={() => setView('INVENTORY')} className="text-xs font-bold text-white/55">Відкрити</button>
                            </div>
                            {cars.slice(0, 4).map(car => renderCompactCarCard(car, { variant: 'B2B', compact: true }))}
                            {!cars.length && (
                                <div className="rounded-[18px] border border-white/10 bg-white/[0.045] p-5 text-sm text-white/58">
                                    Склад порожній. Створи B2B запит або звернись до підтримки.
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            );
        }

        return (
            <div className="animate-fade-in pb-24 h-full overflow-y-auto bg-[#050608]">
                <div className="flex flex-col gap-5 px-5 pb-5 pt-7">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-[24px] font-black tracking-[0.18em] text-white">CARTIÉ</div>
                            <div className="text-xs text-white/45 mt-0.5">
                                Lead Mini App
                            </div>
                        </div>
                        {tgUser?.photo_url ? (
                            <img src={tgUser.photo_url} className="size-10 rounded-full object-cover border border-white/15 bg-white/10" />
                        ) : (
                            <div className="size-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white/70">
                                <User size={19} />
                            </div>
                        )}
                    </div>

                    <div>
                        <h1 className="text-[25px] font-bold leading-tight text-white">
                            Привіт, {greetingName} 👋
                        </h1>
                        <p className="text-white/62 text-sm mt-1 leading-relaxed">
                            Підберемо преміальне авто, покажемо наявність і швидко звʼяжемо з менеджером у Telegram.
                        </p>
                    </div>

                    <div className="relative overflow-hidden rounded-[30px] border border-white/10 min-h-[330px]" style={graphitePanelStyle}>
                        <div className="absolute inset-0">
                            {featuredImages[0] ? (
                                <MiniAppImage
                                    src={featuredImages[0]}
                                    sources={featuredImages}
                                    alt={featuredTitle}
                                    className="w-full h-full object-cover opacity-72"
                                />
                            ) : (
                                <MiniAppImage
                                    src={config.headerImageUrl || PLACEHOLDER_IMAGE}
                                    alt={featuredTitle}
                                    className="w-full h-full object-cover opacity-62"
                                />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/58 to-black/10" />
                        </div>
                        <div className="relative z-10 flex min-h-[330px] flex-col justify-end p-5">
                            <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full bg-black/48 border border-white/10 px-3 py-1 text-[11px] font-bold text-white/84 backdrop-blur">
                                <Star size={13} className="text-white/70" />
                                Рекомендовано
                            </div>
                            <h2 className="text-2xl font-bold text-white leading-tight">{featuredTitle}</h2>
                            <p className="mt-2 text-sm text-white/66 leading-relaxed">{featuredSubtitle}</p>
                            <div className="mt-4 flex items-center justify-between gap-3">
                                <div className="text-xl font-black text-[#F3F4F6]">
                                    {featuredCar?.presentation?.priceLabel || (featuredCar ? formatPrice(featuredCar.price) : 'Підбір під бюджет')}
                                </div>
                                <button
                                    onClick={() => featuredCar ? handleCarInterest(featuredCar) : openRequest('BUY')}
                                    className="shrink-0 rounded-2xl px-4 py-3 text-sm font-bold active:scale-95 transition-transform"
                                    style={premiumCtaStyle}
                                >
                                    Дізнатись ціну
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="mb-3 grid grid-cols-4 gap-2">
                            {stats.map(([label, value]) => (
                                <div key={label} className="rounded-[14px] border border-white/10 bg-white/[0.045] px-2 py-3 text-center">
                                    <div className="text-lg font-black text-white">{value}</div>
                                    <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-white/34">{label}</div>
                                </div>
                            ))}
                        </div>
                        <h3 className="text-sm font-bold text-white/86 mb-3">Швидкі дії</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {quickActions.map(act => (
                                <button
                                    key={act.id}
                                    onClick={act.onClick}
                                    className="min-h-[104px] rounded-2xl border border-white/10 bg-[#171a1d] p-4 text-left active:scale-[0.98] transition-transform"
                                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                                >
                                    <div className="size-11 rounded-2xl bg-black/32 border border-white/10 flex items-center justify-center text-white/78 mb-3">
                                        {renderIcon(act.icon, 23)}
                                    </div>
                                    <div className="text-sm font-bold text-white leading-tight">{act.label}</div>
                                    <div className="mt-1 text-[11px] leading-snug text-white/42">{act.hint}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-white">Маршрут заявки</h3>
                                <p className="mt-1 text-xs leading-relaxed text-white/48">Обери авто або критерії, Mini App створить запит, бот попросить контакт тільки коли він потрібен.</p>
                            </div>
                            <button onClick={() => setView('STATUS')} className="shrink-0 rounded-[14px] border border-white/10 px-3 py-2 text-xs font-bold text-white/68">
                                Мої запити
                            </button>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                            {['Каталог', 'Запит', 'Контакт'].map((step, index) => (
                                <div key={step} className="rounded-[14px] border border-white/10 bg-black/22 px-2 py-3">
                                    <div className="mx-auto mb-2 flex size-7 items-center justify-center rounded-full border border-white/10 text-xs font-black text-white/70">
                                        {index + 1}
                                    </div>
                                    <div className="text-[11px] font-bold text-white/68">{step}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-white text-lg">Рекомендовані авто</h3>
                            <button onClick={() => openInventoryTab('IN_STOCK')} className="text-xs font-bold text-white/62">Дивитись всі</button>
                        </div>
                        <div className="flex flex-col gap-3">
                            {cars.slice(0, 4).map(car => renderCompactCarCard(car, { variant: 'LEAD', compact: true }))}
                            {!cars.length && (
                                <button
                                    onClick={() => openRequest('BUY')}
                                    className="rounded-[18px] border border-white/10 bg-white/[0.045] p-5 text-left text-sm text-white/58"
                                >
                                    У каталозі поки немає авто. Залиште запит, і менеджер підбере варіанти під бюджет.
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderInventory = () => {
        return (
            <CatalogView
                surfaceMode={surfaceMode}
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
                onToggleFavorite={toggleFavorite}
                onPrimaryAction={surfaceMode === 'B2B' ? prefillRequestFromCar : handleCarInterest}
                onToggleRequestSelection={toggleRequestSelection}
                onOpenListing={openListing}
                onEmptyRequest={() => openRequest('BUY')}
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
        const presentation = selectedCar.presentation;
        const detailRows = presentation?.detailRows?.length
            ? presentation.detailRows
            : [
                { label: 'Рік', value: String(toNumberSafe(selectedCar.year) || '—') },
                { label: 'Пробіг', value: formatMileage(selectedCar.mileage) },
                { label: 'Пальне', value: getCarSpecs(selectedCar).fuel || '—' },
                { label: 'КПП', value: getCarSpecs(selectedCar).transmission || '—' },
                { label: 'Привід', value: getCarSpecs(selectedCar).drive || '—' },
                { label: 'Локація', value: pickText(selectedCar.location) || '—' }
            ];
        const title = presentation?.title || selectedCar.title || 'Авто';
        const priceLabel = presentation?.priceLabel || formatPrice(selectedCar.price);
        const statusLabel = presentation?.statusLabel || getStatusLabel(selectedCar);
        const subtitle = presentation?.subtitle || formatBrandModel(selectedCar);
        const primaryDetailRows = detailRows.filter(row => row.value && row.value !== '—').slice(0, 8);
        const onPrimaryListingAction = () => {
            if (readOnlyPreview) {
                window.location.href = resolveOpenBotUrl();
                return;
            }
            surfaceMode === 'B2B' ? prefillRequestFromCar(selectedCar) : handleCarInterest(selectedCar);
        };

        return (
            <div className="animate-fade-in h-full overflow-y-auto bg-[#050608] text-white">
                <div className="relative min-h-[430px] overflow-hidden">
                    <div className="absolute inset-0 bg-[#111418]">
                        <MiniAppImage
                            src={cover}
                            sources={images}
                            alt={title}
                            className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050608] via-[#050608]/70 to-black/10" />
                        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#050608] to-transparent" />
                    </div>

                    <div className="relative z-10 flex min-h-[430px] flex-col justify-between px-5 pb-6 pt-5">
                        <div className="flex items-center justify-between gap-3">
                            <button
                                onClick={goBack}
                                className="flex h-10 items-center gap-1 rounded-full border border-white/12 bg-black/42 px-3 text-xs font-bold text-white/88 backdrop-blur-md active:scale-95"
                            >
                                <ChevronLeft size={16} />
                                Назад
                            </button>
                            <div className="flex items-center gap-2">
                                {images.length > 1 && (
                                    <button
                                        onClick={() => { setLightboxCar(selectedCar); setLightboxImageIndex(0); }}
                                        className="flex h-10 items-center gap-1 rounded-full border border-white/12 bg-black/42 px-3 text-xs font-bold text-white/88 backdrop-blur-md"
                                    >
                                        <ImageIcon size={15} />
                                        {images.length}
                                    </button>
                                )}
                                <button
                                    onClick={() => toggleFavorite(selectedCar)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/42 text-white/88 backdrop-blur-md"
                                    aria-label="Обране"
                                >
                                    <Star size={18} className={isFavorite(getCarId(selectedCar)) ? 'fill-[#F0D27A] text-[#F0D27A]' : 'text-white/80'} />
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => { setLightboxCar(selectedCar); setLightboxImageIndex(0); }}
                            className="absolute inset-x-0 top-20 bottom-36"
                            aria-label="Відкрити галерею"
                        />

                        <div className="mt-auto">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-white/12 bg-black/45 px-3 py-1 text-[11px] font-bold text-white/82 backdrop-blur">
                                    {statusLabel}
                                </span>
                                {readOnlyPreview && (
                                    <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/72 backdrop-blur">
                                        Preview
                                    </span>
                                )}
                            </div>
                            <h2 className="text-[28px] font-black leading-[1.05] tracking-[-0.01em] text-white">{title}</h2>
                            <div className="mt-3 flex items-end justify-between gap-4">
                                <div>
                                    <div className="text-[28px] font-black leading-none text-[#F4F6F8]">{priceLabel}</div>
                                    <div className="mt-2 text-sm leading-relaxed text-white/64">{subtitle}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-5 pb-28">
                    {images.length > 1 && (
                        <div className="-mt-2 mb-4 flex gap-2 overflow-x-auto pb-1">
                            {images.slice(0, 8).map((url, idx) => (
                                <button
                                    key={`listing-thumb-${idx}`}
                                    onClick={() => { setLightboxCar(selectedCar); setLightboxImageIndex(idx); }}
                                    className="h-16 w-20 shrink-0 overflow-hidden rounded-xl border border-white/12 bg-[#181b1f]"
                                >
                                    <MiniAppImage
                                        src={url}
                                        className="h-full w-full object-cover"
                                        fallbackClassName="flex h-full w-full items-center justify-center text-white/25"
                                        alt={`${title} фото ${idx + 1}`}
                                    />
                                </button>
                            ))}
                        </div>
                    )}

                    {readOnlyPreview && (
                        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-sm leading-relaxed text-white/68">
                            Це безпечний перегляд з посилання. Для заявки, обраного або чату відкрийте Mini App через бот.
                        </div>
                    )}

                    <div className="rounded-[22px] border border-white/10 bg-[#15181c] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.28)]">
                        <div className="flex flex-wrap gap-2">
                            {(presentation?.specChips || []).slice(0, 6).map(chip => (
                                <span key={chip} className="rounded-xl border border-white/10 bg-black/24 px-3 py-2 text-[11px] font-bold text-white/78">{chip}</span>
                            ))}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            {primaryDetailRows.map(row => (
                                <div key={row.label} className="min-h-[64px] rounded-2xl border border-white/7 bg-black/24 p-3">
                                    <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/35">{row.label}</div>
                                    <div className="text-sm font-bold leading-snug text-white/86">{row.value}</div>
                                </div>
                            ))}
                        </div>
                        {(getCarSpecs(selectedCar).vin || getCarSpecs(selectedCar).condition || selectedCar.description) && (
                            <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm text-white/68">
                                {getCarSpecs(selectedCar).condition && <div>Стан: {getCarSpecs(selectedCar).condition}</div>}
                                {getCarSpecs(selectedCar).vin && <div className="font-mono text-xs text-white/55">VIN: {getCarSpecs(selectedCar).vin}</div>}
                                {selectedCar.description && (
                                    <div className="line-clamp-5 leading-relaxed text-white/58">{selectedCar.description}</div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#07080a]/94 px-5 pb-5 pt-3 backdrop-blur-xl">
                    <button
                        onClick={onPrimaryListingAction}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black active:scale-[0.99]"
                        style={premiumCtaStyle}
                    >
                        <MessageSquare size={18} />
                        {readOnlyPreview
                            ? 'Відкрити через бот'
                            : (surfaceMode === 'B2B' ? 'Створити B2B запит' : 'Дізнатись ціну та умови')}
                    </button>
                    {!readOnlyPreview && (
                        <button
                            onClick={() => toggleRequestSelection(selectedCar)}
                            className="mt-2 w-full rounded-2xl border border-white/10 py-2.5 text-xs font-bold text-white/78"
                        >
                            {isSelectedForRequest(getCarId(selectedCar)) ? 'Авто у мультивиборі' : 'Додати авто до мультивибору'}
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const checkRequestStatus = async () => {
        try {
            const slug = targetSlug || 'system';
            const statusInitData = initData || readRuntimeTelegramInitData();
            if (!statusInitData) {
                setStatusResult({
                    error: 'Статус заявки доступний лише із захищеної Telegram Mini App сесії. Відкрийте застосунок з меню бота.'
                });
                return;
            }
            if (!initData) setInitData(statusInitData);
            const res = await getMiniAppRequestStatus({
                slug,
                initData: statusInitData,
                requestId: statusQuery.publicId || undefined,
            });
            setStatusResult(res.request || res);
        } catch (e) {
            setStatusResult({ error: 'Запит не знайдено' });
        }
    };

    const renderB2BOffer = () => {
        const updateField = (key: keyof B2BOfferForm, value: string) => {
            setB2bOfferForm(prev => ({ ...prev, [key]: value }));
        };
        const fieldClass = 'w-full rounded-[16px] border border-white/10 bg-black/28 px-4 py-3 text-sm text-white outline-none placeholder-white/28 focus:border-white/30';

        if (surfaceMode !== 'B2B') {
            return (
                <div className="flex h-full items-center justify-center bg-[#050608] px-6 text-center text-white">
                    <div className="max-w-sm">
                        <div className="text-xl font-black">B2B недоступний</div>
                        <div className="mt-2 text-sm leading-relaxed text-white/58">Подати варіант можна тільки в B2B Mini App.</div>
                    </div>
                </div>
            );
        }

        if (b2bOfferSuccess) {
            return (
                <div className="animate-fade-in h-full overflow-y-auto bg-[#050608] px-5 pb-24 pt-7 text-white">
                    <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#111417] p-5">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(120deg,rgba(255,255,255,0.14),transparent_58%)]" />
                        <div className="relative z-10 flex size-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-white/80">
                            <CheckCircle size={24} />
                        </div>
                        <div className="relative z-10 mt-5">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Offer submitted</p>
                            <h2 className="mt-2 text-[28px] font-black leading-tight text-white">Варіант відправлено</h2>
                            <p className="mt-2 text-sm leading-relaxed text-white/58">
                                {b2bOfferSuccess.variantTitle || 'Авто'} додано до запиту {b2bOfferSuccess.requestRef}. Контакти залишаються закритими до погодженого процесу.
                            </p>
                        </div>
                    </section>
                    <section className="mt-4 grid grid-cols-1 gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setB2bOfferSuccess(null);
                                setView('STATUS');
                                void loadB2bActivity();
                            }}
                            className="rounded-[16px] py-4 text-sm font-black"
                            style={premiumCtaStyle}
                        >
                            Переглянути угоди
                        </button>
                        <button
                            type="button"
                            onClick={() => openB2BOffer()}
                            className="rounded-[16px] border border-white/10 py-3 text-sm font-bold text-white/72"
                        >
                            Подати ще варіант
                        </button>
                    </section>
                </div>
            );
        }

        return (
            <div className="animate-fade-in h-full overflow-y-auto bg-[#050608] px-5 pb-24 pt-7 text-white">
                <div className="flex flex-col gap-5">
                    <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#111417] p-5">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(120deg,rgba(255,255,255,0.14),transparent_58%)]" />
                        <div className="relative z-10">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">B2B offer</p>
                            <h2 className="mt-2 text-[28px] font-black leading-tight text-white">Запропонувати авто</h2>
                            <p className="mt-2 text-sm leading-relaxed text-white/58">
                                Вкажіть ID запиту і параметри авто. Контакт збережеться для admin review, але не відкриється партнеру до погодженого статусу.
                            </p>
                        </div>
                    </section>

                    <section className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
                        <div className="grid grid-cols-1 gap-3">
                            <label>
                                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">ID запиту</span>
                                <input
                                    className={fieldClass}
                                    placeholder="CD-2026-000123"
                                    value={b2bOfferForm.requestRef}
                                    onChange={e => updateField('requestRef', e.target.value)}
                                />
                            </label>
                            <label>
                                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Авто</span>
                                <input
                                    className={fieldClass}
                                    placeholder="Hyundai IONIQ 5 2024"
                                    value={b2bOfferForm.title}
                                    onChange={e => updateField('title', e.target.value)}
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label>
                                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Ціна, $</span>
                                    <input
                                        className={fieldClass}
                                        inputMode="numeric"
                                        placeholder="16000"
                                        value={b2bOfferForm.price}
                                        onChange={e => updateField('price', e.target.value)}
                                    />
                                </label>
                                <label>
                                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Рік</span>
                                    <input
                                        className={fieldClass}
                                        inputMode="numeric"
                                        placeholder="2024"
                                        value={b2bOfferForm.year}
                                        onChange={e => updateField('year', e.target.value)}
                                    />
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <label>
                                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Пробіг</span>
                                    <input
                                        className={fieldClass}
                                        inputMode="numeric"
                                        placeholder="17000"
                                        value={b2bOfferForm.mileage}
                                        onChange={e => updateField('mileage', e.target.value)}
                                    />
                                </label>
                                <label>
                                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Локація</span>
                                    <input
                                        className={fieldClass}
                                        placeholder="Lviv"
                                        value={b2bOfferForm.location}
                                        onChange={e => updateField('location', e.target.value)}
                                    />
                                </label>
                            </div>
                            <label>
                                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Стан / пошкодження</span>
                                <input
                                    className={fieldClass}
                                    placeholder="Передня частина, заводиться"
                                    value={b2bOfferForm.condition}
                                    onChange={e => updateField('condition', e.target.value)}
                                />
                            </label>
                            <label>
                                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Фото URL</span>
                                <input
                                    className={fieldClass}
                                    placeholder="https://..."
                                    value={b2bOfferForm.mediaUrl}
                                    onChange={e => updateField('mediaUrl', e.target.value)}
                                />
                            </label>
                            <label>
                                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Контакт для admin review</span>
                                <input
                                    className={fieldClass}
                                    placeholder="+380..."
                                    value={b2bOfferForm.contact}
                                    onChange={e => updateField('contact', e.target.value)}
                                />
                            </label>
                            <label>
                                <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">Коментар</span>
                                <textarea
                                    className={`${fieldClass} min-h-[96px] resize-none`}
                                    placeholder="Деталі по авто, торг, документи"
                                    value={b2bOfferForm.comment}
                                    onChange={e => updateField('comment', e.target.value)}
                                />
                            </label>
                        </div>

                        {b2bOfferError && (
                            <div className="mt-4 rounded-[16px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-50">
                                {b2bOfferError}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={submitB2BOffer}
                            disabled={b2bOfferSubmitting}
                            className="mt-5 flex w-full items-center justify-center gap-2 rounded-[16px] py-4 text-sm font-black disabled:opacity-60"
                            style={premiumCtaStyle}
                        >
                            {b2bOfferSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                            {b2bOfferSubmitting ? 'Відправляємо' : 'Подати варіант'}
                        </button>
                    </section>
                </div>
            </div>
        );
    };

    const renderB2BRequests = () => {
        const formatBudget = (item: MiniAppB2bActiveRequestItem) => {
            if (item.budgetMin && item.budgetMax) return `$${item.budgetMin.toLocaleString()} - $${item.budgetMax.toLocaleString()}`;
            if (item.budgetMax) return `до $${item.budgetMax.toLocaleString()}`;
            if (item.budgetMin) return `від $${item.budgetMin.toLocaleString()}`;
            return '—';
        };
        const formatYear = (item: MiniAppB2bActiveRequestItem) => {
            if (item.yearMin && item.yearMax) return `${item.yearMin}-${item.yearMax}`;
            if (item.yearMin) return `${item.yearMin}+`;
            if (item.yearMax) return `до ${item.yearMax}`;
            return '—';
        };
        const criteriaText = (item: MiniAppB2bActiveRequestItem) => {
            const requestCriteria = item.criteria?.request && typeof item.criteria.request === 'object'
                ? item.criteria.request as Record<string, unknown>
                : item.criteria || {};
            return [
                requestCriteria.brand,
                requestCriteria.model,
                requestCriteria.bodyType,
                requestCriteria.fuel
            ].map(value => String(value || '').trim()).filter(Boolean).join(' · ');
        };

        return (
            <div className="animate-fade-in h-full overflow-y-auto bg-[#050608] px-5 pb-24 pt-7 text-white">
                <div className="flex flex-col gap-4">
                    <section className="rounded-[24px] border border-white/10 bg-[#111417] p-5">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">Partner network</p>
                        <h2 className="mt-2 text-[28px] font-black leading-tight text-white">Запити мережі</h2>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-[14px] border border-white/10 bg-black/22 px-2 py-3">
                                <div className="text-lg font-black text-white">{b2bActiveRequests.length}</div>
                                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/34">Активні</div>
                            </div>
                            <div className="rounded-[14px] border border-white/10 bg-black/22 px-2 py-3">
                                <div className="text-lg font-black text-white">{b2bPortal?.partner?.role || '—'}</div>
                                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/34">Роль</div>
                            </div>
                            <button
                                type="button"
                                onClick={loadB2bActiveRequests}
                                disabled={b2bActiveRequestsLoading}
                                className="rounded-[14px] border border-white/10 bg-black/22 px-2 py-3 text-center disabled:opacity-50"
                            >
                                <div className="text-lg font-black text-white">{b2bActiveRequestsLoading ? '...' : '↻'}</div>
                                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-white/34">Оновити</div>
                            </button>
                        </div>
                    </section>

                    {b2bActiveRequestsError && (
                        <div className="rounded-[16px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-50">
                            {b2bActiveRequestsError}
                        </div>
                    )}

                    {b2bActiveRequestsLoading && !b2bActiveRequests.length ? (
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.045] p-5 text-sm text-white/52">
                            Завантажуємо запити...
                        </div>
                    ) : b2bActiveRequests.length ? (
                        b2bActiveRequests.map(item => (
                            <article key={item.id} className="rounded-[20px] border border-white/10 bg-[#111417] p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
                                            {item.publicId || item.id}
                                        </div>
                                        <h3 className="mt-1 line-clamp-2 text-lg font-black leading-tight text-white">
                                            {item.title || 'B2B запит'}
                                        </h3>
                                    </div>
                                    <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-2 py-1 text-[10px] font-bold text-white/62">
                                        {item.status || 'OPEN'}
                                    </div>
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                                    <div className="rounded-[14px] border border-white/10 bg-black/22 p-2">
                                        <div className="text-white/34">Бюджет</div>
                                        <div className="mt-0.5 font-black text-white">{formatBudget(item)}</div>
                                    </div>
                                    <div className="rounded-[14px] border border-white/10 bg-black/22 p-2">
                                        <div className="text-white/34">Рік</div>
                                        <div className="mt-0.5 font-black text-white">{formatYear(item)}</div>
                                    </div>
                                    <div className="rounded-[14px] border border-white/10 bg-black/22 p-2">
                                        <div className="text-white/34">Варіанти</div>
                                        <div className="mt-0.5 font-black text-white">{item.variantsCount ?? 0}</div>
                                    </div>
                                </div>

                                {(criteriaText(item) || item.city || item.description) && (
                                    <div className="mt-3 rounded-[14px] border border-white/10 bg-black/18 p-3 text-xs leading-relaxed text-white/50">
                                        {[criteriaText(item), item.city, item.description].filter(Boolean).join(' · ')}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => openB2BOffer(item.publicId || item.id)}
                                    className="mt-4 w-full rounded-[16px] py-3 text-sm font-black"
                                    style={premiumCtaStyle}
                                >
                                    Запропонувати авто
                                </button>
                            </article>
                        ))
                    ) : (
                        <div className="rounded-[18px] border border-white/10 bg-white/[0.045] p-5 text-sm text-white/52">
                            Активних запитів мережі поки немає.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderStatus = () => {
        const isB2BMode = surfaceMode === 'B2B';
        const headerTitle = isB2BMode ? 'Угоди B2B' : 'Мої заявки';
        const headerCopy = isB2BMode
            ? 'Статуси запитів, варіантів і FIT-черги для партнерської мережі.'
            : 'Перевір статус заявки або створи новий запит по конкретному авто.';
        const tiles = isB2BMode
            ? [
                ['Запити', 'CD-*', 'Публічний ID у каналі'],
                ['Варіанти', 'No contacts', 'Контакти приховані до FIT'],
                ['FIT', 'Admin', 'Передача адміну з контактами']
            ]
            : [
                ['Підбір', 'Активний', 'Запит під критерії'],
                ['Ціна/умови', 'По авто', 'Привʼязка до Inventory'],
                ['Контакт', 'Telegram', 'Нативний contact request']
            ];
        const formatActivityDate = (value?: string) => {
            if (!value) return '—';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return '—';
            return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' });
        };
        const formatVariantPrice = (variant: MiniAppB2bReceivedVariantItem) => {
            if (!variant.price) return '—';
            return formatPrice({ amount: variant.price, currency: variant.currency || 'USD' });
        };
        const decisionLabel = (value?: string | null) => {
            if (value === 'FIT') return 'FIT';
            if (value === 'NOT_FIT') return 'Не підходить';
            return 'Очікує рішення';
        };

        return (
            <div className="animate-fade-in h-full overflow-y-auto bg-[#050608] px-5 pb-24 pt-7">
                <div className="flex flex-col gap-5">
                    <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#111417] p-5">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(120deg,rgba(255,255,255,0.14),transparent_58%)]" />
                        <div className="relative z-10">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
                                {isB2BMode ? 'Partner workflow' : 'Lead workflow'}
                            </p>
                            <h2 className="mt-2 text-[28px] font-black leading-tight text-white">{headerTitle}</h2>
                            <p className="mt-2 text-sm leading-relaxed text-white/58">{headerCopy}</p>
                        </div>
                        <div className="relative z-10 mt-5 grid grid-cols-3 gap-2">
                            {tiles.map(([label, value, caption]) => (
                                <div key={label} className="rounded-[16px] border border-white/10 bg-black/24 p-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-white/34">{label}</div>
                                    <div className="mt-1 text-sm font-black text-white">{value}</div>
                                    <div className="mt-1 text-[10px] leading-snug text-white/36">{caption}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
                        <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/42">
                            ID запиту
                        </label>
                        <div className="flex gap-2">
                            <input
                                className="min-w-0 flex-1 rounded-[16px] border border-white/10 bg-black/28 px-4 py-3 text-white outline-none placeholder-white/28 focus:border-white/30"
                                placeholder={isB2BMode ? 'CD-2026-000123' : 'RQ-12345'}
                                value={statusQuery.publicId}
                                onChange={e => setStatusQuery({ ...statusQuery, publicId: e.target.value })}
                            />
                            <button
                                onClick={checkRequestStatus}
                                className="shrink-0 rounded-[16px] px-4 py-3 text-sm font-black"
                                style={premiumCtaStyle}
                            >
                                Перевірити
                            </button>
                        </div>
                    </section>

                    {statusResult && (
                        <section className="rounded-[22px] border border-white/10 bg-[#15181c] p-4 text-white">
                            {statusResult.error ? (
                                <div className="rounded-[16px] border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-50">
                                    {statusResult.error}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">ID запиту</div>
                                        <div className="mt-1 text-lg font-black text-white">{statusResult.publicId || statusResult.id}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-[16px] border border-white/10 bg-black/22 p-3">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/34">Статус</div>
                                            <div className="mt-1 font-black text-white">{statusResult.status || '—'}</div>
                                        </div>
                                        <div className="rounded-[16px] border border-white/10 bg-black/22 p-3">
                                            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/34">Джерело</div>
                                            <div className="mt-1 font-black text-white">{statusResult.source || (isB2BMode ? 'B2B Bot' : 'LeadBot')}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {isB2BMode && (
                        <section className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4 text-white">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-black text-white">Моя активність</h3>
                                    <p className="mt-1 text-xs leading-relaxed text-white/44">Запити і варіанти з approved partner account.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={loadB2bActivity}
                                    disabled={b2bActivityLoading}
                                    className="shrink-0 rounded-[14px] border border-white/10 px-3 py-2 text-xs font-black text-white/70 disabled:opacity-50"
                                >
                                    {b2bActivityLoading ? 'Оновлення' : 'Оновити'}
                                </button>
                            </div>

                            {b2bActivityError && (
                                <div className="mt-4 rounded-[16px] border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-50">
                                    {b2bActivityError}
                                </div>
                            )}

                            <div className="mt-4 flex flex-col gap-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Мої запити</div>
                                {b2bActivityLoading && !b2bMyRequests.length ? (
                                    <div className="rounded-[16px] border border-white/10 bg-black/22 p-4 text-sm text-white/52">Завантажуємо запити...</div>
                                ) : b2bMyRequests.length ? (
                                    b2bMyRequests.slice(0, 5).map(item => (
                                        <div key={item.id} className="rounded-[16px] border border-white/10 bg-black/24 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-black text-white">{item.publicId || item.id}</div>
                                                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/50">{item.title || 'B2B запит'}</div>
                                                </div>
                                                <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-2 py-1 text-[10px] font-bold text-white/62">
                                                    {item.status || '—'}
                                                </div>
                                            </div>
                                            <div className="mt-2 text-[11px] text-white/34">{formatActivityDate(item.createdAt)}</div>
                                            <button
                                                type="button"
                                                onClick={() => openB2BOffer(item.publicId || item.id)}
                                                className="mt-3 w-full rounded-[14px] border border-white/10 bg-white/[0.055] py-3 text-xs font-black text-white/72"
                                            >
                                                Запропонувати авто
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-[16px] border border-white/10 bg-black/22 p-4 text-sm text-white/52">
                                        Ще немає створених B2B запитів.
                                    </div>
                                )}
                            </div>

                            <div className="mt-5 flex flex-col gap-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/38">Отримані варіанти</div>
                                {b2bActivityLoading && !b2bReceivedVariants.length ? (
                                    <div className="rounded-[16px] border border-white/10 bg-black/22 p-4 text-sm text-white/52">Завантажуємо варіанти...</div>
                                ) : b2bReceivedVariants.length ? (
                                    b2bReceivedVariants.slice(0, 5).map(item => {
                                        const fitLoading = b2bDecisionLoadingId === `${item.id}:FIT`;
                                        const notFitLoading = b2bDecisionLoadingId === `${item.id}:NOT_FIT`;
                                        return (
                                            <div key={item.id} className="rounded-[18px] border border-white/10 bg-[#111417] p-3">
                                                <div className="flex gap-3">
                                                    {item.thumbnail ? (
                                                        <img src={item.thumbnail} alt="" className="size-16 shrink-0 rounded-[14px] object-cover bg-white/10" />
                                                    ) : (
                                                        <div className="flex size-16 shrink-0 items-center justify-center rounded-[14px] border border-white/10 bg-black/24 text-white/32">
                                                            <ImageIcon size={20} />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-black text-white">{item.title || 'Варіант авто'}</div>
                                                        <div className="mt-1 text-xs font-bold text-white/70">{formatVariantPrice(item)}</div>
                                                        <div className="mt-1 truncate text-[11px] text-white/40">
                                                            {[
                                                                item.year ? `${item.year}` : '',
                                                                item.mileage ? formatMileage(item.mileage) : '',
                                                                item.location || ''
                                                            ].filter(Boolean).join(' · ') || 'Деталі уточнюються'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                                                    <div className="rounded-[14px] border border-white/10 bg-black/22 p-2">
                                                        <div className="text-white/34">Запит</div>
                                                        <div className="mt-0.5 truncate font-black text-white">{item.requestPublicId || item.requestId || '—'}</div>
                                                    </div>
                                                    <div className="rounded-[14px] border border-white/10 bg-black/22 p-2">
                                                        <div className="text-white/34">Рішення</div>
                                                        <div className="mt-0.5 truncate font-black text-white">{decisionLabel(item.requesterDecision)}</div>
                                                    </div>
                                                </div>
                                                <div className="mt-3 grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleB2bVariantDecision(item.id, 'FIT')}
                                                        disabled={Boolean(b2bDecisionLoadingId)}
                                                        className="rounded-[14px] py-3 text-xs font-black disabled:opacity-50"
                                                        style={premiumCtaStyle}
                                                    >
                                                        {fitLoading ? 'Зберігаємо' : 'FIT'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleB2bVariantDecision(item.id, 'NOT_FIT')}
                                                        disabled={Boolean(b2bDecisionLoadingId)}
                                                        className="rounded-[14px] border border-white/10 bg-black/22 py-3 text-xs font-black text-white/70 disabled:opacity-50"
                                                    >
                                                        {notFitLoading ? 'Зберігаємо' : 'Не підходить'}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-[16px] border border-white/10 bg-black/22 p-4 text-sm text-white/52">
                                        По твоїх запитах ще немає отриманих варіантів.
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    <section className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => openRequest('BUY')}
                            className="rounded-[18px] border border-white/10 bg-white/[0.045] p-4 text-left active:scale-[0.98]"
                        >
                            <div className="mb-3 flex size-10 items-center justify-center rounded-[14px] border border-white/10 bg-black/28 text-white/72">
                                <Search size={19} />
                            </div>
                            <div className="text-sm font-black text-white">{isB2BMode ? 'Новий B2B запит' : 'Новий запит'}</div>
                            <div className="mt-1 text-[11px] text-white/42">{isB2BMode ? 'Пошук авто у мережі' : 'Підбір або умови'}</div>
                        </button>
                        <button
                            onClick={() => isB2BMode ? openB2BOffer() : setView('CONTACTS')}
                            className="rounded-[18px] border border-white/10 bg-white/[0.045] p-4 text-left active:scale-[0.98]"
                        >
                            <div className="mb-3 flex size-10 items-center justify-center rounded-[14px] border border-white/10 bg-black/28 text-white/72">
                                {isB2BMode ? <Plus size={19} /> : <MessageSquare size={19} />}
                            </div>
                            <div className="text-sm font-black text-white">{isB2BMode ? 'Запропонувати авто' : 'Менеджер'}</div>
                            <div className="mt-1 text-[11px] text-white/42">{isB2BMode ? 'Варіант по ID запиту' : 'Контакти CarTié'}</div>
                        </button>
                    </section>
                </div>
            </div>
        );
    };

    const getContactLinks = () => {
        const contacts = config.contacts || {};
        const username = String(
            contacts.telegramBot
            || activeBot?.botUsername
            || activeBot?.username
            || ''
        ).replace(/^@/, '').trim();
        const links = Array.isArray(contacts.links) ? contacts.links : [];
        const mapsLink = links.find(link => /лок|map|maps/i.test(`${link.label} ${link.url}`))?.url;
        const iconForLink = (label: string, url: string) => {
            const text = `${label} ${url}`.toLowerCase();
            if (text.includes('instagram')) return 'Instagram';
            if (text.includes('youtube')) return 'Youtube';
            if (text.includes('tiktok')) return 'Video';
            if (text.includes('maps') || text.includes('локац')) return 'MapPinned';
            if (text.includes('t.me') || text.includes('telegram')) return 'Send';
            return 'Globe';
        };
        const normalizeTelegramBotUrl = (value: string) => {
            if (/^https?:\/\//i.test(value)) return value;
            return `https://t.me/${value.replace(/^@/, '')}`;
        };
        const items = [
            contacts.telegramChannel ? { label: 'Telegram канал', caption: 'Новини та актуальні пропозиції', url: contacts.telegramChannel, icon: 'Send' } : null,
            username ? { label: 'Менеджер у Telegram', caption: 'Швидкий звʼязок по авто', url: normalizeTelegramBotUrl(username), icon: 'MessageCircle' } : null,
            contacts.instagram ? { label: 'Instagram', caption: 'Фото, відео та новини', url: contacts.instagram, icon: 'Instagram' } : null,
            contacts.website ? { label: 'Сайт / квіз', caption: 'Залишити заявку на підбір', url: contacts.website, icon: 'Globe' } : null,
            mapsLink && contacts.address ? { label: 'Локація', caption: contacts.address, url: mapsLink, icon: 'MapPinned' } : null,
            contacts.phone ? { label: 'Телефон', caption: contacts.phone, url: `tel:${contacts.phone.replace(/[^\d+]/g, '')}`, icon: 'Phone' } : null,
            ...links
                .filter(link => !mapsLink || link.url !== mapsLink)
                .map(link => ({
                    label: link.label,
                    caption: link.url.replace(/^https?:\/\//, ''),
                    url: link.url,
                    icon: iconForLink(link.label, link.url)
                }))
        ].filter((item): item is { label: string; caption?: string; url: string; icon: string } => Boolean(item?.url));
        return items;
    };

    const openContactUrl = (link: string) => {
        const tg = (window as any).Telegram?.WebApp;
        if (/^https:\/\/t\.me\//i.test(link) && tg?.openTelegramLink) {
            tg.openTelegramLink(link);
            return;
        }
        if (/^https?:\/\//i.test(link) && tg?.openLink) {
            tg.openLink(link);
            return;
        }
        window.open(link, '_blank');
    };

    const openSupportLink = () => {
        const configuredLink = String(
            (config as any)?.supportUrl
            || (config as any)?.supportLink
            || (config?.actions || []).find(action => /support|підтрим/i.test(String(action.label || '')) && action.actionType === 'LINK')?.value
            || ''
        ).trim();
        const username = String(activeBot?.botUsername || activeBot?.username || '').replace(/^@/, '').trim();
        const fallbackLink = username ? `https://t.me/${username}` : '';
        const link = configuredLink || fallbackLink;
        if (!link) {
            setConfigWarning('Контакт підтримки не налаштовано. Напишіть у чаті бота.');
            return;
        }
        openContactUrl(link);
    };

    const renderSupport = () => {
        const isB2BMode = surfaceMode === 'B2B';
        const supportActions = isB2BMode
            ? [
                ['Статус угоди', 'Перевірити B2B request або FIT', () => setView('STATUS')],
                ['Новий запит', 'Створити запит для партнерів', () => openRequest('BUY')],
                ['Склад мережі', 'Переглянути доступні авто', () => setView('INVENTORY')]
            ] as const
            : [
                ['Підібрати авто', 'Запит під бюджет та критерії', () => openRequest('BUY')],
                ['Каталог', 'Авто в наявності та дорозі', () => setView('INVENTORY')],
                ['Контакти', 'Канали, соцмережі, локація', () => setView('CONTACTS')]
            ] as const;

        return (
            <div className="animate-fade-in h-full overflow-y-auto bg-[#050608] px-5 pb-24 pt-7">
                <div className="flex flex-col gap-4">
                    <section className="relative overflow-hidden rounded-[24px] border border-white/10 bg-[#111417] p-5">
                        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(120deg,rgba(255,255,255,0.14),transparent_58%)]" />
                        <div className="relative z-10">
                            <div className="mb-4 flex size-12 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.06] text-white/80">
                                <MessageSquare size={24} />
                            </div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40">
                                {isB2BMode ? 'Dealer support' : 'Client support'}
                            </p>
                            <h2 className="mt-2 text-[28px] font-black leading-tight text-white">
                                {isB2BMode ? 'Підтримка B2B процесу' : 'Звʼязок з CarTié'}
                            </h2>
                            <p className="mt-2 text-sm leading-relaxed text-white/58">
                                {isB2BMode
                                    ? 'Допоможемо з партнерським доступом, заявками, варіантами та координацією FIT.'
                                    : 'Менеджер допоможе з підбором, умовами, продажем або статусом заявки.'}
                            </p>
                        </div>
                        <button
                            onClick={() => startBotFlow('SUPPORT')}
                            className="relative z-10 mt-5 w-full rounded-[16px] py-4 font-black"
                            style={premiumCtaStyle}
                        >
                            {isB2BMode ? 'Написати B2B підтримці' : 'Написати менеджеру в боті'}
                        </button>
                    </section>

                    <section className="grid grid-cols-1 gap-3">
                        {supportActions.map(([title, caption, onClick]) => (
                            <button
                                key={title}
                                onClick={onClick}
                                className="flex min-h-[72px] items-center justify-between gap-3 rounded-[18px] border border-white/10 bg-white/[0.045] px-4 text-left active:scale-[0.99]"
                            >
                                <span className="min-w-0">
                                    <span className="block text-sm font-black text-white">{title}</span>
                                    <span className="mt-1 block truncate text-xs text-white/42">{caption}</span>
                                </span>
                                <ChevronRight size={18} className="shrink-0 text-white/36" />
                            </button>
                        ))}
                    </section>
                </div>
            </div>
        );
    };

    const renderContacts = () => {
        const links = getContactLinks();
        return (
            <div className="animate-fade-in pb-24 p-5 h-full overflow-y-auto flex flex-col bg-black">
                <div className="relative overflow-hidden rounded-[28px] border border-white/10 p-5" style={graphitePanelStyle}>
                    <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_30%_0%,rgba(255,255,255,0.18),transparent_55%)] pointer-events-none" />
                    <div className="relative z-10">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mb-4 text-[#E4E7EC] border border-white/10">
                            <Phone size={22} />
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-white/45 font-bold">CarTié contacts</p>
                        <h2 className="text-3xl font-bold text-white mt-1 mb-2">Звʼяжіться з нами</h2>
                        <p className="text-white/60 text-sm mb-5 leading-relaxed">
                            Офіційні канали, шоурум, менеджер і соцмережі CarTié в одному місці.
                        </p>
                    </div>
                    <div className="relative z-10 space-y-2">
                        {links.map(link => (
                            <button
                                key={`${link.label}_${link.url}`}
                                onClick={() => openContactUrl(link.url)}
                                className="w-full min-h-[66px] rounded-2xl border border-white/10 bg-white/[0.055] text-white flex items-center justify-between px-4 active:scale-[0.99] transition-transform"
                            >
                                <span className="flex min-w-0 items-center gap-3">
                                    <span className="w-10 h-10 shrink-0 rounded-2xl bg-black/35 border border-white/10 flex items-center justify-center text-white/86">
                                        {link.icon === 'Instagram' ? <Instagram size={19} />
                                            : link.icon === 'Globe' ? <Globe size={19} />
                                                : link.icon === 'Phone' ? <Phone size={19} />
                                                    : link.icon === 'MapPinned' ? <MapPinned size={19} />
                                                        : link.icon === 'Youtube' ? <Youtube size={19} />
                                                            : link.icon === 'Video' ? <Video size={19} />
                                                                : link.icon === 'Send' ? <Send size={19} />
                                                                    : <MessageSquare size={19} />}
                                    </span>
                                    <span className="min-w-0 text-left">
                                        <span className="block font-semibold leading-tight truncate">{link.label}</span>
                                        {link.caption && <span className="block text-xs text-white/48 truncate mt-1">{link.caption}</span>}
                                    </span>
                                </span>
                                <ChevronRight size={18} className="text-white/40" />
                            </button>
                        ))}
                        {!links.length && (
                            <div className="text-white/55 text-sm border border-white/10 rounded-xl p-4">
                                Контакти не налаштовані. Відкрийте чат з ботом і натисніть /start.
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => startBotFlow('SUPPORT')}
                        className="relative z-10 w-full mt-4 py-4 rounded-2xl font-bold"
                        style={premiumCtaStyle}
                    >
                        Написати менеджеру
                    </button>
                </div>
            </div>
        );
    };

    const findTaxonomyOption = (
        label: string,
        options: Array<{ id: string; label: string; aliases?: string[] }>
    ) => {
        const normalized = label.trim().toLowerCase();
        const alternative = normalized === 'інша марка' || normalized === 'інша модель' ? 'other' : normalized;
        return options.find(option =>
            option.label.toLowerCase() === normalized
            || option.label.toLowerCase() === alternative
            || (option.aliases || []).some(alias => alias.toLowerCase() === normalized || alias.toLowerCase() === alternative)
        );
    };

    const toTaxonomyOption = (
        label: string,
        options: Array<{ id: string; label: string; aliases?: string[] }>
    ) => {
        const clean = label.trim();
        if (!clean) return undefined;
        const match = findTaxonomyOption(clean, options);
        return {
            id: match?.id || taxonomyId(clean),
            label: match?.label || clean
        };
    };

    const toModelTaxonomyOption = (label: string, selectedBrands: Array<{ id: string; label: string }>) => {
        const clean = label.trim();
        if (!clean) return undefined;
        const brandCandidates = selectedBrands.length
            ? selectedBrands
            : (vehicleTaxonomy?.brands || []).map(brand => ({ id: brand.id, label: brand.label }));
        for (const brand of brandCandidates) {
            const sourceBrand = (vehicleTaxonomy?.brands || []).find(item => item.id === brand.id || item.label === brand.label);
            const match = sourceBrand?.models?.find(model =>
                model.label.toLowerCase() === clean.toLowerCase()
                || (clean === 'Інша модель' && model.label.toLowerCase() === 'other')
                || (model.aliases || []).some(alias => alias.toLowerCase() === clean.toLowerCase())
            );
            if (sourceBrand && match) return { brandId: sourceBrand.id, id: match.id, label: match.label };
        }
        return { brandId: selectedBrands[0]?.id, id: taxonomyId(clean), label: clean };
    };

    const handleNextStep = async () => {
        const isB2BMode = surfaceMode === 'B2B';
        if (isRequestSubmitting) return;
        if (reqStep === 1) {
            setRequestSubmitError(null);
            if (isB2BMode) {
                if (!reqData.brand.trim() && !(reqData.brands || []).length) {
                    setConfigWarning('Для B2B запиту вкажіть марку та модель.');
                    return;
                }
            }
            setReqStep(2);
            return;
        }
        if (reqStep < 4) {
            setRequestSubmitError(null);
            setReqStep(prev => Math.min(4, prev + 1));
            return;
        }

        {
            const submitInitData = initData || readRuntimeTelegramInitData();
            if (!submitInitData) {
                const message = 'Надсилання запиту доступне лише в Telegram Mini App.';
                setTelegramWriteState(telegramWriteState === 'outside_telegram' ? 'outside_telegram' : 'missing_initdata');
                setConfigWarning(message);
                setRequestSubmitError({ message, openBotUrl: resolveOpenBotUrl() });
                trackEvent('write_blocked_missing_initdata', { view: 'REQUEST', requestType });
                return;
            }
            setTelegramWriteState('ready');
            if (!initData) setInitData(submitInitData);
            if (isB2BMode && !reqCompany.trim()) {
                setConfigWarning('Для B2B запиту вкажіть компанію.');
                return;
            }

            try {
                setIsRequestSubmitting(true);
                setRequestSubmitError(null);
                const slug = targetSlug || 'system';
                const fallbackListingId = getCarId(selectedCar);
                const selectedListingIds = selectedRequestCarIds.length
                    ? selectedRequestCarIds
                    : (fallbackListingId ? [fallbackListingId] : []);
                const effectiveRequestSubtype = deriveRequestSubtype(selectedListingIds);
                const selectedTitles = selectedRequestCars.map(car => car.title).filter(Boolean);
                const listingId = selectedListingIds[0] || undefined;
                const submitId = requestSubmitIdRef.current
                    || (window.crypto?.randomUUID ? window.crypto.randomUUID() : `submit_${Date.now()}_${Math.random().toString(16).slice(2)}`);
                requestSubmitIdRef.current = submitId;
                const effectiveBrand = reqData.brand === 'Інша марка' ? reqData.brandCustom.trim() : reqData.brand.trim();
                const effectiveModel = reqData.model === 'Інша модель' ? reqData.modelCustom.trim() : reqData.model.trim();
                const effectiveBrands = (reqData.brands?.length ? reqData.brands : (effectiveBrand ? [effectiveBrand] : []))
                    .map(item => item === 'Інша марка' ? reqData.brandCustom.trim() : item.trim())
                    .filter(Boolean);
                const effectiveModels = (reqData.models?.length ? reqData.models : (effectiveModel ? [effectiveModel] : []))
                    .map(item => item === 'Інша модель' ? reqData.modelCustom.trim() : item.trim())
                    .filter(Boolean);
                const effectiveBodyTypes = (reqData.bodyTypes?.length ? reqData.bodyTypes : (reqData.bodyType ? [reqData.bodyType] : []))
                    .map(item => item.trim())
                    .filter(Boolean);
                const brandOptions = vehicleTaxonomy?.brands || [];
                const normalizedBrands = effectiveBrands
                    .map(label => toTaxonomyOption(label, brandOptions))
                    .filter((item): item is { id: string; label: string } => Boolean(item));
                const normalizedModels = effectiveModels
                    .map(label => toModelTaxonomyOption(label, normalizedBrands))
                    .filter((item): item is { brandId?: string; id: string; label: string } => Boolean(item));
                const normalizedBodyTypes = effectiveBodyTypes
                    .map(label => toTaxonomyOption(label, vehicleTaxonomy?.bodyTypes || []))
                    .filter((item): item is { id: string; label: string } => Boolean(item));
                const normalizedFuel = reqFuel ? toTaxonomyOption(reqFuel, vehicleTaxonomy?.fuels || []) : undefined;
                const normalizedCity = reqData.city ? toTaxonomyOption(reqData.city, vehicleTaxonomy?.cities || []) : undefined;
                const criteria = {
                    brand: effectiveBrands[0] || effectiveBrand || undefined,
                    model: effectiveModels[0] || effectiveModel || undefined,
                    brands: normalizedBrands.length ? normalizedBrands : undefined,
                    models: normalizedModels.length ? normalizedModels : undefined,
                    yearFrom: reqData.yearMin || undefined,
                    yearTo: reqData.yearMax || undefined,
                    budgetMin: reqData.budgetMin || undefined,
                    budgetMax: reqData.budgetMax || undefined,
                    bodyType: effectiveBodyTypes[0] || undefined,
                    bodyTypes: normalizedBodyTypes.length ? normalizedBodyTypes : undefined,
                    fuel: reqFuel || undefined,
                    fuels: normalizedFuel ? [normalizedFuel] : undefined,
                    mileage: reqMileage || undefined,
                    city: reqData.city || undefined,
                    cities: normalizedCity ? [normalizedCity] : undefined,
                    selectedCars: selectedTitles.length ? selectedTitles : undefined
                };

                if (!isB2BMode) {
                    const response = await createMiniAppLeadIntent({
                        slug,
                        initData: submitInitData,
                        kind: selectedListingIds.length ? 'PRICE_TERMS' : 'PICK',
                        carListingId: listingId || undefined,
                        carListingIds: selectedListingIds.length ? selectedListingIds : undefined,
                        criteria,
                        comment: reqComment || undefined,
                        tracking: { ...trackingMeta, submitId, requestType: 'BUY' }
                    });
                    const shouldClose = handleLeadIntentOutcome(response);
                    trackEvent('LeadSubmit', {
                        requestSubtype: effectiveRequestSubtype,
                        selectedCarsCount: selectedListingIds.length,
                        legacyEventType: 'lead_intent_pick_submitted'
                    });
                    clearRequestSelection();
                    requestSubmitIdRef.current = null;
                    if (shouldClose) closeMiniAppOrShowSuccess();
                    return;
                }

                const descriptionParts = [
                    requestType === 'SELL' ? 'Тип: продаж авто' : 'Тип: підбір авто',
                    [effectiveBrand, effectiveModel].filter(Boolean).length ? `Марка/модель: ${[effectiveBrand, effectiveModel].filter(Boolean).join(' ')}` : null,
                    reqData.yearMin || reqData.yearMax ? `Рік: ${reqData.yearMin || 'будь-який'} - ${reqData.yearMax || 'будь-який'}` : null,
                    reqData.budgetMin || reqData.budgetMax ? `Бюджет: ${reqData.budgetMin || '0'} - ${reqData.budgetMax || '∞'}` : null,
                    effectiveBodyTypes.length ? `Кузов: ${effectiveBodyTypes.join(', ')}` : null,
                    reqMileage ? `Пробіг: ${reqMileage}` : null,
                    reqFuel ? `Пальне: ${reqFuel}` : null,
                    reqCompany ? `Компанія: ${reqCompany}` : null,
                    reqComment ? `Коментар: ${reqComment}` : null,
                    selectedTitles.length > 1 ? `Обрані авто: ${selectedTitles.join(', ')}` : null
                ].filter(Boolean);

                const requestPayload = {
                    slug,
                    initData: submitInitData,
                    requestType,
                    requestSubtype: effectiveRequestSubtype,
                    title: selectedTitles.length > 1
                        ? `${isB2BMode ? 'B2B запит' : (requestType === 'SELL' ? 'Продаж' : 'Запит')}: ${selectedTitles.length} авто`
                        : (listingId && selectedCar?.title
                            ? `${isB2BMode ? 'B2B запит' : (requestType === 'SELL' ? 'Продаж' : 'Запит')}: ${selectedCar.title}`
                            : `${isB2BMode ? 'B2B запит' : (requestType === 'SELL' ? 'Продаж' : 'Запит')}: ${effectiveBrand || 'Авто'} ${reqData.yearMin || ''}`.trim()),
                    description: descriptionParts.length ? descriptionParts.join('\n') : undefined,
                    budgetMax: reqData.budgetMax ? Number(reqData.budgetMax) : undefined,
                    yearMin: reqData.yearMin ? Number(reqData.yearMin) : undefined,
                    comment: reqComment || undefined,
                    carListingId: listingId || undefined,
                    carListingIds: selectedListingIds.length ? selectedListingIds : undefined,
                    payload: {
                        mode: isB2BMode ? 'B2B' : 'LEAD',
                        requestType,
                        requestSubtype: effectiveRequestSubtype,
                        mileage: reqMileage || undefined,
                        fuel: reqFuel || undefined,
                        companyName: reqCompany || undefined,
                        criteria,
                        selectedCars: selectedTitles.length ? selectedTitles : undefined
                    },
                    tracking: { ...trackingMeta, submitId, requestType },
                    telegram: {
                        userId: tgUser?.id ? String(tgUser.id) : undefined,
                        username: tgUser?.username,
                        name: [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ')
                    }
                };

                await createMiniAppRequest(requestPayload);
                trackEvent(resolveMiniAppSubmitEventType({ isB2BMode, requestType }), {
                    requestType,
                    requestSubtype: effectiveRequestSubtype,
                    selectedCarsCount: selectedListingIds.length,
                    legacyEventType: 'request_submitted'
                });
                clearRequestSelection();
                requestSubmitIdRef.current = null;
                setReqStep(5);
            } catch (e) {
                emitMiniAppEvent('error', 'MiniApp request submit failed', buildSafeRuntimeDiagnostics({
                    error: e instanceof Error ? e.message : String(e),
                    code: typeof e === 'object' && e && 'code' in e ? String((e as any).code || '') : undefined,
                    requestType
                }));
                const message = resolveWriteFailureMessage(e, 'Не вдалося надіслати запит.', { requestType });
                setRequestSubmitError({ message, openBotUrl: resolveOpenBotUrl() });
                pushToast(message, 'error');
            } finally {
                setIsRequestSubmitting(false);
            }
        }
    };

    const renderRequest = () => {
        const telegramWriteUnavailableMessage = telegramWriteState === 'outside_telegram'
            ? 'Відкрийте Mini App саме з кнопки Telegram-бота, щоб надіслати запит.'
            : telegramWriteState === 'invalid_initdata'
                ? 'Сесія Telegram застаріла. Закрийте це вікно і відкрийте Mini App повторно з бота.'
                : telegramWriteState === 'missing_initdata'
                    ? 'Telegram відкрив Mini App без захищеної сесії. Закрийте це вікно і відкрийте Mini App кнопкою в чаті бота.'
                    : 'Для надсилання потрібна захищена сесія Telegram Mini App.';

        return (
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
                reqComment={reqComment}
                setReqComment={setReqComment}
                selectedCarsCount={selectedRequestCarIds.length}
                selectedCarsPreview={selectedRequestCars.map(car => car.title).filter(Boolean).slice(0, 3)}
                onClearSelectedCars={clearRequestSelection}
                hasTelegramInit={hasTelegramInit}
                telegramWriteUnavailableMessage={telegramWriteUnavailableMessage}
                primaryColor={primaryColor}
                surfaceMode={surfaceMode}
                requestType={requestType}
                taxonomy={vehicleTaxonomy}
                showInlineAction={true}
                actionLabel={isRequestSubmitting ? 'Надсилання...' : (reqStep >= 4 ? 'Надіслати' : 'Далі')}
                actionDisabled={isRequestSubmitting}
                submitError={requestSubmitError}
                openBotUrl={resolveOpenBotUrl()}
                onOpenBot={openBotUrl}
                onDismissSubmitError={() => setRequestSubmitError(null)}
                onNextStep={handleNextStep}
                onBackStep={() => setReqStep(prev => Math.max(1, prev - 1))}
                onHome={() => { setReqStep(1); setView('HOME'); }}
            />
        );
    };

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
        if (view === 'REQUEST' || view === 'STATUS' || view === 'OFFER') return null;
        return (
            <div className="absolute bottom-20 left-4 right-4 z-30">
                <div className="bg-[#111214] border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur">
                    <div className="text-xs text-white/60 mb-2">
                        Обрано авто: <span className="text-white font-bold">{selectedRequestCarIds.length}</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={surfaceMode === 'B2B' ? openRequestForSelectedCars : submitSelectedCarsInterest}
                            className="flex-1 py-2.5 rounded-xl font-bold text-black text-sm"
                            style={premiumCtaStyle}
                        >
                            {surfaceMode === 'B2B' ? 'Створити запит' : 'Дізнатись умови'}
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
            case 'Car': return <Car {...props} />;
            case 'Truck': return <Truck {...props} />;
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
            case 'Globe': return <Globe {...props} />;
            case 'Instagram': return <Instagram {...props} />;
            case 'Send': return <Send {...props} />;
            case 'MapPinned': return <MapPinned {...props} />;
            case 'Youtube': return <Youtube {...props} />;
            case 'Video': return <Video {...props} />;
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
                {view === 'B2B_REQUESTS' && renderB2BRequests()}
                {view === 'OFFER' && renderB2BOffer()}
                {view === 'PROFILE' && renderProfile()}
                {view === 'SUPPORT' && renderSupport()}
                {view === 'CONTACTS' && renderContacts()}
                {renderSelectionBar()}

                {lightboxCar && (
                    <div className="absolute inset-0 bg-black z-[100] flex flex-col">
                        {(() => {
                            const lightboxImages = getCarImages(lightboxCar);
                            const hasMultiple = lightboxImages.length > 1;
                            return (
                                <>
                                    <div className="p-4 flex justify-between items-center">
                                        <h3 className="text-white font-bold truncate">{lightboxCar.presentation?.title || lightboxCar.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={shareLightboxCar}
                                                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center"
                                                aria-label="Поділитися"
                                            >
                                                <Share2 size={18} className="text-white" />
                                            </button>
                                            <button
                                                onClick={() => setLightboxCar(null)}
                                                className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center"
                                                aria-label="Закрити"
                                            >
                                                <X size={20} className="text-white" />
                                            </button>
                                        </div>
                                    </div>
                                    <div
                                        className="flex-1 relative flex items-center justify-center touch-pan-y"
                                        onTouchStart={(event) => {
                                            const touch = event.touches[0];
                                            lightboxTouchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
                                        }}
                                        onTouchEnd={(event) => {
                                            const start = lightboxTouchStartRef.current;
                                            const touch = event.changedTouches[0];
                                            lightboxTouchStartRef.current = null;
                                            if (!start || !touch) return;
                                            const dx = touch.clientX - start.x;
                                            const dy = touch.clientY - start.y;
                                            if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
                                            moveLightbox(dx < 0 ? 1 : -1);
                                        }}
                                    >
                                        {!lightboxImageLoaded && !lightboxImageError && (
                                            <div className="absolute inset-0 flex items-center justify-center text-white/70">
                                                <Loader2 size={28} className="animate-spin" />
                                            </div>
                                        )}
                                        <img
                                            src={lightboxImages[lightboxImageIndex] || lightboxCar.thumbnail || PLACEHOLDER_IMAGE}
                                            className={`max-w-full max-h-full object-contain transition-opacity ${lightboxImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                                            onLoad={() => setLightboxImageLoaded(true)}
                                            onError={() => {
                                                setLightboxImageError(true);
                                                setLightboxImageLoaded(true);
                                            }}
                                        />
                                        {lightboxImageError && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/50">
                                                <ImageIcon size={42} />
                                                <div className="text-sm">Фото недоступне</div>
                                            </div>
                                        )}
                                        {hasMultiple && (
                                            <>
                                                {lightboxImageIndex > 0 && (
                                                    <button
                                                        onClick={() => moveLightbox(-1)}
                                                        className="absolute left-4 w-12 h-12 bg-black/50 backdrop-blur rounded-full flex items-center justify-center"
                                                    >
                                                        <ChevronLeft size={24} className="text-white" />
                                                    </button>
                                                )}
                                                {lightboxImageIndex < lightboxImages.length - 1 && (
                                                    <button
                                                        onClick={() => moveLightbox(1)}
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
