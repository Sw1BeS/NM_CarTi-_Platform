import React, { useState, useEffect, useRef } from 'react';
import { Data } from '../../services/data';
import { BotEngine } from '../../services/botEngine';
import { RequestsService } from '../../services/requestsService';
import { LeadsService } from '../../services/leadsService';
import { TelegramMessage, ChatMacro, User, B2BRequest, RequestStatus } from '../../types';
import { Send, Inbox, Trash2, X, Zap, UserCheck, StickyNote, Filter, Paperclip, Car, Smile, Image as ImageIcon, UserPlus, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSearchParams } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';
import { CarPicker } from '../../components/CarPicker';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { ApiClient } from '../../services/apiClient';
import { getApiBase } from '../../services/apiConfig';

interface ChatInfo {
    chatId: string;
    lastMsg: TelegramMessage;
    assignedTo?: string;
    internalNote?: string;
    requestId?: string;
    unreadCount: number;
}

export const InboxPage = () => {
    const [msgs, setMsgs] = useState<TelegramMessage[]>([]);
    const [chats, setChats] = useState<ChatInfo[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'MY' | 'UNASSIGNED'>('ALL');
    const [managers, setManagers] = useState<User[]>([]);
    const [showMacros, setShowMacros] = useState(false);
    const [showEmojis, setShowEmojis] = useState(false);
    const [macros, setMacros] = useState<ChatMacro[]>([]);
    const [macroModalOpen, setMacroModalOpen] = useState(false);
    const [macroForm, setMacroForm] = useState({ id: '', shortcut: '', text: '', category: '' });
    const [internalNote, setInternalNote] = useState('');
    const [showNotePanel, setShowNotePanel] = useState(false);
    const [requestByChat, setRequestByChat] = useState<Record<string, B2BRequest>>({});
    const [timeline, setTimeline] = useState<any[]>([]);
    const [timelineLoading, setTimelineLoading] = useState(false);
    const [bots, setBots] = useState<any[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<string | undefined>(undefined);
    const [showCarPicker, setShowCarPicker] = useState(false);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [showAttachment, setShowAttachment] = useState(false);
    const [attachmentType, setAttachmentType] = useState<'photo' | 'document' | 'video' | 'audio' | 'voice' | 'animation' | 'sticker'>('photo');
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestForm, setRequestForm] = useState({ title: '', budgetMin: 0, budgetMax: 0, yearMin: 0, yearMax: 0, city: '', description: '' });
    const [visibleCount, setVisibleCount] = useState(40);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const replyInputRef = useRef<HTMLTextAreaElement>(null);
    const { user } = useAuth();
    const { showToast } = useToast();
    const { t } = useLang();
    const [searchParams] = useSearchParams();

    // ... [Load Logic Unchanged] ...
    useEffect(() => {
        const load = async () => {
            setLoading(true); setLoadError(null);
            try {
                const [messages, requestRes, botList] = await Promise.all([
                    Data.getMessages({ botId: selectedBotId || undefined }),
                    RequestsService.getRequests({ status: 'ALL', limit: 200 }),
                    Data.getBots()
                ]);
                setBots(botList || []);
                let currentBotId = selectedBotId;
                if (currentBotId === undefined && botList && botList.length > 0) {
                    const active = botList.find((b: any) => b.active);
                    currentBotId = active ? active.id : botList[0].id;
                    setSelectedBotId(currentBotId);
                }

                let finalMessages = messages || [];
                if (!messages || (currentBotId && messages.length === 0)) {
                    finalMessages = await Data.getMessages({ botId: currentBotId || undefined });
                }
                setMsgs(finalMessages);

                const chatMap = new Map<string, ChatInfo>();
                const reqMap: Record<string, B2BRequest> = {};

                requestRes.items.forEach(req => {
                    if (!req.clientChatId) return;
                    const existing = reqMap[req.clientChatId];
                    if (!existing || new Date(req.createdAt) > new Date(existing.createdAt)) {
                        reqMap[req.clientChatId] = req;
                    }
                });

                setRequestByChat(reqMap);

                finalMessages.forEach(m => {
                    const linkedReq = reqMap[m.chatId];
                    if (!chatMap.has(m.chatId)) {
                        chatMap.set(m.chatId, {
                            chatId: m.chatId,
                            lastMsg: m,
                            assignedTo: linkedReq?.assigneeId,
                            internalNote: linkedReq?.internalNote,
                            requestId: linkedReq?.id,
                            unreadCount: 0
                        });
                    } else {
                        const existing = chatMap.get(m.chatId)!;
                        if (new Date(m.date) > new Date(existing.lastMsg.date)) {
                            existing.lastMsg = m;
                        }
                    }
                });

                const sortedChats = Array.from(chatMap.values()).sort((a, b) =>
                    new Date(b.lastMsg.date).getTime() - new Date(a.lastMsg.date).getTime()
                );
                setChats(sortedChats);
            } catch (e: any) {
                console.error(e);
                setLoadError(e?.message || 'Failed to load inbox');
            } finally {
                setLoading(false);
            }
        };

        load();
        const unsub = Data.subscribe('UPDATE_MESSAGES', load);
        const target = searchParams.get('chatId');
        if (target) setActiveChatId(target);
        return unsub;
    }, [searchParams, selectedBotId]);

    useEffect(() => {
        Data.getUsers().then(users => {
            setManagers(users.filter(u => u.role === 'MANAGER' || u.role === 'ADMIN'));
        });
    }, []);

    useEffect(() => {
        const loadMacros = async () => {
            try {
                const list = await Data.getMacros();
                setMacros(Array.isArray(list) ? list : []);
            } catch (e) {
                console.error(e);
                setMacros([]);
            }
        };
        loadMacros();
        const sub = Data.subscribe('UPDATE_MACROS', loadMacros);
        return sub;
    }, []);

    useEffect(() => {
        if (activeChatId) {
            setInternalNote('');
            const req = requestByChat[activeChatId];
            Data.getChatNote(activeChatId).then(note => {
                setInternalNote(note?.text || req?.internalNote || '');
            }).catch(() => {
                setInternalNote(req?.internalNote || '');
            });
            if (req) {
                setTimelineLoading(true);
                Data.getMessageLogs({ requestId: req.id, chatId: activeChatId, limit: 50 }).then(setTimeline).finally(() => setTimelineLoading(false));
            } else {
                setTimeline([]);
            }
        }
    }, [activeChatId, requestByChat]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [msgs, activeChatId]);

    useEffect(() => {
        if (activeChatId) {
            replyInputRef.current?.focus();
        }
    }, [activeChatId]);

    const handleReply = async () => {
        if (!activeChatId) return;
        if (!selectedBotId) return showToast(t('inbox.select_bot'), 'error');
        const hasText = !!replyText.trim();
        const hasAttachment = !!attachmentUrl.trim();
        if (!hasText && !hasAttachment) return;
        try {
            if (hasAttachment) {
                await BotEngine.sendTelegramMedia(activeChatId, {
                    type: attachmentType,
                    url: attachmentUrl.trim(),
                    caption: hasText ? replyText : undefined,
                    botId: selectedBotId
                }, selectedBotId);
                setAttachmentUrl('');
                setShowAttachment(false);
                setReplyText('');
            } else if (hasText) {
                await BotEngine.sendUnifiedMessage('TG', activeChatId, replyText, undefined, selectedBotId);
                setReplyText('');
            }
            // Trigger refresh
            Data._notify('UPDATE_MESSAGES');
        } catch (e: any) {
            showToast(e.message || t('inbox.send_failed'), 'error');
        }
    };

    const handleCarSelect = async (car: any) => {
        if (!activeChatId || !selectedBotId) return;
        try {
            await BotEngine.sendCar(activeChatId, car, selectedBotId);
            showToast('Card sent');
            setShowCarPicker(false);
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const insertEmoji = (emoji: string) => {
        setReplyText(prev => prev + emoji);
        setShowEmojis(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 5MB Limit
        if (file.size > 5 * 1024 * 1024) {
            showToast('File is too large (max 5MB)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            const content = reader.result as string;
            try {
                const res = await ApiClient.post<{ ok: boolean; url?: string }>('storage/upload', {
                    name: file.name,
                    content,
                    type: file.type
                });

                if (res.ok && res.data?.url) {
                    let type: 'photo' | 'document' | 'video' | 'audio' | 'voice' | 'animation' | 'sticker' = 'document';
                    if (file.type.startsWith('image/')) type = 'photo';
                    else if (file.type.startsWith('video/')) type = 'video';
                    else if (file.type.startsWith('audio/')) type = 'audio';

                    setAttachmentUrl(res.data.url);
                    setAttachmentType(type);
                    setShowAttachment(true);
                    showToast('File attached', 'success');
                } else {
                    showToast(res.message || 'Upload failed', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('Upload error', 'error');
            }
        };
        reader.readAsDataURL(file);
    };

    const resetMacroForm = () => setMacroForm({ id: '', shortcut: '', text: '', category: '' });

    const handleSaveMacro = async () => {
        if (!macroForm.shortcut.trim() || !macroForm.text.trim()) {
            return showToast('Shortcut and text are required', 'error');
        }
        try {
            if (macroForm.id) {
                await Data.updateMacro(macroForm.id, {
                    shortcut: macroForm.shortcut.trim(),
                    text: macroForm.text.trim(),
                    category: macroForm.category || undefined
                });
                showToast('Macro updated', 'success');
            } else {
                await Data.createMacro({
                    shortcut: macroForm.shortcut.trim(),
                    text: macroForm.text.trim(),
                    category: macroForm.category || undefined
                });
                showToast('Macro created', 'success');
            }
            resetMacroForm();
        } catch (e: any) {
            showToast(e.message || 'Failed to save macro', 'error');
        }
    };

    const handleEditMacro = (macro: ChatMacro) => {
        setMacroForm({
            id: macro.id,
            shortcut: macro.shortcut || '',
            text: macro.text || '',
            category: macro.category || ''
        });
        setMacroModalOpen(true);
    };

    const handleDeleteMacro = async (id: string) => {
        if (!confirm('Delete this macro?')) return;
        try {
            await Data.deleteMacro(id);
            showToast('Macro deleted', 'success');
        } catch (e: any) {
            showToast(e.message || 'Failed to delete macro', 'error');
        }
    };

    const createLead = async () => {
        if (!activeChat || !selectedBotId) return;
        try {
            await LeadsService.createLead({
                clientName: activeChat.lastMsg.from,
                source: 'Telegram',
                botId: selectedBotId,
                userTgId: activeChatId || undefined,
                status: 'NEW'
            });
            showToast('Lead created', 'success');
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const openRequestModal = () => {
        if (!activeChatId) return;
        if (requestByChat[activeChatId]) return showToast('Request already exists', 'error');
        const chatInfo = chats.find(c => c.chatId === activeChatId);
        setRequestForm({
            title: chatInfo ? `Request from ${chatInfo.lastMsg.from}` : 'New Request',
            budgetMin: 0, budgetMax: 0, yearMin: 0, yearMax: 0, city: '', description: ''
        });
        setShowRequestModal(true);
    };

    const submitRequest = async () => {
        if (!activeChatId) return;
        try {
            const chatInfo = chats.find(c => c.chatId === activeChatId);
            const yearMinVal = Number(requestForm.yearMin) || 0;
            const yearMaxVal = Number(requestForm.yearMax) || 0;
            const payload = {
                clientChatId: activeChatId,
                title: requestForm.title || (chatInfo ? `Request from ${chatInfo.lastMsg.from}` : 'New Request'),
                status: RequestStatus.DRAFT,
                platform: 'TG',
                budgetMin: Number(requestForm.budgetMin) || 0,
                budgetMax: Number(requestForm.budgetMax) || 0,
                yearMin: yearMinVal > 0 ? yearMinVal : undefined,
                yearMax: yearMaxVal > 0 ? yearMaxVal : undefined,
                city: requestForm.city || '',
                description: requestForm.description || '',
                createdAt: new Date().toISOString()
            };
            const newReq = await RequestsService.createRequest(payload);
            setRequestByChat(prev => ({ ...prev, [activeChatId]: newReq }));
            if (chatInfo) setChats(prev => prev.map(c => c.chatId === activeChatId ? { ...c, requestId: newReq.id } : c));
            showToast('Request created', 'success');
            setShowRequestModal(false);
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const assignChat = async (chatId: string, userId: string) => {
        let req = requestByChat[chatId];
        if (!req) {
            try {
                const chatInfo = chats.find(c => c.chatId === chatId);
                const newReq = await RequestsService.createRequest({
                    clientChatId: chatId,
                    title: chatInfo ? `Request from ${chatInfo.lastMsg.from}` : 'New Request',
                    status: RequestStatus.DRAFT,
                    platform: 'TG',
                    budgetMin: 0, budgetMax: 0, city: '', description: '',
                    createdAt: new Date().toISOString()
                });
                req = newReq;
                setRequestByChat(prev => ({ ...prev, [chatId]: newReq }));
                if (chatInfo) setChats(prev => prev.map(c => c.chatId === chatId ? { ...c, requestId: newReq.id } : c));
            } catch (e) { console.error(e); return; }
        }
        await RequestsService.updateRequest(req.id, { assigneeId: userId || null });
        setChats(prev => prev.map(c => c.chatId === chatId ? { ...c, assignedTo: userId } : c));
        setRequestByChat(prev => ({ ...prev, [chatId]: { ...prev[chatId], assigneeId: userId || undefined } }));
        showToast(t('inbox.assigned'), 'success');
    };

    const saveNote = async () => {
        if (!activeChatId) return;
        const req = requestByChat[activeChatId];
        try {
            await Data.saveChatNote({ chatId: activeChatId, text: internalNote });
            if (req) {
                await RequestsService.updateRequest(req.id, { internalNote });
                setRequestByChat({ ...requestByChat, [activeChatId]: { ...req, internalNote } });
            }
            showToast(t('inbox.note_saved'), 'success');
            setShowNotePanel(false);
        } catch (e: any) {
            showToast(e.message || 'Failed to save note', 'error');
        }
    };

    const activeMessages = activeChatId
        ? msgs.filter(m => m.chatId === activeChatId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        : [];
    const filteredChats = chats.filter(c => {
        if (filter === 'MY') return c.assignedTo === user?.id;
        if (filter === 'UNASSIGNED') return !c.assignedTo;
        return true;
    });
    const visibleChats = filteredChats.slice(0, visibleCount);
    const activeChat = chats.find(c => c.chatId === activeChatId);
    const activeRequest = activeChatId ? requestByChat[activeChatId] : undefined;
    const renderMessageText = (text: string) => {
        const lines = String(text || '').split('\n');
        return lines.map((line, idx) => {
            const parts = line.split(/(\s+)/);
            return (
                <span key={`line-${idx}`}>
                    {parts.map((part, i) => part.startsWith('/') ? (
                        <span key={`cmd-${idx}-${i}`} className="px-1 py-0.5 rounded bg-black/10 text-gold-600 font-mono">{part}</span>
                    ) : (
                        <span key={`txt-${idx}-${i}`}>{part}</span>
                    ))}
                    {idx < lines.length - 1 && <br />}
                </span>
            );
        });
    };

    const formatBytes = (value?: number) => {
        if (!value || Number.isNaN(value)) return '';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        let size = value;
        let idx = 0;
        while (size >= 1024 && idx < sizes.length - 1) {
            size /= 1024;
            idx += 1;
        }
        return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${sizes[idx]}`;
    };

    const fetchTelegramFile = async (fileId: string, botId?: string) => {
        const base = getApiBase();
        const token = localStorage.getItem('cartie_token');
        const params = new URLSearchParams();
        params.append('fileId', fileId);
        if (botId) params.append('botId', botId);
        const res = await fetch(`${base}/telegram/file?${params.toString()}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!res.ok) throw new Error('Failed to fetch media');
        return await res.blob();
    };

    const cacheTelegramFile = async (payload: { fileId: string; botId?: string; chatId?: string; messageId?: number; size?: number }) => {
        const res = await ApiClient.post<{ ok: boolean; url?: string }>('telegram/file/cache', payload);
        if (!res.ok || !res.data?.url) {
            const err = new Error(res.message || 'Failed to cache media');
            (err as any).status = res.status;
            throw err;
        }
        return res.data.url;
    };

    const MessageMedia = ({ media, botId, chatId, messageId }: { media?: TelegramMessage['media'] | null; botId?: string; chatId?: string; messageId?: number }) => {
        const [blobUrl, setBlobUrl] = useState<string | null>(null);
        const [loading, setLoading] = useState(false);
        const type = String(media?.type || 'file');
        const resolvedUrl = media?.url || blobUrl || '';
        const fileLabel = media?.fileName || media?.mimeType || 'File';
        const sizeLabel = formatBytes(media?.size);
        const isImage = ['photo', 'sticker', 'animation'].includes(type);
        const isVideo = type === 'video';
        const isAudio = type === 'audio' || type === 'voice';
        const AUTO_FETCH_LIMIT = 12 * 1024 * 1024;
        const tooLarge = media?.size ? media.size > AUTO_FETCH_LIMIT : false;
        const shouldAutoFetch = !media?.url && media?.fileId && (isImage || isVideo || isAudio) && !tooLarge && (media?.size || isImage);

        useEffect(() => {
            if (!shouldAutoFetch) return;
            let cancelled = false;
            let localUrl: string | null = null;
            setLoading(true);
            cacheTelegramFile({ fileId: media.fileId, botId, chatId, messageId, size: media.size })
                .then(url => {
                    if (!cancelled) setBlobUrl(url);
                })
                .catch(async (err: any) => {
                    if (err?.status === 413) {
                        return;
                    }
                    try {
                        const blob = await fetchTelegramFile(media.fileId!, botId);
                        localUrl = URL.createObjectURL(blob);
                        if (!cancelled) setBlobUrl(localUrl);
                    } catch {
                        // ignore
                    }
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
            return () => {
                cancelled = true;
                if (localUrl) URL.revokeObjectURL(localUrl);
            };
        }, [media?.fileId, media?.url, botId, isImage, isVideo, isAudio, shouldAutoFetch, media?.size, chatId, messageId]);

        const handleDownload = async () => {
            if (resolvedUrl) {
                const link = document.createElement('a');
                link.href = resolvedUrl;
                link.download = fileLabel;
                link.rel = 'noreferrer';
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                return;
            }
            if (!media?.fileId) return;
            try {
                setLoading(true);
                const blob = await fetchTelegramFile(media.fileId, botId);
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileLabel;
                link.rel = 'noreferrer';
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            } finally {
                setLoading(false);
            }
        };

        if (isImage) {
            return (
                <div className="mb-2">
                    {resolvedUrl ? (
                        <img src={resolvedUrl} className="max-h-56 rounded-lg object-cover border border-[var(--border-color)]" alt={fileLabel} />
                    ) : (
                        <div className="text-xs text-[var(--text-secondary)]">{loading ? 'Loading image...' : 'Image unavailable'}</div>
                    )}
                </div>
            );
        }

        if (isVideo && resolvedUrl) {
            return (
                <div className="mb-2">
                    <video controls className="w-full max-h-56 rounded-lg border border-[var(--border-color)]">
                        <source src={resolvedUrl} />
                    </video>
                </div>
            );
        }

        if (isAudio && resolvedUrl) {
            return (
                <div className="mb-2">
                    <audio controls className="w-full">
                        <source src={resolvedUrl} />
                    </audio>
                </div>
            );
        }

        return (
            <div className="mb-2 p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] text-xs flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)] truncate">{fileLabel}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">
                        {type.toUpperCase()}{sizeLabel ? ` • ${sizeLabel}` : ''}{tooLarge ? ' • large' : ''}
                    </div>
                </div>
                <button onClick={handleDownload} className="btn-secondary text-[10px]" disabled={loading}>
                    {loading ? 'Loading...' : 'Download'}
                </button>
            </div>
        );
    };

    const messageItems: Array<{ type: 'date'; date: Date } | { type: 'message'; msg: TelegramMessage }> = [];
    let lastDateKey = '';
    activeMessages.forEach(m => {
        const dateObj = new Date(m.date);
        const dateKey = dateObj.toDateString();
        if (dateKey !== lastDateKey) {
            messageItems.push({ type: 'date', date: dateObj });
            lastDateKey = dateKey;
        }
        messageItems.push({ type: 'message', msg: m });
    });

    return (
        <div className="h-[calc(100vh-100px)] flex gap-6">
            {/* Sidebar List */}
            <div className="w-80 panel flex flex-col overflow-hidden shrink-0">
                {/* ... [Sidebar Header Unchanged] ... */}
                <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur space-y-3">
                    <div className="flex justify-between items-center">
                        <h2 className="font-bold text-[var(--text-primary)]">Inbox</h2>
                        <div className="flex gap-1">
                            <button onClick={() => setFilter('ALL')} className={`px-2 py-1 text-[10px] rounded ${filter === 'ALL' ? 'bg-gold-500 text-black' : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>All</button>
                            <button onClick={() => setFilter('MY')} className={`px-2 py-1 text-[10px] rounded ${filter === 'MY' ? 'bg-gold-500 text-black' : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>My</button>
                            <button onClick={() => setFilter('UNASSIGNED')} className={`px-2 py-1 text-[10px] rounded ${filter === 'UNASSIGNED' ? 'bg-gold-500 text-black' : 'bg-[var(--bg-input)] text-[var(--text-secondary)]'}`}>Unassigned</button>
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] uppercase text-[var(--text-secondary)] font-bold">Bot</label>
                        <select className="input mt-1 text-sm" value={selectedBotId || ''} onChange={e => setSelectedBotId(e.target.value || undefined)}>
                            <option value="">All bots</option>
                            {bots.map(b => <option key={b.id} value={b.id}>{b.name || b.username || b.id}</option>)}
                        </select>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)]">{filteredChats.length} conversations</p>
                    {loadError && <p className="text-xs text-red-500">{loadError}</p>}
                </div>
                <div className="flex-1 overflow-y-auto">
                    {visibleChats.map(c => (
                        <div key={c.chatId} onClick={() => setActiveChatId(c.chatId)} className={`p-4 border-b border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-input)] transition-colors ${activeChatId === c.chatId ? 'bg-gold-500/10 border-l-4 border-l-gold-500' : 'border-l-4 border-l-transparent'}`}>
                            <div className="flex justify-between mb-1">
                                <span className="font-bold text-sm text-[var(--text-primary)] truncate max-w-[150px]">{c.lastMsg.from}</span>
                                <span className="text-[10px] text-[var(--text-secondary)] tabular-nums">{new Date(c.lastMsg.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate mb-2">
                                {c.lastMsg.text === '[Media/Unknown]' && c.lastMsg.media?.type
                                    ? `[${c.lastMsg.media.type}]`
                                    : c.lastMsg.text}
                            </div>
                            {c.assignedTo && <div className="flex items-center gap-1 text-[9px] text-blue-500"><UserCheck size={10} /> {managers.find(m => m.id === c.assignedTo)?.name || 'Assigned'}</div>}
                        </div>
                    ))}
                    {visibleChats.length < filteredChats.length && (
                        <div className="p-4 flex justify-center bg-[var(--bg-panel)] border-t border-[var(--border-color)]">
                            <button className="btn-secondary text-xs" onClick={() => setVisibleCount(v => v + 30)}>Load more</button>
                        </div>
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 panel flex flex-col overflow-hidden relative">
                {activeChatId ? (
                    <>
                        {/* Header */}
                        <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur flex justify-between items-center z-10">
                            <div className="flex items-center gap-3">
                                <div>
                                    <div className="font-bold text-[var(--text-primary)]">{activeChat?.lastMsg.from || 'Chat'}</div>
                                    <div className="text-[10px] text-[var(--text-secondary)]">ID: {activeChatId}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={createLead} className="btn-secondary px-2 py-1 text-xs" title="Create Lead"><UserPlus size={14} /></button>
                                <button onClick={openRequestModal} className={`btn-secondary px-2 py-1 text-xs ${activeRequest ? 'text-green-500' : ''}`} title={activeRequest ? "Request Exists" : "Create Request"}><FileText size={14} /></button>

                                <select className="input text-xs px-2 py-1" value={activeChat?.assignedTo || ''} onChange={e => assignChat(activeChatId, e.target.value)}>
                                    <option value="">Unassigned</option>
                                    {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <button onClick={() => setShowNotePanel(!showNotePanel)} className={`btn-secondary px-3 py-1.5 text-xs ${internalNote ? 'text-gold-500' : ''}`}><StickyNote size={14} /></button>
                                <button onClick={async () => { await Data.clearSession(activeChatId); Data._notify('UPDATE_MESSAGES'); showToast('Session cleared'); }} className="btn-ghost text-xs text-red-500 hover:bg-red-500/10 px-3 py-1.5"><Trash2 size={14} /></button>
                            </div>
                        </div>

                        {/* Note Panel */}
                        {showNotePanel && (
                            <div className="bg-yellow-500/10 border-b border-yellow-500/30 p-3">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="text-xs font-bold text-yellow-600 flex items-center gap-1"><StickyNote size={12} /> Internal Note</div>
                                    <button onClick={() => setShowNotePanel(false)}><X size={14} className="text-[var(--text-secondary)]" /></button>
                                </div>
                                <textarea className="textarea text-xs h-20 w-full" placeholder="Add private notes..." value={internalNote} onChange={e => setInternalNote(e.target.value)} />
                                <button onClick={saveNote} className="btn-primary text-xs px-3 py-1 mt-2">Save Note</button>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-[var(--bg-input)]">
                            {messageItems.map((item, idx) => {
                                if (item.type === 'date') {
                                    return (
                                        <div key={`date-${idx}`} className="flex justify-center">
                                            <span className="text-[10px] uppercase tracking-widest text-[var(--text-secondary)] bg-[var(--bg-panel)] px-3 py-1 rounded-full border border-[var(--border-color)]">
                                                {item.date.toLocaleDateString()}
                                            </span>
                                        </div>
                                    );
                                }
                                const m = item.msg;
                                const isOut = m.direction === 'OUTGOING';
                                const hideText = m.media && (!m.text || m.text === '[Media/Unknown]');
                                return (
                                    <div key={m.id} className={`flex ${isOut ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[70%] p-3 rounded-2xl shadow-sm text-sm relative group ${isOut ? 'bg-gold-500 text-charcoal-950 rounded-tr-none' : 'bg-[var(--bg-panel)] text-[var(--text-primary)] rounded-tl-none border border-[var(--border-color)]'}`}>
                                            {m.media && <MessageMedia media={m.media} botId={m.botId} chatId={m.chatId} messageId={m.messageId} />}
                                            {!hideText && renderMessageText(m.text)}
                                            <div className={`text-[9px] mt-1 text-right opacity-60 ${isOut ? 'text-charcoal-800' : 'text-[var(--text-secondary)]'}`}>{new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input Area */}
                        <div className="border-t border-[var(--border-color)] bg-[var(--bg-panel)] backdrop-blur">
                            {/* Toolbar */}
                            {showEmojis && (
                                <div className="p-2 border-b border-[var(--border-color)] bg-[var(--bg-input)]">
                                    <Picker
                                        data={data}
                                        theme="dark"
                                        onEmojiSelect={(emoji: any) => insertEmoji(emoji.native || '')}
                                        previewPosition="none"
                                        skinTonePosition="none"
                                        perLine={8}
                                    />
                                </div>
                            )}

                            {showMacros && (
                                <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-input)] space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="text-[10px] uppercase text-[var(--text-secondary)] font-bold">Macros</div>
                                        <button onClick={() => setMacroModalOpen(true)} className="text-[10px] uppercase font-bold text-gold-500">Manage</button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {macros.length === 0 && (
                                            <div className="col-span-2 text-xs text-[var(--text-secondary)]">No macros yet. Add one.</div>
                                        )}
                                        {macros.map(macro => (
                                            <button key={macro.id} onClick={() => { setReplyText(macro.text); setShowMacros(false); }} className="text-left p-2 rounded bg-[var(--bg-panel)] hover:bg-[var(--bg-app)] border border-[var(--border-color)] transition-colors">
                                                <div className="text-[10px] font-mono text-gold-500 mb-1">{macro.shortcut}</div>
                                                <div className="text-xs text-[var(--text-primary)] line-clamp-2">{macro.text}</div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {showAttachment && (
                                <div className="p-3 border-b border-[var(--border-color)] bg-[var(--bg-input)] space-y-2">
                                    <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
                                        <select className="input w-full md:w-48" value={attachmentType} onChange={e => setAttachmentType(e.target.value as any)}>
                                            <option value="photo">Photo</option>
                                            <option value="video">Video</option>
                                            <option value="document">Document</option>
                                            <option value="audio">Audio</option>
                                            <option value="voice">Voice (ogg)</option>
                                            <option value="animation">GIF/Animation</option>
                                            <option value="sticker">Sticker</option>
                                        </select>
                                        <input className="input flex-1" placeholder="File URL or Telegram file_id" value={attachmentUrl} onChange={e => setAttachmentUrl(e.target.value)} />
                                        <button onClick={() => { setAttachmentUrl(''); }} className="btn-secondary text-xs">Clear</button>
                                        <label className="btn-secondary text-xs cursor-pointer flex items-center gap-1">
                                            Upload
                                            <input type="file" hidden onChange={handleFileUpload} />
                                        </label>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-secondary)]">Tip: paste a public https:// URL or an existing Telegram file_id to reuse Telegram storage.</p>
                                </div>
                            )}

                            {activeChat && (
                                <div className="px-4 pt-3 text-xs text-[var(--text-secondary)] flex items-center gap-2">
                                    Replying to <span className="font-bold text-[var(--text-primary)]">{activeChat.lastMsg.from}</span>
                                    {activeRequest && <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px]">Linked request</span>}
                                </div>
                            )}

                            <div className="p-4 flex gap-3 items-end">
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => setShowCarPicker(true)} className="btn-secondary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 text-blue-400 border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20" title="Attach Car">
                                        <Car size={18} />
                                    </button>
                                    <button onClick={() => setShowEmojis(!showEmojis)} className={`btn-secondary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 ${showEmojis ? 'bg-amber-500 text-black' : 'text-amber-500 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20'}`} title="Emoji">
                                        <Smile size={18} />
                                    </button>
                                </div>

                                <textarea
                                    className="input min-h-[50px] max-h-[120px] py-3"
                                    placeholder="Type message..."
                                    value={replyText}
                                    ref={replyInputRef}
                                    onChange={e => setReplyText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                                />

                                <div className="flex flex-col gap-2">
                                    <button onClick={() => setShowAttachment(!showAttachment)} className={`btn-secondary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 ${showAttachment ? 'bg-blue-500 text-white' : ''}`} title="Attach file/photo/video">
                                        <Paperclip size={18} />
                                    </button>
                                    <button onClick={() => setShowMacros(!showMacros)} className={`btn-secondary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 ${showMacros ? 'bg-gold-500 text-black' : ''}`} title="Macros">
                                        <Zap size={18} />
                                    </button>
                                    <button onClick={handleReply} disabled={!replyText.trim() && !attachmentUrl.trim()} className="btn-primary w-10 h-10 rounded-full !p-0 flex items-center justify-center shrink-0 shadow-lg shadow-gold-500/20 disabled:opacity-50">
                                        <Send size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)]">
                        <Inbox size={64} className="mb-4 opacity-20" />
                        <p>Select a conversation</p>
                    </div>
                )}
            </div>

            {showCarPicker && <CarPicker onSelect={handleCarSelect} onClose={() => setShowCarPicker(false)} />}

            {showRequestModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="panel w-full max-w-2xl p-6 space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--text-primary)]">Create Request</h3>
                                <p className="text-sm text-[var(--text-secondary)]">Fill optional fields to keep context.</p>
                            </div>
                            <button onClick={() => setShowRequestModal(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><X size={18} /></button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <label className="text-xs text-[var(--text-secondary)] font-bold">Title</label>
                                <input className="input" value={requestForm.title} onChange={e => setRequestForm({ ...requestForm, title: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-[var(--text-secondary)] font-bold">City</label>
                                <input className="input" value={requestForm.city} onChange={e => setRequestForm({ ...requestForm, city: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-[var(--text-secondary)] font-bold">Budget Min</label>
                                <input type="number" className="input" value={requestForm.budgetMin} onChange={e => setRequestForm({ ...requestForm, budgetMin: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-[var(--text-secondary)] font-bold">Budget Max</label>
                                <input type="number" className="input" value={requestForm.budgetMax} onChange={e => setRequestForm({ ...requestForm, budgetMax: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-[var(--text-secondary)] font-bold">Year Min</label>
                                <input type="number" className="input" value={requestForm.yearMin} onChange={e => setRequestForm({ ...requestForm, yearMin: Number(e.target.value) })} />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-[var(--text-secondary)] font-bold">Year Max</label>
                                <input type="number" className="input" value={requestForm.yearMax} onChange={e => setRequestForm({ ...requestForm, yearMax: Number(e.target.value) })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-[var(--text-secondary)] font-bold">Description</label>
                            <textarea className="textarea h-24" value={requestForm.description} onChange={e => setRequestForm({ ...requestForm, description: e.target.value })} />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setShowRequestModal(false)} className="btn-secondary">Cancel</button>
                            <button onClick={submitRequest} className="btn-primary">Save Request</button>
                        </div>
                    </div>
                </div>
            )}

            {macroModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="panel w-full max-w-2xl p-6 space-y-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-[var(--text-primary)]">Chat Macros</h3>
                                <p className="text-xs text-[var(--text-secondary)]">Create reusable replies for faster responses.</p>
                            </div>
                            <button onClick={() => { setMacroModalOpen(false); resetMacroForm(); }}><X size={18} /></button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {macros.map(macro => (
                                <div key={macro.id} className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <div className="text-[10px] font-mono text-gold-500">{macro.shortcut}</div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleEditMacro(macro)} className="text-xs text-blue-500">Edit</button>
                                            <button onClick={() => handleDeleteMacro(macro.id)} className="text-xs text-red-500">Delete</button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-[var(--text-primary)] line-clamp-3">{macro.text}</div>
                                    {macro.category && <div className="text-[10px] text-[var(--text-secondary)]">#{macro.category}</div>}
                                </div>
                            ))}
                            {macros.length === 0 && (
                                <div className="text-xs text-[var(--text-secondary)]">No macros yet.</div>
                            )}
                        </div>

                        <div className="border-t border-[var(--border-color)] pt-4 space-y-3">
                            <div className="text-xs uppercase text-[var(--text-secondary)] font-bold">{macroForm.id ? 'Edit Macro' : 'New Macro'}</div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <input className="input text-sm" placeholder="/shortcut" value={macroForm.shortcut} onChange={e => setMacroForm(prev => ({ ...prev, shortcut: e.target.value }))} />
                                <input className="input text-sm md:col-span-2" placeholder="Macro text" value={macroForm.text} onChange={e => setMacroForm(prev => ({ ...prev, text: e.target.value }))} />
                            </div>
                            <input className="input text-sm" placeholder="Category (optional)" value={macroForm.category} onChange={e => setMacroForm(prev => ({ ...prev, category: e.target.value }))} />
                            <div className="flex justify-end gap-2">
                                <button onClick={resetMacroForm} className="btn-ghost text-xs">Clear</button>
                                <button onClick={handleSaveMacro} className="btn-primary text-xs px-4">Save Macro</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
