import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useLang } from '../../contexts/LanguageContext';
import {
    Share2, Mail, Webhook, Table, MessageCircle
} from 'lucide-react';

export const IntegrationsLayout = () => {
    const { t } = useLang();

    const navItems = [
        { path: '/integrations', end: true, label: t('integrations.all') || 'All', icon: null },
        { path: '/telegram', label: 'Telegram', icon: MessageCircle }, // Cross-link
        { path: '/integrations/meta', label: 'Meta Pixel', icon: Share2 },
        { path: '/integrations/sendpulse', label: 'SendPulse', icon: Mail },
        { path: '/integrations/webhook', label: 'Webhooks', icon: Webhook },
        { path: '/integrations/sheets', label: 'Google Sheets', icon: Table },
    ];

    return (
        <div className="flex flex-col md:flex-row gap-6 h-full">
            {/* Sidebar */}
            <div className="w-full md:w-64 flex-shrink-0">
                <div className="panel p-4 h-full">
                    <h2 className="text-lg font-bold mb-4 px-2">Integrations</h2>
                    <nav className="space-y-1">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    end={item.end}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive
                                            ? 'bg-gold-500/10 text-gold-500 font-medium'
                                            : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]'
                                        }`
                                    }
                                >
                                    {Icon && <Icon size={18} />}
                                    <span>{item.label}</span>
                                </NavLink>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1">
                <Outlet />
            </div>
        </div>
    );
};
