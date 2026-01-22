import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { SystemSettings } from '../../../types';
import { MessageCircle, Megaphone, Search } from 'lucide-react';
import { useToast } from '../../../contexts/ToastContext';
import { useLang } from '../../../contexts/LanguageContext';

export const IntegrationsTab = () => {
    const { showToast } = useToast();
    const { t } = useLang();
    const [settings, setSettings] = useState<SystemSettings>({});

    useEffect(() => { Data.getSettings().then(setSettings); }, []);

    const save = async () => {
        await Data.saveSettings(settings);
        showToast(t('integrations.toast_saved'));
    };

    const updateInteg = (platform: 'wa' | 'ig', field: string, value: any) => {
        setSettings(prev => ({
            ...prev,
            integrations: {
                ...prev.integrations,
                [platform]: { ...prev.integrations?.[platform], [field]: value }
            }
        } as any));
    };

    return (
        <div className="space-y-8 animate-slide-up max-w-2xl">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-medium text-[var(--text-primary)]">{t('integrations.title')}</h3>
                <button onClick={save} className="btn-primary">{t('btn.save')}</button>
            </div>

            {/* WhatsApp */}
            <div className="panel p-6 border-green-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <MessageCircle className="text-green-500" size={24} />
                    <h4 className="font-bold text-[var(--text-primary)]">WhatsApp Cloud API</h4>
                </div>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={settings.integrations?.wa?.isEnabled || false} onChange={e => updateInteg('wa', 'isEnabled', e.target.checked)} />
                        Enable Integration
                    </label>
                    <input className="input font-mono text-xs" placeholder="Access Token" value={settings.integrations?.wa?.credentials?.accessToken || ''} onChange={e => updateInteg('wa', 'credentials', { ...settings.integrations?.wa?.credentials, accessToken: e.target.value })} />
                    <input className="input font-mono text-xs" placeholder="Phone Number ID" value={settings.integrations?.wa?.credentials?.accountId || ''} onChange={e => updateInteg('wa', 'credentials', { ...settings.integrations?.wa?.credentials, accountId: e.target.value })} />
                </div>
            </div>

            {/* Instagram */}
            <div className="panel p-6 border-pink-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <MessageCircle className="text-pink-500" size={24} />
                    <h4 className="font-bold text-[var(--text-primary)]">Instagram Graph API</h4>
                </div>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={settings.integrations?.ig?.isEnabled || false} onChange={e => updateInteg('ig', 'isEnabled', e.target.checked)} />
                        Enable Integration
                    </label>
                    <input className="input font-mono text-xs" placeholder="Access Token" value={settings.integrations?.ig?.credentials?.accessToken || ''} onChange={e => updateInteg('ig', 'credentials', { ...settings.integrations?.ig?.credentials, accessToken: e.target.value })} />
                    <input className="input font-mono text-xs" placeholder="Page ID" value={settings.integrations?.ig?.credentials?.accountId || ''} onChange={e => updateInteg('ig', 'credentials', { ...settings.integrations?.ig?.credentials, accountId: e.target.value })} />
                </div>
            </div>

            {/* SendPulse */}
            <div className="panel p-6 border-blue-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <Megaphone className="text-blue-500" size={24} />
                    <h4 className="font-bold text-[var(--text-primary)]">SendPulse</h4>
                </div>
                <div className="space-y-3">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <input type="checkbox" checked={settings.integrations?.sendpulse?.isEnabled || false} onChange={e => updateInteg('sendpulse' as any, 'isEnabled', e.target.checked)} />
                        Enable Integration
                    </label>
                    <input className="input font-mono text-xs" placeholder="Client ID" value={settings.integrations?.sendpulse?.config?.clientId || ''} onChange={e => updateInteg('sendpulse' as any, 'config', { ...settings.integrations?.sendpulse?.config, clientId: e.target.value })} />
                    <input className="input font-mono text-xs" placeholder="Client Secret" type="password" value={settings.integrations?.sendpulse?.config?.clientSecret || ''} onChange={e => updateInteg('sendpulse' as any, 'config', { ...settings.integrations?.sendpulse?.config, clientSecret: e.target.value })} />
                    <input className="input font-mono text-xs" placeholder="Address Book ID" value={settings.integrations?.sendpulse?.config?.addressBookId || ''} onChange={e => updateInteg('sendpulse' as any, 'config', { ...settings.integrations?.sendpulse?.config, addressBookId: e.target.value })} />
                </div>
            </div>

            {/* AutoRia */}
            <div className="panel p-6 border-orange-500/20">
                <div className="flex items-center gap-3 mb-4">
                    <Search className="text-orange-500" size={24} />
                    <h4 className="font-bold text-[var(--text-primary)]">AutoRia Integration</h4>
                </div>
                <div className="space-y-3">
                    <input className="input font-mono text-xs" placeholder="API Key (use 'TEST' for mock)" value={settings.autoriaApiKey || ''} onChange={e => setSettings({ ...settings, autoriaApiKey: e.target.value })} />
                    <p className="text-xs text-[var(--text-secondary)]">Required for search and imports. Use 'TEST' to enable mock mode.</p>
                </div>
            </div>
        </div>
    );
};
