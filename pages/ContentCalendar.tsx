
import React, { useState, useEffect } from 'react';
import { Data } from '../services/data';
import { TelegramAPI } from '../services/telegram';
import { CarListing, TelegramDestination, Bot } from '../types';
import { useToast } from '../contexts/ToastContext';
import {
    Send, Calendar as CalendarIcon, Eye, X, Plus, Search,
    ChevronLeft, ChevronRight, Grid, List, Settings, Copy, Trash2,
    Check, Clock, AlertCircle
} from 'lucide-react';
import { formatCarCaptionForTelegram } from '../services/carCaptionFormatter';

type PostTemplate = 'IN_STOCK' | 'IN_TRANSIT' | 'CUSTOM';
type ViewMode = 'GRID' | 'CALENDAR';

interface DraftPost {
    id: string;
    carId?: string;
    template: PostTemplate;
    text: string;
    imageUrl?: string;
    destination: string;
    scheduledAt?: string;
    status: 'DRAFT' | 'SCHEDULED' | 'POSTED' | 'FAILED';
}

interface TemplateConfig {
    name: string;
    ua: string;
    ru: string;
}

const DEFAULT_TEMPLATES: Record<string, TemplateConfig> = {
    IN_STOCK: {
        name: 'В наявності',
        ua: '🚗 <b>Нова пропозиція!</b>\n\n{car}\n\n✅ В наявності\n📞 Зв\'яжіться для деталей',
        ru: '🚗 <b>Новое предложение!</b>\n\n{car}\n\n✅ В наличии\n📞 Свяжитесь для деталей'
    },
    IN_TRANSIT: {
        name: 'В дорозі',
        ua: '📦 <b>В дорозі!</b>\n\n{car}\n\n🚢 Скоро в наявності\n📞 Бронюйте зараз',
        ru: '📦 <b>В пути!</b>\n\n{car}\n\n🚢 Скоро в наличии\n📞 Бронируйте сейчас'
    }
};

export const ContentCalendarPage = () => {
    const [inventory, setInventory] = useState<CarListing[]>([]);
    const [destinations, setDestinations] = useState<TelegramDestination[]>([]);
    const [bots, setBots] = useState<Bot[]>([]);
    const [drafts, setDrafts] = useState<DraftPost[]>([]);
    const [viewMode, setViewMode] = useState<ViewMode>('CALENDAR');

    // Calendar state
    const [currentWeek, setCurrentWeek] = useState(new Date());
    const [selectedSlot, setSelectedSlot] = useState<{ date: Date; hour: number } | null>(null);

    // Bulk operations
    const [selectedCars, setSelectedCars] = useState<Set<string>>(new Set());
    const [showBulkScheduler, setShowBulkScheduler] = useState(false);
    const [bulkConfig, setBulkConfig] = useState({
        destination: '',
        template: 'IN_STOCK' as PostTemplate,
        startDate: '',
        startTime: '10:00',
        interval: 4, // hours between posts
        spread: 7 // days
    });

    // Template editor
    const [showTemplateEditor, setShowTemplateEditor] = useState(false);
    const [customTemplates, setCustomTemplates] = useState<Record<string, TemplateConfig>>({});
    const [editingTemplate, setEditingTemplate] = useState<TemplateConfig | null>(null);

    const { showToast } = useToast();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const [inv, dests, botList] = await Promise.all([
            Data.getInventory(),
            Data.getDestinations(),
            Data.getBots()
        ]);
        setInventory(inv.filter(c => c.status === 'AVAILABLE'));
        setDestinations(dests.filter(d => d.type === 'CHANNEL' || d.type === 'GROUP'));
        setBots(botList.filter(b => b.active));

        const stored = localStorage.getItem('content_drafts');
        if (stored) {
            try {
                setDrafts(JSON.parse(stored));
            } catch (e) { }
        }

        const storedTemplates = localStorage.getItem('custom_templates');
        if (storedTemplates) {
            try {
                setCustomTemplates(JSON.parse(storedTemplates));
            } catch (e) { }
        }
    };

    const getWeekDays = () => {
        const start = new Date(currentWeek);
        start.setDate(start.getDate() - start.getDay() + 1); // Monday

        return Array.from({ length: 7 }, (_, i) => {
            const day = new Date(start);
            day.setDate(start.getDate() + i);
            return day;
        });
    };

    const getPostsForSlot = (date: Date, hour: number) => {
        return drafts.filter(draft => {
            if (!draft.scheduledAt) return false;
            const draftDate = new Date(draft.scheduledAt);
            return draftDate.getDate() === date.getDate() &&
                draftDate.getMonth() === date.getMonth() &&
                draftDate.getFullYear() === date.getFullYear() &&
                draftDate.getHours() === hour;
        });
    };

    const schedulePost = (car: CarListing, date: Date, hour: number) => {
        if (!bulkConfig.destination) {
            showToast('Select destination first', 'error');
            return;
        }

        const scheduledDate = new Date(date);
        scheduledDate.setHours(hour, 0, 0, 0);

        const text = DEFAULT_TEMPLATES[bulkConfig.template].ua.replace(
            '{car}',
            formatCarCaptionForTelegram(car, 'UK')
        );

        const draft: DraftPost = {
            id: `draft_${Date.now()}_${Math.random()}`,
            carId: car.canonicalId,
            template: bulkConfig.template,
            text,
            imageUrl: car.thumbnail,
            destination: bulkConfig.destination,
            scheduledAt: scheduledDate.toISOString(),
            status: 'SCHEDULED'
        };

        const updated = [...drafts, draft];
        setDrafts(updated);
        localStorage.setItem('content_drafts', JSON.stringify(updated));
        showToast('Post scheduled!', 'success');
    };

    const bulkSchedule = () => {
        if (!bulkConfig.destination || selectedCars.size === 0) {
            showToast('Select cars and destination', 'error');
            return;
        }

        const startDateTime = new Date(`${bulkConfig.startDate}T${bulkConfig.startTime}`);
        const carsArray = Array.from(selectedCars).map(id => inventory.find(c => c.canonicalId === id)!);

        const newDrafts: DraftPost[] = [];
        let currentTime = new Date(startDateTime);

        carsArray.forEach((car, index) => {
            const text = DEFAULT_TEMPLATES[bulkConfig.template].ua.replace(
                '{car}',
                formatCarCaptionForTelegram(car, 'UK')
            );

            newDrafts.push({
                id: `draft_bulk_${Date.now()}_${index}`,
                carId: car.canonicalId,
                template: bulkConfig.template,
                text,
                imageUrl: car.thumbnail,
                destination: bulkConfig.destination,
                scheduledAt: currentTime.toISOString(),
                status: 'SCHEDULED'
            });

            // Add interval for next post
            currentTime = new Date(currentTime.getTime() + bulkConfig.interval * 60 * 60 * 1000);
        });

        const updated = [...drafts, ...newDrafts];
        setDrafts(updated);
        localStorage.setItem('content_drafts', JSON.stringify(updated));

        setShowBulkScheduler(false);
        setSelectedCars(new Set());
        showToast(`${newDrafts.length} posts scheduled!`, 'success');
    };

    const deletePost = (id: string) => {
        const updated = drafts.filter(d => d.id !== id);
        setDrafts(updated);
        localStorage.setItem('content_drafts', JSON.stringify(updated));
        showToast('Post deleted', 'success');
    };

    const saveTemplate = () => {
        if (!editingTemplate || !editingTemplate.name) return;

        const updated = {
            ...customTemplates,
            [editingTemplate.name.toLowerCase().replace(/\s/g, '_')]: editingTemplate
        };
        setCustomTemplates(updated);
        localStorage.setItem('custom_templates', JSON.stringify(updated));
        showToast('Template saved!', 'success');
        setShowTemplateEditor(false);
        setEditingTemplate(null);
    };

    const allTemplates = { ...DEFAULT_TEMPLATES, ...customTemplates };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] gap-6">
            {/* Header */}
            <div className="panel p-6 shrink-0">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Content Calendar</h1>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">Schedule posts across the week</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowTemplateEditor(true)}
                            className="btn-secondary px-4 py-2 flex items-center gap-2"
                        >
                            <Settings size={16} /> Templates
                        </button>
                        <button
                            onClick={() => setShowBulkScheduler(true)}
                            className="btn-primary px-4 py-2 flex items-center gap-2"
                        >
                            <Copy size={16} /> Bulk Schedule
                        </button>
                        <div className="flex bg-[var(--bg-input)] rounded-lg p-1 border border-[var(--border-color)]">
                            <button
                                onClick={() => setViewMode('CALENDAR')}
                                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${viewMode === 'CALENDAR' ? 'bg-gold-500 text-black' : 'text-[var(--text-secondary)]'
                                    }`}
                            >
                                <CalendarIcon size={14} className="inline mr-1" /> Calendar
                            </button>
                            <button
                                onClick={() => setViewMode('GRID')}
                                className={`px-3 py-1.5 rounded text-xs font-bold transition-colors ${viewMode === 'GRID' ? 'bg-gold-500 text-black' : 'text-[var(--text-secondary)]'
                                    }`}
                            >
                                <Grid size={14} className="inline mr-1" /> Grid
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Calendar View */}
            {viewMode === 'CALENDAR' && (
                <div className="panel flex-1 overflow-hidden p-6 flex flex-col">
                    {/* Week Navigator */}
                    <div className="flex justify-between items-center mb-6">
                        <button
                            onClick={() => setCurrentWeek(new Date(currentWeek.getTime() - 7 * 24 * 60 * 60 * 1000))}
                            className="btn-ghost p-2"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <h3 className="font-bold text-[var(--text-primary)]">
                            {getWeekDays()[0].toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}
                        </h3>
                        <button
                            onClick={() => setCurrentWeek(new Date(currentWeek.getTime() + 7 * 24 * 60 * 60 * 1000))}
                            className="btn-ghost p-2"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    {/* Calendar Grid */}
                    <div className="flex-1 overflow-auto">
                        <div className="grid grid-cols-8 gap-2 min-w-[1200px]">
                            {/* Header Row */}
                            <div className="font-bold text-xs text-[var(--text-secondary)] p-2">Time</div>
                            {getWeekDays().map(day => (
                                <div key={day.toISOString()} className="font-bold text-xs text-center p-2">
                                    <div className="text-[var(--text-secondary)]">{day.toLocaleDateString('uk-UA', { weekday: 'short' })}</div>
                                    <div className={`text-lg ${day.toDateString() === new Date().toDateString() ? 'text-gold-500' : 'text-[var(--text-primary)]'}`}>
                                        {day.getDate()}
                                    </div>
                                </div>
                            ))}

                            {/* Time Slots */}
                            {[9, 12, 15, 18, 21].map(hour => (
                                <React.Fragment key={hour}>
                                    <div className="text-xs text-[var(--text-secondary)] p-2 border-t border-[var(--border-color)]">
                                        {hour}:00
                                    </div>
                                    {getWeekDays().map(day => {
                                        const posts = getPostsForSlot(day, hour);
                                        const isPast = new Date(day.setHours(hour)) < new Date();

                                        return (
                                            <div
                                                key={`${day.toISOString()}-${hour}`}
                                                className={`border border-[var(--border-color)] rounded-lg p-2 min-h-[80px] ${isPast ? 'bg-[var(--bg-input)] opacity-50' : 'bg-[var(--bg-panel)] hover:border-gold-500/50 cursor-pointer'
                                                    }`}
                                                onClick={() => !isPast && setSelectedSlot({ date: day, hour })}
                                            >
                                                {posts.map(post => {
                                                    const car = inventory.find(c => c.canonicalId === post.carId);
                                                    return (
                                                        <div
                                                            key={post.id}
                                                            className={`text-[10px] p-2 rounded mb-1 ${post.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-400' :
                                                                    post.status === 'POSTED' ? 'bg-green-500/20 text-green-400' :
                                                                        'bg-red-500/20 text-red-400'
                                                                }`}
                                                        >
                                                            <div className="font-bold truncate">{car?.title || 'Unknown'}</div>
                                                            <div className="flex justify-between items-center mt-1">
                                                                <span className="opacity-70">{destinations.find(d => d.identifier === post.destination)?.name?.slice(0, 10) || 'Channel'}</span>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); deletePost(post.id); }}
                                                                    className="hover:text-red-500"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="mt-4 grid grid-cols-4 gap-4 text-center text-xs">
                        <div className="bg-blue-500/10 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-blue-500">{drafts.filter(d => d.status === 'SCHEDULED').length}</div>
                            <div className="text-[var(--text-secondary)] mt-1">Scheduled</div>
                        </div>
                        <div className="bg-green-500/10 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-green-500">{drafts.filter(d => d.status === 'POSTED').length}</div>
                            <div className="text-[var(--text-secondary)] mt-1">Posted</div>
                        </div>
                        <div className="bg-gray-500/10 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-gray-400">{drafts.filter(d => d.status === 'DRAFT').length}</div>
                            <div className="text-[var(--text-secondary)] mt-1">Drafts</div>
                        </div>
                        <div className="bg-red-500/10 p-3 rounded-lg">
                            <div className="text-2xl font-bold text-red-500">{drafts.filter(d => d.status === 'FAILED').length}</div>
                            <div className="text-[var(--text-secondary)] mt-1">Failed</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Grid View */}
            {viewMode === 'GRID' && (
                <div className="panel flex-1 overflow-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {drafts.map(draft => {
                            const car = inventory.find(c => c.canonicalId === draft.carId);
                            const dest = destinations.find(d => d.identifier === draft.destination);

                            return (
                                <div key={draft.id} className="bg-[var(--bg-input)] rounded-xl border border-[var(--border-color)] p-4 flex flex-col gap-3">
                                    {draft.imageUrl && (
                                        <img src={draft.imageUrl} className="w-full h-32 object-cover rounded-lg" alt="" />
                                    )}
                                    <div className="flex-1">
                                        <div className="text-xs font-mono text-[var(--text-secondary)] mb-2">
                                            {car?.title || 'Unknown Car'}
                                        </div>
                                        <div className="text-xs text-[var(--text-muted)] line-clamp-3">
                                            {draft.text}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                                            <Send size={12} />
                                            {dest?.name || draft.destination}
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${draft.status === 'POSTED' ? 'bg-green-500/20 text-green-500' :
                                                draft.status === 'SCHEDULED' ? 'bg-blue-500/20 text-blue-500' :
                                                    draft.status === 'FAILED' ? 'bg-red-500/20 text-red-500' :
                                                        'bg-gray-500/20 text-gray-500'
                                            }`}>
                                            {draft.status}
                                        </span>
                                    </div>
                                    {draft.scheduledAt && (
                                        <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1">
                                            <Clock size={10} />
                                            {new Date(draft.scheduledAt).toLocaleString()}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => deletePost(draft.id)}
                                        className="btn-ghost text-xs text-red-500 hover:bg-red-500/10 py-1"
                                    >
                                        Delete
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Bulk Scheduler Modal */}
            {showBulkScheduler && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-5xl max-h-[90vh] overflow-y-auto p-8 animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-[var(--text-primary)]">Bulk Schedule</h3>
                            <button onClick={() => setShowBulkScheduler(false)}>
                                <X size={20} className="text-[var(--text-secondary)]" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            {/* Left: Car Selection */}
                            <div>
                                <h4 className="font-bold text-sm text-[var(--text-secondary)] mb-3">
                                    Select Cars ({selectedCars.size} selected)
                                </h4>
                                <div className="max-h-96 overflow-y-auto space-y-2 bg-[var(--bg-input)] rounded-lg p-3">
                                    {inventory.map(car => (
                                        <div
                                            key={car.canonicalId}
                                            onClick={() => {
                                                const newSet = new Set(selectedCars);
                                                if (newSet.has(car.canonicalId)) {
                                                    newSet.delete(car.canonicalId);
                                                } else {
                                                    newSet.add(car.canonicalId);
                                                }
                                                setSelectedCars(newSet);
                                            }}
                                            className={`p-3 rounded cursor-pointer flex items-center gap-3 transition-colors ${selectedCars.has(car.canonicalId)
                                                    ? 'bg-gold-500/20 border-2 border-gold-500'
                                                    : 'bg-[var(--bg-panel)] border-2 border-transparent hover:border-[var(--border-color)]'
                                                }`}
                                        >
                                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedCars.has(car.canonicalId) ? 'bg-gold-500 border-gold-500' : 'border-[var(--text-secondary)]'
                                                }`}>
                                                {selectedCars.has(car.canonicalId) && <Check size={14} className="text-black" />}
                                            </div>
                                            <img src={car.thumbnail} className="w-12 h-12 rounded object-cover" alt="" />
                                            <div className="flex-1">
                                                <div className="text-xs font-bold text-[var(--text-primary)]">{car.title}</div>
                                                <div className="text-[10px] text-[var(--text-secondary)]">{car.price.amount} {car.price.currency}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right: Config */}
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Template</label>
                                    <select
                                        className="input"
                                        value={bulkConfig.template}
                                        onChange={e => setBulkConfig({ ...bulkConfig, template: e.target.value as PostTemplate })}
                                    >
                                        {Object.entries(allTemplates).map(([key, tmpl]) => (
                                            <option key={key} value={key}>{tmpl.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Destination</label>
                                    <select
                                        className="input"
                                        value={bulkConfig.destination}
                                        onChange={e => setBulkConfig({ ...bulkConfig, destination: e.target.value })}
                                    >
                                        <option value="">Select channel...</option>
                                        {destinations.map(d => (
                                            <option key={d.id} value={d.identifier}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Start Date</label>
                                        <input
                                            type="date"
                                            className="input"
                                            value={bulkConfig.startDate}
                                            onChange={e => setBulkConfig({ ...bulkConfig, startDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Start Time</label>
                                        <input
                                            type="time"
                                            className="input"
                                            value={bulkConfig.startTime}
                                            onChange={e => setBulkConfig({ ...bulkConfig, startTime: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">
                                        Interval between posts: {bulkConfig.interval}h
                                    </label>
                                    <input
                                        type="range"
                                        min="1"
                                        max="24"
                                        className="w-full"
                                        value={bulkConfig.interval}
                                        onChange={e => setBulkConfig({ ...bulkConfig, interval: parseInt(e.target.value) })}
                                    />
                                </div>

                                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-xs text-blue-400">
                                    <AlertCircle size={14} className="inline mr-1" />
                                    Will schedule {selectedCars.size} posts starting {bulkConfig.startDate} {bulkConfig.startTime},
                                    every {bulkConfig.interval} hours
                                </div>

                                <button
                                    onClick={bulkSchedule}
                                    disabled={!bulkConfig.destination || selectedCars.size === 0 || !bulkConfig.startDate}
                                    className="btn-primary w-full py-3"
                                >
                                    <Copy size={16} className="inline mr-2" /> Schedule {selectedCars.size} Posts
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Editor Modal */}
            {showTemplateEditor && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-2xl p-8 animate-slide-up shadow-2xl">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-xl text-[var(--text-primary)]">Template Editor</h3>
                            <button onClick={() => { setShowTemplateEditor(false); setEditingTemplate(null); }}>
                                <X size={20} className="text-[var(--text-secondary)]" />
                            </button>
                        </div>

                        {!editingTemplate ? (
                            <div className="space-y-3">
                                <button
                                    onClick={() => setEditingTemplate({ name: '', ua: '', ru: '' })}
                                    className="btn-primary w-full py-3"
                                >
                                    <Plus size={16} className="inline mr-2" /> Create New Template
                                </button>
                                <div className="space-y-2">
                                    {Object.entries(allTemplates).map(([key, tmpl]) => (
                                        <div key={key} className="bg-[var(--bg-input)] p-4 rounded-lg flex justify-between items-center">
                                            <div>
                                                <div className="font-bold text-sm">{tmpl.name}</div>
                                                <div className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-1">{tmpl.ua}</div>
                                            </div>
                                            {!DEFAULT_TEMPLATES[key] && (
                                                <button
                                                    onClick={() => setEditingTemplate(tmpl)}
                                                    className="btn-secondary text-xs px-3 py-1"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Template Name</label>
                                    <input
                                        className="input"
                                        placeholder="My Template"
                                        value={editingTemplate.name}
                                        onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Ukrainian Text (use {'{car}'} for car)</label>
                                    <textarea
                                        className="textarea h-32"
                                        value={editingTemplate.ua}
                                        onChange={e => setEditingTemplate({ ...editingTemplate, ua: e.target.value })}
                                        placeholder="🚗 <b>Text</b>\n\n{car}\n\n✅ More text"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-[var(--text-secondary)] uppercase block mb-2">Russian Text</label>
                                    <textarea
                                        className="textarea h-32"
                                        value={editingTemplate.ru}
                                        onChange={e => setEditingTemplate({ ...editingTemplate, ru: e.target.value })}
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setEditingTemplate(null)} className="btn-ghost flex-1">Cancel</button>
                                    <button onClick={saveTemplate} className="btn-primary flex-1">Save Template</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
