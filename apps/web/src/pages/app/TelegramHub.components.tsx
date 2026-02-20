import React, { useState, useEffect } from 'react';
import { Data } from '../../services/data';
import { ApiClient } from '../../services/apiClient';
import { TelegramAPI } from '../../services/telegram';
import { ShowcaseService } from '../../services/showcaseService';
import { useToast } from '../../contexts/ToastContext';
import { Bot, Showcase } from '../../types';
import { buildDefaultBotMenuConfig, buildDefaultMiniAppConfig } from '../../services/defaults';
import { AlertTriangle, Activity, Globe, Terminal } from 'lucide-react';

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');
const miniAppBuildTag = String((import.meta as any)?.env?.VITE_BUILD_ID || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);

const resolveBaseUrl = (raw: string) => {
    const input = (raw || '').trim();
    try {
        const url = new URL(input);
        // If user pasted full miniapp link (/p/app/:slug), keep origin as base
        const hasMini = /\/p\/app\//.test(url.pathname);
        return {
            base: hasMini ? url.origin : stripTrailingSlash(url.origin + url.pathname),
            detectedSlug: (() => {
                const m = url.pathname.match(/\/p\/app\/([^/]+)$/);
                return m?.[1] || undefined;
            })()
        };
    } catch {
        return { base: stripTrailingSlash(input), detectedSlug: undefined };
    }
};

const buildMiniAppUrl = (baseUrl: string, slug: string) => {
    const base = stripTrailingSlash(baseUrl || '');
    const raw = /\/p\/app\//.test(base) ? base : `${base}/p/app/${slug}`;
    try {
        const url = new URL(raw);
        if (miniAppBuildTag && !url.searchParams.has('v')) {
            url.searchParams.set('v', miniAppBuildTag);
        }
        return url.toString();
    } catch {
        return raw;
    }
};

const normalizeTemplate = (value: unknown): 'CLIENT_LEAD' | 'B2B' => {
    return String(value || '').toUpperCase() === 'B2B' ? 'B2B' : 'CLIENT_LEAD';
};

export const AddBotModal = ({ onClose }: { onClose: () => void }) => {
    const [name, setName] = useState('');
    const [token, setToken] = useState('');
    const [channelId, setChannelId] = useState('');
    const [adminChatId, setAdminChatId] = useState('');
    // @ts-ignore
    const envUrl = import.meta.env.VITE_PUBLIC_URL;
    const [companyBaseUrl, setCompanyBaseUrl] = useState(envUrl || window.location.origin.replace(/\/$/, ''));
    const [publicBaseUrl, setPublicBaseUrl] = useState('');
    const [mode, setMode] = useState<'polling' | 'webhook'>('polling');
    const [template, setTemplate] = useState<'CLIENT_LEAD' | 'B2B'>('CLIENT_LEAD');
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();
    const effectiveBaseUrl = (publicBaseUrl || companyBaseUrl || window.location.origin).replace(/\/$/, '');

    useEffect(() => {
        Data.getSettings()
            .then(settings => {
                const base = (settings.modules || {}).telegram?.publicBaseUrl;
                if (base) setCompanyBaseUrl(base.replace(/\/$/, ''));
            })
            .catch(() => {});
    }, []);

    const handleAdd = async () => {
        if (!token.trim()) {
            showToast('Потрібен токен', 'error');
            return;
        }
        setSaving(true);
        try {
            // Auto-generate fallback
            const fallbackName = 'Новий бот';
            const fallbackSlug = name.trim() ? name.trim().toLowerCase().replace(/\s+/g, '_') : 'bot';

            const { base, detectedSlug } = resolveBaseUrl(effectiveBaseUrl || window.location.origin);
            const slug = detectedSlug || fallbackSlug;
            const miniAppUrl = buildMiniAppUrl(base, slug);

            const menuConfig = buildDefaultBotMenuConfig(template, miniAppUrl);
            const miniAppConfig = buildDefaultMiniAppConfig(template, miniAppUrl, slug);

            const bot = await Data.saveBot({
                name: name.trim() || fallbackName, // Backend will likely overwrite this with real TG name
                username: slug, // Backend will overwrite
                token: token.trim(),
                role: 'CLIENT',
                template,
                active: true,
                defaultShowcaseSlug: slug,
                channelId: channelId || undefined,
                adminChatId: adminChatId || undefined,
                deliveryMode: mode === 'webhook' ? 'webhook' : 'polling',
                config: {
                    publicBaseUrl: publicBaseUrl ? (base || undefined) : undefined,
                    deliveryMode: mode,
                    menuConfig,
                    miniAppConfig
                },
                menuConfig,
                miniAppConfig,
                processedUpdateIds: [],
                stats: { processed: 0, ignored: 0, errors: 0, lastRun: '' }
            } as any);

            if (mode === 'webhook' && bot?.id) {
                try {
                    await ApiClient.post(`bots/${bot.id}/webhook`, {
                        publicBaseUrl: effectiveBaseUrl || window.location.origin
                    });
                } catch (err: any) {
                    console.error(err);
                    showToast(err?.message || 'Webhook setup failed; please set manually', 'error');
                }
            }

            showToast("Бота підключено");
            onClose();
        } catch (e: any) {
            console.error(e);
            showToast(e.message || 'Failed to connect bot', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="panel w-full max-w-md p-8 animate-slide-up shadow-2xl">
                <h3 className="font-bold text-2xl text-[var(--text-primary)] mb-6">Підключити бота</h3>
                <div className="space-y-4">
                    <input className="input" placeholder="Назва (якщо порожньо — авто)" value={name} onChange={e => setName(e.target.value)} />
                    <input className="input" placeholder="Токен" value={token} onChange={e => setToken(e.target.value)} />
                    <input className="input" placeholder="Channel ID (опційно)" value={channelId} onChange={e => setChannelId(e.target.value)} />
                    <input className="input" placeholder="Admin Chat ID (опційно)" value={adminChatId} onChange={e => setAdminChatId(e.target.value)} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Режим</label>
                            <select className="input" value={mode} onChange={e => setMode(e.target.value as any)}>
                                <option value="polling">Polling</option>
                                <option value="webhook">Webhook</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Шаблон</label>
                            <select className="input" value={template} onChange={e => setTemplate(e.target.value as 'CLIENT_LEAD' | 'B2B')}>
                                <option value="CLIENT_LEAD">Lead Bot</option>
                                <option value="B2B">B2B Мережа</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-1">Public Base URL (HTTPS)</label>
                        <input className="input" placeholder={companyBaseUrl || 'https://your.domain'} value={publicBaseUrl} onChange={e => setPublicBaseUrl(e.target.value)} />
                        {!publicBaseUrl && (
                            <div className="text-[10px] text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                                За замовчуванням використовується базовий URL компанії.
                            </div>
                        )}
                        {effectiveBaseUrl.includes('localhost') && (
                            <div className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
                                <AlertTriangle size={10} /> Localhost не працює для Telegram webhook/Mini App
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={onClose} className="btn-ghost">Скасувати</button>
                        <button onClick={handleAdd} disabled={saving} className="btn-primary px-6">
                            {saving ? 'Підключення...' : 'Підключити'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const BotSettings = ({ bot }: { bot: Bot }) => {
    const { showToast } = useToast();
    const [form, setForm] = useState(bot);
    const [showcases, setShowcases] = useState<Showcase[]>([]);
    const [companySettings, setCompanySettings] = useState<any>(null);
    const [companyBaseUrl, setCompanyBaseUrl] = useState('');
    const [companyBaseDraft, setCompanyBaseDraft] = useState('');

    // Diagnostic stats
    const lastError = TelegramAPI.lastError;

    useEffect(() => { setForm(bot); }, [bot.id]);

    useEffect(() => {
        ShowcaseService.getShowcases().then(setShowcases).catch(console.error);
    }, []);

    useEffect(() => {
        Data.getSettings()
            .then(settings => {
                setCompanySettings(settings);
                const base = (settings.modules || {}).telegram?.publicBaseUrl || '';
                setCompanyBaseUrl(base);
                setCompanyBaseDraft(base);
            })
            .catch(() => {});
    }, []);

    const normalizeMiniAppConfig = (draft: Bot, options?: { replaceTemplateManaged?: boolean }) => {
        const fallbackSlug = draft.defaultShowcaseSlug || 'system';
        const hasOverride = !!draft.publicBaseUrl;
        const baseCandidate = draft.publicBaseUrl || companyBaseUrl || window.location.origin;
        const { base, detectedSlug } = resolveBaseUrl(baseCandidate);
        const slug = detectedSlug || fallbackSlug;
        const miniAppUrl = buildMiniAppUrl(base, slug);
        const template = normalizeTemplate((draft as any).template);
        const previousTemplate = normalizeTemplate((bot as any).presetTemplate || bot.template);
        const templateChanged = template !== previousTemplate;
        const replaceTemplateManaged = options?.replaceTemplateManaged === true || templateChanged;
        const defaultMenu = buildDefaultBotMenuConfig(template, miniAppUrl);
        const defaultMini = buildDefaultMiniAppConfig(template, miniAppUrl, slug);
        const menuSource = replaceTemplateManaged ? defaultMenu : (draft.menuConfig || defaultMenu);
        const menuConfig = {
            ...menuSource,
            buttons: (menuSource.buttons || defaultMenu.buttons).map(btn =>
                (btn.type === 'LINK' || btn.type === 'WEB_APP') && btn.value === '{{MINI_APP_URL}}'
                    ? { ...btn, value: miniAppUrl }
                    : btn
            )
        };
        const miniSource = replaceTemplateManaged ? defaultMini : (draft.miniAppConfig || defaultMini);
        const miniAppConfig = {
            ...miniSource,
            url: miniAppUrl,
            showcaseSlug: slug
        };
        return { ...draft, publicBaseUrl: hasOverride ? base : undefined, menuConfig, miniAppConfig, defaultShowcaseSlug: slug };
    };

    const save = async (options?: { forcePreset?: boolean; applyPreset?: boolean; successMessage?: string }) => {
        const currentTemplate = normalizeTemplate((form as any).template);
        const previousTemplate = normalizeTemplate((bot as any).presetTemplate || bot.template);
        const templateChanged = currentTemplate !== previousTemplate;
        const forcePreset = options?.forcePreset ?? templateChanged;
        const normalized = normalizeMiniAppConfig(form, { replaceTemplateManaged: forcePreset });
        const payload = {
            ...normalized,
            applyPreset: options?.applyPreset ?? true,
            forcePreset
        } as any;
        const saved = await Data.saveBot(payload);
        setForm(saved as any);
        const defaultMessage = templateChanged
            ? 'Шаблон змінено, пресет застосовано повторно'
            : 'Налаштування збережено';
        showToast(options?.successMessage || defaultMessage);
    };

    const handleSyncMenu = async () => {
        try {
            // Respect publicBaseUrl
            const baseUrl = form.publicBaseUrl || companyBaseUrl || window.location.origin;
            const slug = form.defaultShowcaseSlug || 'system';
            const appUrl = buildMiniAppUrl(baseUrl, slug);
            await TelegramAPI.setChatMenuButton(form.token, "Відкрити застосунок", appUrl);
            showToast("Кнопку меню синхронізовано");
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const saveCompanyBaseUrl = async () => {
        if (!companySettings?.id) return;
        const updated = {
            ...companySettings,
            modules: {
                ...(companySettings.modules || {}),
                telegram: {
                    ...((companySettings.modules || {}).telegram || {}),
                    publicBaseUrl: companyBaseDraft || undefined
                }
            }
        };
        try {
            await Data.saveSettings(updated);
            setCompanySettings(updated);
            setCompanyBaseUrl(companyBaseDraft);
            showToast('Company base URL saved');
        } catch (e: any) {
            showToast(e.message || 'Failed to save company base URL', 'error');
        }
    };

    const handleSyncCommands = async () => {
        try {
            const scenarios = await Data.getScenarios(form.id ? { botId: form.id } : undefined);
            const commands = scenarios.filter(s => s.isActive && s.triggerCommand).map(s => ({ command: s.triggerCommand, description: s.name }));
            commands.push({ command: 'start', description: 'Restart' });
            commands.push({ command: 'menu', description: 'Menu' });
            await TelegramAPI.setMyCommands(form.token, commands);
            showToast("Команди синхронізовано");
        } catch (e: any) { showToast(e.message, 'error'); }
    };

    const getMiniAppUrl = () => {
        const username = (form as any).botUsername || form.username;
        if (!username) return '';
        if (form.defaultShowcaseSlug) {
            return `https://t.me/${username}/app?startapp=${form.defaultShowcaseSlug}`;
        }
        return `https://t.me/${username}/app`; // Standard deep link
    };

    const renderPresetChecklist = () => {
        const template = normalizeTemplate((form as any).template || 'CLIENT_LEAD');
        const menuButtons = Array.isArray((form as any).menuConfig?.buttons) ? (form as any).menuConfig.buttons : [];
        const mini = (form as any).miniAppConfig || {};
        const buttonValues = new Set(menuButtons.map((btn: any) => String(btn?.value || '').trim().toLowerCase()));
        const buttonIds = new Set(menuButtons.map((btn: any) => String(btn?.id || '').trim()));
        const hasMini = Boolean(mini?.isEnabled && mini?.url);
        const hasBotUsername = Boolean((form as any).botUsername || form.username);

        const leadChecks = [
            { label: 'Кнопки lead-меню налаштовані', ok: menuButtons.length >= 4 },
            { label: 'Mini App налаштовано', ok: hasMini },
            { label: 'Username бота синхронізовано', ok: hasBotUsername }
        ];

        const b2bChecks = [
            { label: 'Channel ID налаштовано', ok: Boolean(form.channelId) },
            { label: 'Admin chat налаштовано', ok: Boolean(form.adminChatId) },
            { label: 'Кнопка: Створити запит', ok: buttonIds.has('btn_b2b_req') || buttonValues.has('/request') },
            { label: 'Кнопка: Подати варіант', ok: buttonIds.has('btn_b2b_offer') || buttonValues.has('/offer') },
            { label: 'Кнопка: Правила', ok: buttonIds.has('btn_b2b_help') },
            { label: 'Кнопка: Меню', ok: buttonValues.has('/menu') },
            { label: 'Mini App налаштовано', ok: hasMini },
            { label: 'Username бота синхронізовано', ok: hasBotUsername }
        ];

        const checks = template === 'B2B' ? b2bChecks : leadChecks;
        return (
            <div className="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3">
                <div className="text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-2">Чекліст готовності пресету</div>
                <div className="space-y-1.5">
                    {checks.map(item => (
                        <div key={item.label} className="flex items-center justify-between text-xs">
                            <span className="text-[var(--text-primary)]">{item.label}</span>
                            <span className={item.ok ? 'text-green-500 font-bold' : 'text-red-400 font-bold'}>
                                {item.ok ? 'OK' : 'MISSING'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const activeTemplate = normalizeTemplate((form as any).template || 'CLIENT_LEAD');
    const templatePackage = activeTemplate === 'B2B'
        ? {
            title: 'Пакет B2B мережі',
            points: [
                'Flows: create_request, submit_offer, request_decision, admin_routing, help',
                'Меню: Створити запит / Подати варіант / Застосунок / Правила / Меню',
                'Mini App: запити+інвентар / обране / статуси (B2B)'
            ]
        }
        : {
            title: 'Пакет Lead Bot',
            points: [
                'Flows: start, buy, sell, support, language',
                'Меню: Купити / Продати / Додаток / Підтримка / Мова',
                'Mini App: інвентар / запит / статус'
            ]
        };

    return (
        <div className="max-w-2xl mx-auto p-8 space-y-8 overflow-y-auto h-full">
            <div className="panel p-6 space-y-4 border-gold-500/20">
                <div className="flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-lg text-[var(--text-primary)]">Company Base URL</h3>
                        <p className="text-xs text-[var(--text-secondary)]">Default base URL for webhooks and mini apps. Bots can override if needed.</p>
                    </div>
                    <button onClick={saveCompanyBaseUrl} className="btn-secondary text-xs px-4">Save</button>
                </div>
                <input
                    className="input font-mono text-sm"
                    placeholder="https://your-domain.com"
                    value={companyBaseDraft}
                    onChange={e => setCompanyBaseDraft(e.target.value)}
                />
                {companyBaseUrl && (
                    <div className="text-[10px] text-[var(--text-secondary)]">Current: {companyBaseUrl}</div>
                )}
            </div>

            <div className="panel p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-[var(--border-color)] pb-4">
                    <h3 className="font-bold text-lg text-[var(--text-primary)]">General Settings</h3>
                    {form.username && (
                        <a
                            href={getMiniAppUrl()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-blue-500 hover:underline flex items-center gap-1"
                        >
                            Open Mini App <Globe size={12} />
                        </a>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Bot Name</label>
                        <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Username</label>
                        <input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">API Token</label>
                    <input className="input font-mono text-sm" type="password" value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} />
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Bot Template</label>
                    <select
                        className="input w-full"
                        value={((form as any).template || 'CLIENT_LEAD')}
                        onChange={e => {
                            const nextTemplate = normalizeTemplate(e.target.value);
                            const fallbackSlug = form.defaultShowcaseSlug || 'system';
                            const baseCandidate = form.publicBaseUrl || companyBaseUrl || window.location.origin;
                            const { base, detectedSlug } = resolveBaseUrl(baseCandidate);
                            const slug = detectedSlug || fallbackSlug;
                            const miniAppUrl = buildMiniAppUrl(base, slug);
                            const menuConfig = buildDefaultBotMenuConfig(nextTemplate, miniAppUrl);
                            const miniAppConfig = buildDefaultMiniAppConfig(nextTemplate, miniAppUrl, slug);
                            setForm({
                                ...form,
                                template: nextTemplate,
                                defaultShowcaseSlug: slug,
                                menuConfig,
                                miniAppConfig
                            } as any);
                        }}
                    >
                        <option value="CLIENT_LEAD">Lead Bot</option>
                        <option value="B2B">B2B Network</option>
                    </select>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-1">Scenarios and menu are applied from selected template preset.</div>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-1">Legacy B2B fallback is optional and controlled by server flag.</div>
                    <div className="mt-2 text-[10px] flex items-center gap-2">
                        <span className="text-[var(--text-secondary)]">Preset status:</span>
                        <span className={`font-bold ${form.presetStatus === 'ready' ? 'text-green-500' : form.presetStatus === 'partial' ? 'text-yellow-500' : 'text-red-500'}`}>
                            {form.presetStatus || 'missing'}
                        </span>
                        {form.presetVersion && (
                            <span className="text-[var(--text-secondary)]">v{form.presetVersion}</span>
                        )}
                    </div>
                    <div className="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] p-3">
                        <div className="text-[10px] uppercase font-bold text-[var(--text-secondary)] mb-1">Active template package</div>
                        <div className="text-sm font-semibold text-[var(--text-primary)] mb-2">{templatePackage.title}</div>
                        <div className="space-y-1">
                            {templatePackage.points.map(point => (
                                <div key={point} className="text-xs text-[var(--text-secondary)]">
                                    • {point}
                                </div>
                            ))}
                        </div>
                    </div>
                    {renderPresetChecklist()}
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Channel ID</label>
                        <input className="input font-mono text-sm" placeholder="-100..." value={form.channelId || ''} onChange={e => setForm({ ...form, channelId: e.target.value })} />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Admin Chat ID</label>
                        <input className="input font-mono text-sm" placeholder="12345..." value={form.adminChatId || ''} onChange={e => setForm({ ...form, adminChatId: e.target.value })} />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Default Showcase</label>
                    <select
                        className="input w-full"
                        value={form.defaultShowcaseId || ''}
                        onChange={e => {
                            const sc = showcases.find(s => s.id === e.target.value);
                            setForm({
                                ...form,
                                defaultShowcaseId: e.target.value || undefined,
                                defaultShowcaseSlug: sc?.slug
                            });
                        }}
                    >
                        <option value="">-- None (System Default) --</option>
                        {showcases.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>
                        ))}
                    </select>
                    <div className="text-[10px] text-[var(--text-secondary)] mt-1">Determines which content loads when opening the Mini App.</div>
                </div>
                <div>
                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2 block">Public App Base URL</label>
                    <input className="input font-mono text-sm" placeholder={companyBaseUrl || 'https://your-domain.com'} value={form.publicBaseUrl || ''} onChange={e => setForm({ ...form, publicBaseUrl: e.target.value })} />
                    {!form.publicBaseUrl && (
                        <div className="text-[10px] text-[var(--text-secondary)] mt-1 flex items-center gap-1">
                            Using company base URL by default.
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-between bg-[var(--bg-input)] p-4 rounded-xl">
                    <span className="font-bold text-[var(--text-primary)]">Auto-Sync</span>
                    <button onClick={() => setForm({ ...form, active: !form.active })} className={`w-12 h-6 rounded-full relative transition-colors ${form.active ? 'bg-green-500' : 'bg-gray-600'}`}>
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${form.active ? 'left-7' : 'left-1'}`}></div>
                    </button>
                </div>
                <div className="flex justify-end">
                    <div className="flex gap-2">
                        <button
                            onClick={() => save({ forcePreset: true, applyPreset: true, successMessage: 'Template preset reapplied' })}
                            className="btn-secondary px-4"
                        >
                            Reapply Preset
                        </button>
                        <button onClick={() => save({ applyPreset: true })} className="btn-primary px-6">Save Changes</button>
                    </div>
                </div>
            </div>

            {/* DIAGNOSTICS PANEL */}
            <div className="panel p-6 border-blue-500/20 bg-blue-500/5">
                <div className="flex items-center gap-2 mb-4">
                    <Activity size={20} className="text-blue-500" />
                    <h3 className="font-bold text-blue-500">Diagnostics & Network</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-[var(--bg-input)] p-3 rounded-lg">
                        <div className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Polling Status</div>
                        <div className="font-mono text-sm text-[var(--text-primary)] mt-1 flex items-center gap-2">
                            {form.active ? <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> : <span className="w-2 h-2 bg-red-500 rounded-full"></span>}
                            {form.active ? 'Active' : 'Stopped'}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                    <button onClick={async () => {
                        try {
                            await TelegramAPI.getMe(form.token);
                            showToast("Connection OK");
                        } catch (e: any) { showToast(e.message, 'error'); }
                    }} className="btn-secondary text-xs py-1.5">Test Connection</button>

                    <button onClick={() => {
                        form.lastUpdateId = 0;
                        save({ applyPreset: false });
                        showToast("Offset Reset to 0");
                    }} className="btn-secondary text-xs py-1.5">Reset Offset</button>

                    <button onClick={() => {
                        form.processedUpdateIds = [];
                        save({ applyPreset: false });
                        showToast("Dedupe Buffer Cleared");
                    }} className="btn-secondary text-xs py-1.5">Clear Buffer</button>

                    <button onClick={handleSyncMenu} className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
                        <Globe size={12} /> Sync Menu URL
                    </button>

                    <button onClick={handleSyncCommands} className="btn-secondary text-xs py-1.5 flex items-center justify-center gap-1">
                        <Terminal size={12} /> Sync Commands
                    </button>
                </div>

                {lastError && (
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-start gap-2">
                        <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                            <div className="text-xs font-bold text-red-500">Last Network Error</div>
                            <div className="text-xs text-red-400 font-mono mt-1 break-all">{lastError}</div>
                        </div>
                    </div>
                )}
            </div>

            <div className="panel p-6 border-red-500/20 bg-red-500/5">
                <h3 className="font-bold text-red-500 mb-2">Danger Zone</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-4">Disconnecting the bot will stop all automation.</p>
                <button onClick={async () => { if (confirm("Disconnect bot?")) { await Data.deleteBot(bot.id); window.location.reload(); } }} className="btn-secondary text-red-500 border-red-500/30 hover:bg-red-500/10">Disconnect Bot</button>
            </div>
        </div>
    );
};
