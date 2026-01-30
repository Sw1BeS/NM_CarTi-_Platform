
import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Data } from '../../services/data';
import { PublicationService, PublicationJob, ContentTemplate } from '../../services/publicationService';
import { CarListing, TelegramDestination, Bot } from '../../types';
import { useToast } from '../../contexts/ToastContext';
import { Send, Image as ImageIcon, Calendar, Eye, X, Check, Plus, Search, Filter, Save } from 'lucide-react';
import { ContentGenerator } from '../../services/contentGenerator';
import { TelegramEditor } from '../../components/Editor';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/EmptyState';

type PostTemplate = 'IN_STOCK' | 'IN_TRANSIT' | 'CUSTOM';

const TEMPLATES = {
    IN_STOCK: {
        ua: '🚗 <b>{title}</b>\n\n💰 {price} {currency}\n📍 {city}\n🗓 {year} | 🛣 {mileage} км\n⚙️ {specs}\n\n✅ В наявності\n📞 Зв\'яжіться для деталей\n\n{hashtags}',
        ru: '🚗 <b>{title}</b>\n\n💰 {price} {currency}\n📍 {city}\n🗓 {year} | 🛣 {mileage} км\n⚙️ {specs}\n\n✅ В наличии\n📞 Свяжитесь для деталей\n\n{hashtags}'
    },
    IN_TRANSIT: {
        ua: '📦 <b>{title}</b>\n\n💰 {price} {currency}\n📍 {city}\n🗓 {year} | 🛣 {mileage} км\n⚙️ {specs}\n\n🚢 Скоро в наявності\n📞 Бронюйте зараз\n\n{hashtags}',
        ru: '📦 <b>{title}</b>\n\n💰 {price} {currency}\n📍 {city}\n🗓 {year} | 🛣 {mileage} км\n⚙️ {specs}\n\n🚢 Скоро в наличии\n📞 Бронируйте сейчас\n\n{hashtags}'
    }
};

export const ContentPage = () => {
    const [inventory, setInventory] = useState<CarListing[]>([]);
    const [destinations, setDestinations] = useState<TelegramDestination[]>([]);
    const [bots, setBots] = useState<Bot[]>([]);
    const [jobs, setJobs] = useState<PublicationJob[]>([]);
    const [templates, setTemplates] = useState<ContentTemplate[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedCar, setSelectedCar] = useState<CarListing | null>(null);
    const [template, setTemplate] = useState<PostTemplate>('IN_STOCK');
    const [customText, setCustomText] = useState('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [previewText, setPreviewText] = useState('');
    const [selectedDest, setSelectedDest] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [postLang, setPostLang] = useState<'UA' | 'RU'>('UA');
    const [searchQuery, setSearchQuery] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [inv, dests, botList, jobList, tplList] = await Promise.all([
            Data.getInventory(),
            Data.getDestinations(),
            Data.getBots(),
            PublicationService.listJobs(),
            PublicationService.listTemplates().catch(() => [])
        ]);
        setInventory(inv.filter(c => c.status === 'AVAILABLE'));
        setDestinations(dests.filter(d => d.type === 'CHANNEL'));
        setBots(botList.filter(b => b.active));
        setJobs(jobList);
        setTemplates(tplList);
    };

    const getTemplateText = () => {
        if (template === 'CUSTOM') return customText;
        const tpl = postLang === 'RU' ? TEMPLATES[template].ru : TEMPLATES[template].ua;
        return tpl;
    };

    const generatePreview = () => {
        if (!selectedCar) return '';
        const lang = postLang === 'RU' ? 'RU' : 'UK';

        if (template === 'CUSTOM') {
            return ContentGenerator.fromCarTemplate(selectedCar, customText, lang);
        }

        const tpl = postLang === 'RU' ? TEMPLATES[template].ru : TEMPLATES[template].ua;
        return ContentGenerator.fromCarTemplate(selectedCar, tpl, lang);
    };

    useEffect(() => {
        const templateText = getTemplateText();
        if (!selectedCar || !templateText) {
            setPreviewText('');
            return;
        }
        const timer = setTimeout(async () => {
            try {
                const preview = await PublicationService.previewTemplate({
                    templateId: selectedTemplateId || undefined,
                    template: selectedTemplateId ? undefined : templateText,
                    carId: selectedCar.canonicalId,
                    lang: postLang === 'RU' ? 'RU' : 'UK'
                });
                setPreviewText(preview.text);
            } catch (e) {
                setPreviewText(generatePreview());
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [selectedCar, template, customText, postLang, selectedTemplateId]);

    const createDraft = async () => {
        if (!selectedCar || !selectedDest) {
            showToast('Select car and destination', 'error');
            return;
        }

        const bot = bots[0];
        if (!bot) {
            showToast('No active bot found', 'error');
            return;
        }

        const scheduledAt = scheduleDate ? new Date(scheduleDate).toISOString() : undefined;
        const templateText = getTemplateText();
        const created = await PublicationService.createJob({
            title: selectedCar.title,
            carId: selectedCar.canonicalId,
            templateId: selectedTemplateId || undefined,
            template: selectedTemplateId ? undefined : templateText,
            destination: selectedDest,
            scheduledAt,
            publishNow: false,
            mediaUrl: selectedCar.thumbnail,
            botId: bot.id,
            lang: postLang,
            createDraft: true
        });

        setJobs([created, ...jobs]);
        showToast(`Draft created${scheduleDate ? ' and scheduled' : ''}`, 'success');
        setIsCreating(false);
        resetForm();
    };

    const publishNow = async () => {
        if (!selectedCar || !selectedDest || bots.length === 0) {
            showToast('Missing car, destination, or active bot', 'error');
            return;
        }

        const bot = bots[0]; // Use first active bot
        try {
            const templateText = getTemplateText();
            const created = await PublicationService.createJob({
                title: selectedCar.title,
                carId: selectedCar.canonicalId,
                templateId: selectedTemplateId || undefined,
                template: selectedTemplateId ? undefined : templateText,
                destination: selectedDest,
                publishNow: true,
                mediaUrl: selectedCar.thumbnail,
                botId: bot.id,
                lang: postLang,
                createDraft: true
            });
            setJobs([created, ...jobs]);
            showToast('Posted to channel!', 'success');
            setIsCreating(false);
            resetForm();
        } catch (e: any) {
            showToast(`Failed: ${e.message}`, 'error');
        }
    };

    const deleteJob = async (id: string) => {
        await PublicationService.deleteJob(id);
        const updated = jobs.filter(j => j.id !== id);
        setJobs(updated);
        showToast('Post removed', 'success');
    };

    const resetForm = () => {
        setSelectedCar(null);
        setTemplate('IN_STOCK');
        setCustomText('');
        setSelectedTemplateId(null);
        setPreviewText('');
        setSelectedDest('');
        setScheduleDate('');
        setPostLang('UA');
    };

    const saveTemplate = async () => {
        if (!customText) {
            showToast("Enter custom text to save", "error");
            return;
        }
        const name = prompt("Template Name:");
        if (!name) return;
        try {
            await PublicationService.createTemplate({
                name,
                body: customText,
                language: postLang
            });
            showToast("Template Saved");
            loadData();
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const loadTemplate = (tpl: ContentTemplate) => {
        setCustomText(tpl.body || '');
        setPostLang((tpl.language as any) || 'UA');
        setSelectedTemplateId(tpl.id);
        setTemplate('CUSTOM');
        showToast(`Loaded: ${tpl.name}`);
    };

    const filteredInventory = inventory.filter(car =>
        car.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] gap-6">
            <PageHeader
                title="Content Manager"
                subtitle="Create and schedule channel posts"
                actions={
                    <button
                        onClick={() => setIsCreating(true)}
                        className="btn-primary px-6 py-3 flex items-center gap-2"
                    >
                        <Plus size={18} /> New Post
                    </button>
                }
            />

            {/* Drafts List */}
            <div className="panel flex-1 overflow-hidden p-6">
                <h3 className="font-bold text-[var(--text-primary)] mb-4">Drafts & Scheduled</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto max-h-[calc(100%-2rem)]">
                    {jobs.map(job => {
                        const carId = typeof job.metadata === 'object' ? job.metadata?.carId : undefined;
                        const car = inventory.find(c => c.canonicalId === carId);
                        const dest = destinations.find(d => d.identifier === job.destination);

                        return (
                            <div key={job.id} className="bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] p-4 flex flex-col gap-3">
                                {job.mediaUrl && (
                                    <img src={job.mediaUrl} className="w-full h-32 object-cover rounded-lg" alt="" />
                                )}
                                <div className="flex-1">
                                    <div className="text-xs font-mono text-[var(--text-secondary)] mb-2">
                                        {car?.title || job.title || 'Unknown Post'}
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)] line-clamp-3">
                                        {job.text}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                                        <Send size={12} />
                                        {dest?.name || job.destination}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${job.status === 'POSTED' ? 'bg-green-500/20 text-green-500' :
                                        job.status === 'FAILED' ? 'bg-red-500/20 text-red-500' :
                                            job.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-500' :
                                                'bg-gray-500/20 text-gray-500'
                                        }`}>
                                        {job.status}
                                    </span>
                                </div>
                                {job.scheduledAt && (
                                    <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                                        <Calendar size={10} />
                                        {new Date(job.scheduledAt).toLocaleString()}
                                    </div>
                                )}
                                {job.postedAt && (
                                    <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                                        <Check size={10} />
                                        {new Date(job.postedAt).toLocaleString()}
                                    </div>
                                )}
                                {job.lastError && (
                                    <div className="text-[10px] text-red-500/80 line-clamp-2">
                                        {job.lastError}
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    {job.status === 'FAILED' && (
                                        <button
                                            onClick={async () => {
                                                const updated = await PublicationService.retryJob(job.id);
                                                setJobs(prev => prev.map(j => j.id === job.id ? updated : j));
                                                showToast('Retry queued', 'success');
                                            }}
                                            className="btn-secondary text-xs flex-1"
                                        >
                                            Retry
                                        </button>
                                    )}
                                    <button
                                        onClick={() => deleteJob(job.id)}
                                        className="btn-ghost text-xs text-red-500 hover:bg-red-500/10 py-1 flex-1"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {jobs.length === 0 && (
                        <div className="col-span-full">
                            <EmptyState
                                icon={<ImageIcon size={32} />}
                                title="No drafts yet"
                                description="Pull a car from inventory and send your first post to a channel."
                                actionLabel="New Post"
                                action={() => setIsCreating(true)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Create Modal */}
            {isCreating && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-4xl max-h-[90vh] overflow-y-auto p-8 animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-[var(--text-primary)]">Create Post</h3>
                            <button onClick={() => { setIsCreating(false); resetForm(); }}>
                                <X size={20} className="text-[var(--text-secondary)]" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Left: Config */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                        1. Select Car
                                    </label>
                                    <div className="relative mb-2">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={16} />
                                        <input
                                            className="input pl-10"
                                            placeholder="Search inventory..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-2 bg-[var(--bg-input)] rounded-lg p-2">
                                        {filteredInventory.slice(0, 10).map(car => (
                                            <div
                                                key={car.canonicalId}
                                                onClick={() => setSelectedCar(car)}
                                                className={`p-3 rounded cursor-pointer transition-colors ${selectedCar?.canonicalId === car.canonicalId
                                                    ? 'bg-gold-500 text-black'
                                                    : 'hover:bg-[var(--bg-panel)]'
                                                    }`}
                                            >
                                                <div className="text-xs font-bold">{car.title}</div>
                                                <div className="text-[10px] opacity-70">{car.price.amount} {car.price.currency}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                        2. Template
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            onClick={() => { setTemplate('IN_STOCK'); setSelectedTemplateId(null); }}
                                            className={`py-2 px-3 rounded text-xs font-bold transition-colors ${template === 'IN_STOCK'
                                                ? 'bg-gold-500 text-black'
                                                : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            ✅ In Stock
                                        </button>
                                        <button
                                            onClick={() => { setTemplate('IN_TRANSIT'); setSelectedTemplateId(null); }}
                                            className={`py-2 px-3 rounded text-xs font-bold transition-colors ${template === 'IN_TRANSIT'
                                                ? 'bg-gold-500 text-black'
                                                : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            📦 In Transit
                                        </button>
                                        <button
                                            onClick={() => { setTemplate('CUSTOM'); setSelectedTemplateId(null); }}
                                            className={`py-2 px-3 rounded text-xs font-bold transition-colors ${template === 'CUSTOM'
                                                ? 'bg-gold-500 text-black'
                                                : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            ✏️ Custom
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                        Language
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setPostLang('UA')}
                                            className={`py-2 px-3 rounded text-xs font-bold transition-colors ${postLang === 'UA'
                                                ? 'bg-gold-500 text-black'
                                                : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            Українська
                                        </button>
                                        <button
                                            onClick={() => setPostLang('RU')}
                                            className={`py-2 px-3 rounded text-xs font-bold transition-colors ${postLang === 'RU'
                                                ? 'bg-gold-500 text-black'
                                                : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            Русский
                                        </button>
                                    </div>
                                </div>

                                {template === 'CUSTOM' && (
                                    <div>
                                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2 flex justify-between">
                                            <span>Custom Text</span>
                                            <button onClick={saveTemplate} className="text-gold-500 flex items-center gap-1 hover:underline">
                                                <Save size={12}/> Save as Template
                                            </button>
                                        </label>

                                        {templates.length > 0 && (
                                            <select
                                                className="input text-xs mb-2 py-1.5"
                                                onChange={e => {
                                                    const t = templates.find(x => x.id === e.target.value);
                                                    if (t) loadTemplate(t);
                                                }}
                                                value=""
                                            >
                                                <option value="" disabled>Load Saved Template...</option>
                                                {templates.map(t => (
                                                    <option key={t.id} value={t.id}>{t.name} ({t.language || 'UA'})</option>
                                                ))}
                                            </select>
                                        )}

                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {['{title}', '{brand}', '{price}', '{year}', '{location}', '{link}', '{mileage}', '{specs}', '{hashtags}', '{car}'].map(token => (
                                                <button
                                                    key={token}
                                                    onClick={() => {
                                                        setSelectedTemplateId(null);
                                                        setCustomText(prev => (prev ? `${prev} ${token}` : token));
                                                    }}
                                                    className="text-[10px] px-2 py-1 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                                >
                                                    {token}
                                                </button>
                                            ))}
                                        </div>

                                        <TelegramEditor
                                            placeholder="Write your post here... Use {title}, {price}, {hashtags}"
                                            initialValue={customText}
                                            onChange={(html, markdown) => {
                                                setSelectedTemplateId(null);
                                                setCustomText(markdown);
                                            }}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                        3. Destination
                                    </label>
                                    <select
                                        className="input"
                                        value={selectedDest}
                                        onChange={e => setSelectedDest(e.target.value)}
                                    >
                                        <option value="">Select channel...</option>
                                        {destinations.map(d => (
                                            <option key={d.id} value={d.identifier}>
                                                {d.name} ({d.type})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                        4. Schedule (optional)
                                    </label>
                                    <input
                                        type="datetime-local"
                                        className="input"
                                        value={scheduleDate}
                                        onChange={e => setScheduleDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Right: Preview */}
                            <div>
                                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                    <Eye size={14} className="inline mr-1" /> Preview
                                </label>
                                <div className="bg-[var(--bg-input)] rounded-xl p-4 border border-[var(--border-color)]">
                                    {selectedCar?.thumbnail && (
                                        <img
                                            src={selectedCar.thumbnail}
                                            className="w-full h-48 object-cover rounded-lg mb-4"
                                            alt=""
                                        />
                                    )}
                                    <div
                                        className="text-sm text-[var(--text-primary)] whitespace-pre-wrap"
                                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize((previewText || generatePreview()).replace(/\n/g, '<br/>')) }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 mt-8">
                            <button onClick={() => { setIsCreating(false); resetForm(); }} className="btn-ghost">
                                Cancel
                            </button>
                            <button
                                onClick={createDraft}
                                disabled={!selectedCar || !selectedDest}
                                className="btn-secondary px-6 flex items-center gap-2"
                            >
                                <Calendar size={16} /> Save Draft
                            </button>
                            <button
                                onClick={publishNow}
                                disabled={!selectedCar || !selectedDest || bots.length === 0}
                                className="btn-primary px-6 flex items-center gap-2"
                            >
                                <Send size={16} /> Publish Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
