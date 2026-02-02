import React, { useEffect, useState } from 'react';
import { destinationService, TelegramDestination } from '../../services/destination.service';
import { useToast } from '../../contexts/ToastContext';
import { Send, Bot, RefreshCw, Pause, Play, AlertTriangle } from 'lucide-react';

export const TelegramSourcesPage = () => {
    const [destinations, setDestinations] = useState<TelegramDestination[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    const fetchDestinations = async () => {
        try {
            setLoading(true);
            const data = await destinationService.list();
            setDestinations(data);
        } catch (e: any) {
            showToast(e.message || 'Failed to load destinations', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDestinations();
    }, []);

    const handleSync = async (id: string) => {
        try {
            const res = await destinationService.sync(id);
            showToast(res.message, 'success');
            fetchDestinations();
        } catch (e: any) {
            showToast(e.message || 'Sync failed', 'error');
        }
    };

    const handleToggleStatus = async (dest: TelegramDestination) => {
        try {
            if (dest.status === 'ACTIVE') {
                await destinationService.pause(dest.id);
                showToast('Destination paused', 'success');
            } else {
                await destinationService.resume(dest.id);
                showToast('Destination resumed', 'success');
            }
            fetchDestinations();
        } catch (e: any) {
            showToast(e.message || 'Status update failed', 'error');
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Send className="text-blue-500" /> Telegram Sources & Destinations
                </h1>
                <button onClick={fetchDestinations} className="btn-secondary flex items-center gap-2">
                    <RefreshCw size={16} /> Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {destinations.length === 0 && (
                    <div className="text-center p-12 bg-gray-50 rounded-lg text-gray-500">
                        No destinations found. Connect a Bot or MTProto account to discover sources.
                    </div>
                )}

                {destinations.map(dest => (
                    <div key={dest.id} className="bg-white p-4 rounded-lg shadow border flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-full ${dest.type === 'CHANNEL' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>
                                {dest.access === 'BOT' ? <Bot size={20} /> : <Send size={20} />}
                            </div>
                            <div>
                                <h3 className="font-semibold">{dest.title}</h3>
                                <div className="text-sm text-gray-500 flex gap-2">
                                    <span>{dest.username ? `@${dest.username}` : 'No username'}</span>
                                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{dest.type}</span>
                                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">{dest.role}</span>
                                    {dest.status === 'ERROR' && <span className="text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> Error</span>}
                                    {dest.status === 'PAUSED' && <span className="text-yellow-600">Paused</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => handleToggleStatus(dest)}
                                className={`p-2 rounded hover:bg-gray-100 ${dest.status === 'ACTIVE' ? 'text-yellow-600' : 'text-green-600'}`}
                                title={dest.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                            >
                                {dest.status === 'ACTIVE' ? <Pause size={18} /> : <Play size={18} />}
                            </button>

                            {dest.role !== 'DESTINATION' && (
                                <button
                                    onClick={() => handleSync(dest.id)}
                                    className="p-2 rounded hover:bg-gray-100 text-blue-600"
                                    title="Sync Now"
                                >
                                    <RefreshCw size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
