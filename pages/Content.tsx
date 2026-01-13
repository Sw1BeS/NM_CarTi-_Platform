
import React, { useState, useEffect } from 'react';
import { Data } from '../services/data';
import { ApiClient } from '../services/apiClient';
import { DraftsService, DraftRecord } from '../services/draftsService';
import { CarListing, TelegramDestination, Bot } from '../types';
import { useToast } from '../contexts/ToastContext';
import { Send, Image as ImageIcon, Calendar, Eye, X, Check, Plus, Search, Filter } from 'lucide-react';
import { ContentGenerator } from '../services/contentGenerator';

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
    const [drafts, setDrafts] = useState<DraftRecord[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [selectedCar, setSelectedCar] = useState<CarListing | null>(null);
    const [template, setTemplate] = useState<PostTemplate>('IN_STOCK');
    const [customText, setCustomText] = useState('');
    const [selectedDest, setSelectedDest] = useState('');
    const [scheduleDate, setScheduleDate] = useState('');
    const [postLang, setPostLang] = useState<'UA' | 'RU'>('UA');
    const [searchQuery, setSearchQuery] = useState('');
    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [inv, dests, botList, draftList] = await Promise.all([
            Data.getInventory(),
            Data.getDestinations(),
            Data.getBots(),
            DraftsService.getDrafts()
        ]);
        setInventory(inv.filter(c => c.status === 'AVAILABLE'));
        setDestinations(dests.filter(d => d.type === 'CHANNEL'));
        setBots(botList.filter(b => b.active));
        setDrafts(draftList);
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
        const created = await DraftsService.createDraft({
            source: 'MANUAL',
            title: selectedCar.title,
            description: generatePreview(),
            url: selectedCar.thumbnail,
            destination: selectedDest,
            scheduledAt: scheduledAt,
            status: scheduleDate ? 'SCHEDULED' : 'DRAFT',
            botId: bot.id,
            metadata: { carId: selectedCar.canonicalId, template, lang: postLang }
        });

        setDrafts([created, ...drafts]);
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
        const text = generatePreview();

        try {
            const res = await ApiClient.post('messages/send', {
                chatId: selectedDest,
                text,
                imageUrl: selectedCar.thumbnail || undefined,
                botId: bot.id
            });
            if (!res.ok) throw new Error(res.message);

            const created = await DraftsService.createDraft({
                source: 'MANUAL',
                title: selectedCar.title,
                description: text,
                url: selectedCar.thumbnail,
                destination: selectedDest,
                status: 'POSTED',
                postedAt: new Date().toISOString(),
                botId: bot.id,
                metadata: { carId: selectedCar.canonicalId, template, lang: postLang }
            });
            setDrafts([created, ...drafts]);
            showToast('Posted to channel!', 'success');
            setIsCreating(false);
            resetForm();
        } catch (e: any) {
            showToast(`Failed: ${e.message}`, 'error');
        }
    };

    const deleteDraft = async (id: number) => {
        await DraftsService.deleteDraft(id);
        const updated = drafts.filter(d => d.id !== id);
        setDrafts(updated);
        showToast('Draft deleted', 'success');
    };

    const resetForm = () => {
        setSelectedCar(null);
        setTemplate('IN_STOCK');
        setCustomText('');
        setSelectedDest('');
        setScheduleDate('');
        setPostLang('UA');
    };

    const filteredInventory = inventory.filter(car =>
        car.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] gap-6">
            {/* Header */}
            <div className="panel p-6 shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Content Manager</h1>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">Create and schedule channel posts</p>
                    </div>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="btn-primary px-6 py-3 flex items-center gap-2"
                    >
                        <Plus size={18} /> New Post
                    </button>
                </div>
            </div>

            {/* Drafts List */}
            <div className="panel flex-1 overflow-hidden p-6">
                <h3 className="font-bold text-[var(--text-primary)] mb-4">Drafts & Scheduled</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto max-h-[calc(100%-2rem)]">
                    {drafts.map(draft => {
                        const carId = typeof draft.metadata === 'object' ? draft.metadata?.carId : undefined;
                        const car = inventory.find(c => c.canonicalId === carId);
                        const dest = destinations.find(d => d.identifier === draft.destination);

                        return (
                            <div key={draft.id} className="bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] p-4 flex flex-col gap-3">
                                {draft.url && (
                                    <img src={draft.url} className="w-full h-32 object-cover rounded-lg" alt="" />
                                )}
                                <div className="flex-1">
                                    <div className="text-xs font-mono text-[var(--text-secondary)] mb-2">
                                        {car?.title || draft.title || 'Unknown Car'}
                                    </div>
                                    <div className="text-xs text-[var(--text-muted)] line-clamp-3">
                                        {draft.description}
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                                        <Send size={12} />
                                        {dest?.name || draft.destination}
                                    </div>
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${draft.status === 'POSTED' ? 'bg-green-500/20 text-green-500' :
                                            draft.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-500' :
                                                'bg-gray-500/20 text-gray-500'
                                        }`}>
                                        {draft.status}
                                    </span>
                                </div>
                                {draft.scheduledAt && (
                                    <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                                        <Calendar size={10} />
                                        {new Date(draft.scheduledAt).toLocaleString()}
                                    </div>
                                )}
                                {draft.postedAt && (
                                    <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                                        <Check size={10} />
                                        {new Date(draft.postedAt).toLocaleString()}
                                    </div>
                                )}
                                <button
                                    onClick={() => deleteDraft(draft.id)}
                                    className="btn-ghost text-xs text-red-500 hover:bg-red-500/10 py-1"
                                >
                                    Delete
                                </button>
                            </div>
                        );
                    })}
                    {drafts.length === 0 && (
                        <div className="col-span-full text-center py-12 text-[var(--text-secondary)]">
                            No drafts yet. Create your first post!
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
                                            onClick={() => setTemplate('IN_STOCK')}
                                            className={`py-2 px-3 rounded text-xs font-bold transition-colors ${template === 'IN_STOCK'
                                                    ? 'bg-gold-500 text-black'
                                                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            ✅ In Stock
                                        </button>
                                        <button
                                            onClick={() => setTemplate('IN_TRANSIT')}
                                            className={`py-2 px-3 rounded text-xs font-bold transition-colors ${template === 'IN_TRANSIT'
                                                    ? 'bg-gold-500 text-black'
                                                    : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'
                                                }`}
                                        >
                                            📦 In Transit
                                        </button>
                                        <button
                                            onClick={() => setTemplate('CUSTOM')}
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
                                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                            Custom Text (use variables like {'{title}'}, {'{price}'}, {'{hashtags}'})
                                        </label>
                                        <textarea
                                            className="textarea h-32"
                                            value={customText}
                                            onChange={e => setCustomText(e.target.value)}
                                            placeholder="🚗 Your custom post text here...\n\n{title}\n💰 {price} {currency}\n{hashtags}"
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
                                        dangerouslySetInnerHTML={{ __html: generatePreview().replace(/\n/g, '<br/>') }}
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
