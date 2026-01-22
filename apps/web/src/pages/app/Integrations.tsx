import React, { useState, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
import { useLang } from '../../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { ApiClient } from '../../services/apiClient';
import {
    Plug, Settings, TestTube
} from 'lucide-react';
import { INTEGRATION_DEFS } from './IntegrationEditor';

interface Integration {
    id: string;
    type: string;
    isActive: boolean;
    createdAt: string;
    config?: Record<string, any>;
}

export const IntegrationsPage = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const navigate = useNavigate();
    const [integrations, setIntegrations] = useState<Integration[]>([]);

    useEffect(() => {
        loadIntegrations();
    }, []);

    const loadIntegrations = async () => {
        try {
            const res = await ApiClient.get<Integration[]>('integrations');
            if (res.ok) setIntegrations(res.data);
        } catch (e) {
            console.error('Failed to load integrations:', e);
        }
    };

    const toggleActive = async (type: string, isActive: boolean) => {
        try {
            const res = await ApiClient.post(`integrations/${type}/toggle`, { isActive });
            if (res.ok) {
                showToast(isActive ? t('integrations.toast_enabled') : t('integrations.toast_disabled'), 'success');
                loadIntegrations();
            } else {
                throw new Error(res.message);
            }
        } catch (e: any) {
            showToast(e.message, 'error');
        }
    };

    const getIntegrationStatus = (type: string) => {
        return integrations.find(i => i.type === type);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="panel p-6">
                <div className="flex items-center gap-3">
                    <Plug size={24} className="text-gold-500" />
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('integrations.title')}</h1>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">{t('integrations.subtitle')}</p>
                    </div>
                </div>
            </div>

            {/* Integrations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {INTEGRATION_DEFS.map(integration => {
                    const Icon = integration.icon;
                    const status = getIntegrationStatus(integration.type);

                    return (
                        <div key={integration.type} className="panel p-6 flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 rounded-lg bg-gold-500/20 flex items-center justify-center shrink-0">
                                    <Icon size={24} className="text-gold-500" />
                                </div>

                                {status && (
                                    <button
                                        onClick={() => toggleActive(integration.type, !status.isActive)}
                                        className={`px-3 py-1 rounded text-xs font-bold ${status.isActive
                                            ? 'bg-green-500/20 text-green-500'
                                            : 'bg-gray-500/20 text-gray-500'
                                            }`}
                                    >
                                        {status.isActive ? t('integrations.active') : t('integrations.inactive')}
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 mb-6">
                                <h3 className="font-bold text-lg text-[var(--text-primary)]">{integration.name}</h3>
                                <p className="text-sm text-[var(--text-secondary)] mt-2">{integration.description}</p>
                            </div>

                            <button
                                onClick={() => navigate(`/integrations/${integration.path}`)}
                                className="btn-secondary w-full py-2 text-sm flex items-center justify-center gap-2"
                            >
                                <Settings size={16} /> {t('integrations.configure')}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
