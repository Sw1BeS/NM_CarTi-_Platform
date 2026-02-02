import React, { useEffect, useState } from 'react';
import { mtprotoService, MTProtoConnector, ChannelSource } from '../../services/mtproto.service';
import { useToast } from '../../contexts/ToastContext';
import { Send, CloudDownload, Calendar, CheckSquare } from 'lucide-react';

export const MTProtoIntegrationPage = () => {
    const [connectors, setConnectors] = useState<MTProtoConnector[]>([]);
    const [channels, setChannels] = useState<ChannelSource[]>([]);
    const [selectedConnector, setSelectedConnector] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    // Import Modal State
    const [importModal, setImportModal] = useState<{ isOpen: boolean; sourceId: string | null }>({ isOpen: false, sourceId: null });
    const [importConfig, setImportConfig] = useState({
        fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        toDate: new Date().toISOString().split('T')[0],
        mode: 'INVENTORY'
    });
    const [previewData, setPreviewData] = useState<any>(null);

    useEffect(() => {
        loadConnectors();
    }, []);

    useEffect(() => {
        if (selectedConnector) {
            loadChannels(selectedConnector);
        } else {
            setChannels([]);
        }
    }, [selectedConnector]);

    const loadConnectors = async () => {
        try {
            const data = await mtprotoService.listConnectors();
            setConnectors(data);
            if (data.length > 0 && !selectedConnector) {
                setSelectedConnector(data[0].id);
            }
        } catch (e: any) {
            showToast(e.message || 'Failed to load connectors', 'error');
        }
    };

    const loadChannels = async (connId: string) => {
        try {
            const data = await mtprotoService.listChannels(connId);
            setChannels(data);
        } catch (e: any) {
            showToast(e.message || 'Failed to load channels', 'error');
        }
    };

    const handlePreview = async () => {
        if (!selectedConnector || !importModal.sourceId) return;
        setLoading(true);
        try {
            const res = await mtprotoService.previewImport(selectedConnector, importModal.sourceId, {
                fromDate: importConfig.fromDate,
                toDate: importConfig.toDate,
                mode: importConfig.mode
            });
            setPreviewData(res);
        } catch (e: any) {
            showToast(e.message || 'Preview failed', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!selectedConnector || !importModal.sourceId) return;
        try {
            await mtprotoService.startImport(selectedConnector, importModal.sourceId, {
                fromDate: importConfig.fromDate,
                toDate: importConfig.toDate,
                mode: importConfig.mode
            });
            showToast('Import job started', 'success');
            setImportModal({ isOpen: false, sourceId: null });
            setPreviewData(null);
        } catch (e: any) {
            showToast('Import failed', 'error');
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Send className="text-blue-500" /> MTProto Channels
            </h1>

            <div className="flex gap-6">
                {/* Connectors List */}
                <div className="w-1/4 bg-white p-4 rounded shadow">
                    <h3 className="font-semibold mb-4">Accounts</h3>
                    {connectors.map(c => (
                        <div
                            key={c.id}
                            onClick={() => setSelectedConnector(c.id)}
                            className={`p-3 rounded cursor-pointer mb-2 ${selectedConnector === c.id ? 'bg-blue-50 border-blue-200 border' : 'bg-gray-50'}`}
                        >
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs text-gray-500">{c.phone || 'No phone'}</div>
                            <div className={`text-xs mt-1 ${c.status === 'READY' ? 'text-green-600' : 'text-red-500'}`}>
                                {c.status}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Channels List */}
                <div className="w-3/4 bg-white p-4 rounded shadow">
                    <div className="flex justify-between mb-4">
                        <h3 className="font-semibold">Channels</h3>
                        {/* <button className="btn-secondary text-sm"><FaPlus /> Add Channel</button> */}
                    </div>

                    {channels.length === 0 && <div className="text-gray-500 text-center py-8">No channels added yet.</div>}

                    <div className="space-y-3">
                        {channels.map(src => (
                            <div key={src.id} className="border rounded p-3 flex justify-between items-center">
                                <div>
                                    <div className="font-medium">{src.title}</div>
                                    <div className="text-sm text-gray-500">ID: {src.channelId}</div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setImportModal({ isOpen: true, sourceId: src.id });
                                            setPreviewData(null);
                                        }}
                                        className="btn-primary text-sm flex items-center gap-2"
                                    >
                                        <CloudDownload size={16} /> Import History
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Import Modal */}
            {importModal.isOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4">Import History</h2>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">From Date</label>
                                <input
                                    type="date"
                                    className="input w-full"
                                    value={importConfig.fromDate}
                                    onChange={e => setImportConfig({ ...importConfig, fromDate: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">To Date</label>
                                <input
                                    type="date"
                                    className="input w-full"
                                    value={importConfig.toDate}
                                    onChange={e => setImportConfig({ ...importConfig, toDate: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Mode</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="mode"
                                        value="INVENTORY"
                                        checked={importConfig.mode === 'INVENTORY'}
                                        onChange={e => setImportConfig({ ...importConfig, mode: e.target.value })}
                                    />
                                    Inventory (Create Listings)
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="radio"
                                        name="mode"
                                        value="DRAFT_ONLY"
                                        checked={importConfig.mode === 'DRAFT_ONLY'}
                                        onChange={e => setImportConfig({ ...importConfig, mode: e.target.value })}
                                    />
                                    Drafts Only
                                </label>
                            </div>
                        </div>

                        {previewData && (
                            <div className="mb-6 bg-gray-50 p-4 rounded border">
                                <h4 className="font-bold text-sm mb-2">Preview Results ({previewData.items.length})</h4>
                                <div className="max-h-40 overflow-y-auto text-sm space-y-2">
                                    {previewData.items.map((item: any) => (
                                        <div key={item.messageId} className={`p-2 rounded ${item.mapped ? 'bg-green-50' : 'bg-red-50'}`}>
                                            <div className="flex justify-between">
                                                <span>#{item.messageId} {new Date(item.date).toLocaleDateString()}</span>
                                                <span className={item.mapped ? 'text-green-600' : 'text-red-600'}>
                                                    {item.mapped ? item.action : item.reason}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">{item.textPreview}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setImportModal({ isOpen: false, sourceId: null })}
                                className="btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handlePreview}
                                disabled={loading}
                                className="btn-secondary"
                            >
                                {loading ? 'Loading...' : 'Preview'}
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={!previewData}
                                className="btn-primary"
                            >
                                Start Import
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
