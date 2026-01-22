import React, { useState, useEffect } from 'react';
import { Data } from '../../../services/data';
import { Scenario, Bot } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { ScenarioBuilder } from '../../../pages/app/ScenarioBuilder';
import { MenuDesigner } from './MenuDesigner';

export { MenuDesigner } from './MenuDesigner';
export type { ScenarioEditorProps, MenuDesignerProps } from './types';

/**
 * AutomationEditor
 * 
 * Combines Scenario Editor and Menu Designer in one cohesive module.
 */
export const AutomationEditor = ({ botId }: { botId: string }) => {
    const [tab, setTab] = useState<'SCENARIOS' | 'MENU'>('SCENARIOS');
    const [bot, setBot] = useState<Bot | null>(null);

    useEffect(() => {
        const loadBot = async () => {
            const bots = await Data.getBots();
            const found = bots.find(b => b.id === botId);
            setBot(found || null);
        };
        loadBot();
    }, [botId]);

    if (!bot) {
        return <div className="p-8 text-center text-[var(--text-secondary)]">Loading...</div>;
    }

    return (
        <div className="flex flex-col h-full">
            {/* Tab Switcher */}
            <div className="flex border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-6">
                <button
                    onClick={() => setTab('SCENARIOS')}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${tab === 'SCENARIOS'
                            ? 'border-gold-500 text-[var(--text-primary)]'
                            : 'border-transparent text-[var(--text-secondary)]'
                        }`}
                >
                    Scenario Builder
                </button>
                <button
                    onClick={() => setTab('MENU')}
                    className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${tab === 'MENU'
                            ? 'border-gold-500 text-[var(--text-primary)]'
                            : 'border-transparent text-[var(--text-secondary)]'
                        }`}
                >
                    Menu & Commands
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {tab === 'SCENARIOS' && <ScenarioBuilder botId={botId} />}
                {tab === 'MENU' && <MenuDesigner bot={bot} />}
            </div>
        </div>
    );
};
